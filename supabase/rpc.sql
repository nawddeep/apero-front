-- ============================================================
-- APÉRO — Supplemental migrations (run AFTER the main schema SQL)
-- ============================================================
-- Adds:
--   1. orders.attendee_data  (attendee details captured at checkout)
--   2. create_order_service  (atomic order + order_items + inventory reserve)
--   3. release_order_inventory (used when payment fails / order cancelled)
--
-- IMPORTANT:
--   * These functions run as SECURITY INVOKER so Row Level Security still
--     protects every table. Only privileged callers (the Supabase
--     service-role backend) can execute them; anon/authenticated clients
--     are blocked by RLS because customers have no INSERT/UPDATE policies
--     on orders/order_items/ticket_types.
--   * ALL prices are recomputed from ticket_types.price inside the
--     function. Client-supplied amounts are NEVER trusted.
--   * Ticket quantity is reserved atomically (`UPDATE ... FOR UPDATE`
--     guards) so simultaneous purchases cannot oversell.
-- ============================================================


-- 1) attendee_data on orders -------------------------------------
alter table public.orders
  add column if not exists attendee_data jsonb not null default '[]'::jsonb;


-- 2) create_order_service -----------------------------------------
create or replace function public.create_order_service(
  p_user_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_attendee_data jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_tt public.ticket_types%rowtype;
  v_item jsonb;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_subtotal numeric(12,2);
  v_order_id uuid;
  v_updated_count integer;
  v_items jsonb := '[]'::jsonb;
begin
  if p_user_id is null
     or p_event_id is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
  then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select * into v_event
    from public.events
   where id = p_event_id
     for update;

  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status <> 'published' then raise exception 'EVENT_NOT_AVAILABLE'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_qty is null or v_qty <= 0 or v_qty > 999 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_tt
      from public.ticket_types
     where id = (v_item ->> 'ticket_type_id')::uuid
       for update;

    if v_tt.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
    if v_tt.event_id is distinct from p_event_id then raise exception 'TICKET_NOT_FOUND'; end if;
    if v_tt.status <> 'active' then raise exception 'TICKET_INACTIVE'; end if;
    if v_tt.sales_start is not null and v_tt.sales_start > now() then
      raise exception 'TICKET_SALES_NOT_STARTED';
    end if;
    if v_tt.sales_end is not null and v_tt.sales_end < now() then
      raise exception 'TICKET_SALES_ENDED';
    end if;
    if v_qty > (v_tt.total_quantity - v_tt.sold_quantity) then
      raise exception 'INSUFFICIENT_INVENTORY';
    end if;

    update public.ticket_types
       set sold_quantity = sold_quantity + v_qty,
           updated_at = now(),
           status = case
                      when sold_quantity + v_qty >= total_quantity
                        then 'sold_out'::public.ticket_type_status
                      else status
                    end
     where id = v_tt.id
       and sold_quantity + v_qty <= total_quantity;

    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then raise exception 'INSUFFICIENT_INVENTORY'; end if;

    v_subtotal := v_qty * v_tt.price;
    v_total := v_total + v_subtotal;
    v_items := v_items || jsonb_build_object(
      'ticket_type_id', v_tt.id,
      'name', v_tt.name,
      'quantity', v_qty,
      'unit_price', v_tt.price,
      'subtotal', v_subtotal,
      'admission_count', v_tt.admission_count
    );
  end loop;

  insert into public.orders (user_id, event_id, total_amount, currency, status, attendee_data)
  values (p_user_id, p_event_id, v_total, 'INR', 'pending', p_attendee_data)
  returning id into v_order_id;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price, subtotal)
  select
    v_order_id,
    (v_item ->> 'ticket_type_id')::uuid,
    (v_item ->> 'quantity')::integer,
    tt.price,
    (v_item ->> 'quantity')::integer * tt.price
  from jsonb_array_elements(p_items) v_item
  join public.ticket_types tt on tt.id = (v_item ->> 'ticket_type_id')::uuid;

  -- Flip event to sold_out when no active inventory remains.
  update public.events
     set status = 'sold_out', updated_at = now()
   where id = p_event_id
     and status = 'published'
     and not exists (
       select 1
         from public.ticket_types tt
        where tt.event_id = p_event_id
          and tt.status = 'active'
          and tt.sold_quantity < tt.total_quantity
     );

  return jsonb_build_object(
    'order_id', v_order_id,
    'event_id', p_event_id,
    'total_amount', v_total,
    'currency', 'INR',
    'status', 'pending',
    'items', v_items
  );
end;
$$;

grant execute on function public.create_order_service(uuid, uuid, jsonb, jsonb) to service_role;


-- 3) release_order_inventory ---------------------------------------
create or replace function public.release_order_inventory(p_order_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select event_id into v_event_id
    from public.orders
   where id = p_order_id
     for update;

  if v_event_id is null then return false; end if;

  -- Return reserved units to inventory.
  update public.ticket_types tt
     set sold_quantity = greatest(tt.sold_quantity - oi.quantity, 0),
         updated_at = now(),
         status = 'active'
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.ticket_type_id = tt.id
     and tt.sold_quantity > 0;

  -- Mark the order failed (kept for audit).
  update public.orders
     set status = 'failed', updated_at = now()
   where id = p_order_id
     and status in ('pending', 'paid');

  -- Re-open the event if any active ticket type has free inventory.
  update public.events
     set status = 'published', updated_at = now()
   where id = v_event_id
     and status = 'sold_out'
     and exists (
       select 1
         from public.ticket_types tt
        where tt.event_id = v_event_id
          and tt.status = 'active'
          and tt.sold_quantity < tt.total_quantity
     );

  return true;
end;
$$;

grant execute on function public.release_order_inventory(uuid) to service_role;


-- 4) Delete ticket holders of an order (used when a payment fails
--    after holders were created in a partial/retry path).
create or replace function public.delete_order_ticket_holders(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.ticket_holders th
   using public.order_items oi
   where oi.order_id = p_order_id
     and oi.id = th.order_item_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.delete_order_ticket_holders(uuid) to service_role;