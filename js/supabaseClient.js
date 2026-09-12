/* js/supabaseClient.js — shared Supabase client for the APÉRO customer site.
   Uses the PUBLIC publishable key only (client-safe). The secret
   service-role key is NEVER used in the browser. */
(function () {
  'use strict';

  // The URL + publishable key of the shared Supabase project.
  // Both a.com (customer) and b.com (admin) point at this same project.
  var SUPABASE_URL = "https://ijgfebtxleogmmeejkpe.supabase.co";
  var SUPABASE_KEY = "sb_publishable_3oV3l3tigsDaxY7m0wrwIA_Pd6ItU8a";

  var auth = window.supabase && window.supabase.createClient;
  if (!auth) {
    throw new Error('@supabase/supabase-js (UMD) must be loaded before js/supabaseClient.js');
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
})();