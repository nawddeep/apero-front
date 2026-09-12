// lib/supabase.js
// Server-side Supabase access. The service-role client is used for all
// privileged operations (order/payment/refund writes + admin lookups).
// It is ONLY ever created on the server — the service-role key is never
// exposed to browsers.
'use strict';

const { createClient } = require('@supabase/supabase-js');

let _adminClient = null;

function getAdminClient() {
  if (_adminClient) return _adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server.');
  }
  _adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _adminClient;
}

// Resolve a customer's access token (sent as Bearer in API calls) to a user.
async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const { data, error } = await getAdminClient().auth.getUser(accessToken);
  if (error || !data || !data.user) return null;
  const meta = (data.user.user_metadata || {});
  return {
    id: data.user.id,
    email: data.user.email,
    name: meta.name || meta.full_name || null,
    phone: meta.phone || null
  };
}

// Server-side admin check (authoritative; RLS also enforces on direct reads).
async function isAdminUser(userId) {
  if (!userId) return false;
  const { data, error } = await getAdminClient()
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

module.exports = { getAdminClient, getUserFromToken, isAdminUser };