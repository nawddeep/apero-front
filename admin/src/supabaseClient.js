/* admin/src/supabaseClient.js — shared Supabase client (loaded after the
   @supabase/supabase-js UMD build, which exposes window.supabase.createClient).
   Only the PUBLIC publishable key is used here — never the service-role key.
   When the admin portal is served from its own origin, point the Backend
   Services API at the Ap-ro server by setting on each page BEFORE admin.js:
       <script>window.APERO_API_BASE = "https://aperonight.fun";</script> */
(function () {
  'use strict';

  // 🔑 PASTE YOUR SUPABASE URL HERE
  const SUPABASE_URL = "https://ijgfebtxleogmmeejkpe.supabase.co";

  // 🔑 PASTE YOUR SUPABASE KEY HERE
  // Accepts either the newer "publishable" key (starts with sb_publishable_...)
  // or the older "anon" key (a long JWT string) — both work identically here.
  const SUPABASE_KEY = "sb_publishable_3oV3l3tigsDaxY7m0wrwIA_Pd6ItU8a";

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  window.supabaseClient = supabase;
})();