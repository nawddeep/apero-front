# Supabase Auth Setup — Agent Instructions

You are setting up Supabase email/password authentication for this project.
The user will only provide two values: a **Supabase URL** and a **Supabase key** (either the newer **publishable key**, format `sb_publishable_...`, or the older **anon key**, a long JWT string — both work the same way for this setup).
You must handle everything else. **Skip Google/OAuth sign-in — email/password only, for now.**

> Note on key naming: Supabase is phasing out the `anon` key in favor of the `publishable` key (they carry the same low privileges and work identically for client-side auth). Newer projects will show a publishable key in the dashboard; older projects may still show an anon key. Either one works as a drop-in value here — no code changes needed based on which type the user pastes in.

Work through the steps below in order. Do not skip steps. Do not change any existing UI design — only add/modify logic needed to make auth work.

---

## Step 1 — Create the Supabase Client

Create a new file: `src/supabaseClient.js`

Requirements:
- Import `createClient` from `@supabase/supabase-js`
- Define two clearly-labeled placeholder variables the user can paste their values into
- Export a single Supabase client instance
- Keep the file minimal — no extra logic here

```js
import { createClient } from "@supabase/supabase-js";

// 🔑 PASTE YOUR SUPABASE URL HERE
const SUPABASE_URL = "{{SUPABASE_URL}}";

// 🔑 PASTE YOUR SUPABASE KEY HERE
// Accepts either the newer "publishable" key (starts with sb_publishable_...)
// or the older "anon" key (a long JWT string) — both work identically here.
const SUPABASE_KEY = "{{SUPABASE_KEY}}";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
```

If a `.env` file / environment variables are already used elsewhere in this project, prefer wiring `SUPABASE_URL` and `SUPABASE_KEY` to environment variables instead of hardcoded placeholders, and tell the user which env var names to set. Otherwise, use the placeholder format above.

Do not attempt to detect or validate which key type (publishable vs. anon) was pasted in — both are passed to `createClient` the same way with no extra logic required.

---

## Step 2 — Wire Up Sign Up and Sign In Logic

Connect the existing Sign In and Sign Up pages/components to Supabase Auth using the client from `src/supabaseClient.js`. **Do not change the UI/design** — only add the logic needed to make the forms functional.

### Sign Up
- Call `supabase.auth.signUp({ email, password })`
- Do **not** auto-login or redirect to a dashboard/home page immediately after signup
- Check the response:
  - If `data.session` is `null` (email confirmation required), do not redirect. Instead:
    - Redirect to the **Sign In** page
    - Pass the signed-up email along (via router state, a query param, or another simple method that fits this project's routing)
  - If there's an error, show a small error message under the form

### Sign In
- Call `supabase.auth.signInWithPassword({ email, password })`
- If sign-in succeeds and a real session exists → redirect to the Home page (`/`)
- If sign-in fails → show a small error message under the form
- If the page was reached via a redirect from Sign Up:
  - Pre-fill the email field with the email passed from Sign Up
  - Show a success banner above the form, e.g.:
    > "Your account has been created. Please check your email and verify your address before logging in."

### General error handling
- All Supabase errors should render as a small, unobtrusive message under the relevant form — not as alerts or console-only errors.

---

## Step 3 — Protect Private Pages

For any page that should only be visible to logged-in users:
- Check the session using `supabase.auth.getSession()`
- If no valid session exists, redirect the user to `/login`
- Only render the protected page content once a session is confirmed

---

## Step 4 — What NOT to Do (for now)

- Do **not** implement Google Sign-In or any OAuth provider yet.
- Do **not** wire up the "Continue with Google" button (leave it visually as-is, non-functional, if it exists).
- Do **not** alter layout, styling, or component structure beyond what's needed for the auth logic above.

---

## Deliverable

When done, show only the updated/created files:
- `src/supabaseClient.js`
- The updated Sign Up component/page
- The updated Sign In component/page
- Any updated "protected route" wrapper/component used for private pages

## Values the user will supply
- `SUPABASE_URL` — their project's Supabase URL
- `SUPABASE_KEY` — their project's publishable key (`sb_publishable_...`) or legacy anon key (JWT string) — either is acceptable

Everything else — client setup, signup/signin logic, email-confirmation handling, redirect logic, and route protection — should be fully implemented by the agent without further input.