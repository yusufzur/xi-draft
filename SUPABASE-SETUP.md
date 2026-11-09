# Enable accounts and cloud saves

Cloud accounts are optional. Guest progress keeps using browser `localStorage`; signing in adds a private cloud backup and career dashboard. The included client-side statistics are game records, not tamper-proof competition results.

## Supabase setup

1. Create a Supabase project and keep its database and Auth region appropriate for your users and privacy obligations.
2. In Supabase **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates three user-owned tables and enables row-level security on each.
3. In **Authentication → Providers → Email**, enable email sign-in and confirmation. Use a strong minimum password length (the UI requires 10 characters), configure reasonable signup/sign-in rate limits, and set the production site URL and exact redirect URLs. Add your Netlify URL, including `https://`, and any local test URL you actually use.
4. In **Authentication → URL Configuration**, set the Site URL to the production origin and allow only the exact origins you operate. Do not add wildcard redirect URLs.
5. Replace the privacy/terms draft placeholders, make the notices accurate, and obtain any required review. Then copy the Supabase **Project URL** and **publishable/anon key** into `supabase-config.js`, set `legalDocumentsReady: true`, and set `termsVersion`/`privacyVersion` to the versions actually published. New account acceptance records those version IDs in Supabase Auth user metadata. These client values are public by design. **Never put a service-role key, database password, or other secret in this folder, HTML, JavaScript, Netlify public environment variables, or browser code.**
6. Deploy the folder to Netlify over HTTPS. The included `_headers` file sets browser security headers. Confirm the deployed response headers and the correct Supabase Auth redirect URL before sharing the site.
7. Test two separate accounts: each must see only its own save/drafts/cup history; account A must not read, modify, or delete account B's rows. Test sign-up confirmation, password reset in Supabase's configured email flow, sign-out, and data deletion before launch.

The website does not persist passwords. Supabase Auth manages sign-in tokens in the browser, and database row-level security restricts saved rows to `auth.uid()`. This is a sensible baseline for private casual game saves, not a guarantee against client tampering. Do not use these client-submitted records for prizes, rankings, payments, or anti-cheat decisions without moving scoring and validation to a trusted server.

## Account data

- `game_saves`: the current game state, including draft and tournament progress.
- `drafts`: the formation and selected public player IDs for each finished XI; used to count most-drafted players.
- `cup_runs`: cup outcome, number of matches won, and completion date.

These tables are private per account. **Download my data** exports the active game state, saved XI records, and cup history as a JSON file. The **Delete cloud game data** action deletes the account's saves, drafts, and cup history, and clears the active game save on that device. It does not close/delete the user's Supabase Auth account. Before launch, provide a monitored contact and a documented process to fulfill account deletion requests as well.

If a user signs in on a device with a different local save, the app asks which active save to keep. Cup history is not replaced by this choice. Guest/local browser data is not uploaded until the person signs in.

## Private localhost account test

`supabase-config.js` contains the project URL, its browser-safe publishable key, and a local-test flag. The app permits the test sign-up form only when opened on `localhost` or `127.0.0.1`; the flag does not unlock the form on the Netlify domain. To test locally, serve this folder at `http://localhost:8771`, then add `http://localhost:8771/**` to Supabase **Authentication → URL Configuration → Redirect URLs**. Sign-up confirmation links return to the local app. Use only an account you control and a unique password. Do not publish or share a local test build as a public sign-up service while the legal pages are drafts.
