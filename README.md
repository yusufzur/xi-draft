# XI Draft

An unofficial, browser-based football squad draft and match simulator. Build a 15-player squad from the Turkish Süper Lig, Europe's top five domestic leagues and UEFA competition clubs, then play friendlies or a simulated cup campaign.

**Play locally:** `python3 -m http.server 8000`, then open <http://localhost:8000>.

## Features

- Draft an 11-player starting lineup in a 4-3-3 or 4-2-3-1, then choose a goalkeeper, defender, midfielder and forward for the bench.
- Get five randomized options per pick, with more weight given to players rated 76 or higher.
- Play simulated matches in 15-minute periods, select tactics and make up to five substitutions at breaks. Substituted players cannot return.
- Enter a Süper Lig cup or a UEFA Champions League, Europa League or Conference League simulation.
- Review live match scorers, overall campaign top-scorer and top-assister tables, and a separate list of your own squad's contributions.
- Keep drafts, match progress, substitutions and tournament history in browser `localStorage`; optional Supabase accounts can sync progress when configured.
- Install the responsive app as a Progressive Web App on supported devices.

## Player and competition data

This repository includes a generated 2026/27 player and competition snapshot. Where present, player ratings are taken from EA's public FC 27 ratings page. Players without an EA match have **estimated** ratings, which are labeled in the game. EA's ratings page and bundled portrait URLs may not reflect the final in-game release; roster and league snapshots can also be incomplete or change during the season.

UEFA entrants are based on the published participant snapshot. Fixtures, match results, standings and player goals/assists are simulated for gameplay and are not official records. Season-table context is calculated from available ESPN score feeds, not official standings.

See [GLOBAL-DATA-SOURCES.md](GLOBAL-DATA-SOURCES.md) for source details, known limitations and snapshot regeneration instructions.

## Run and deploy

This is a static site: there is no package install or build step.

1. Start a local server with `python3 -m http.server 8000`.
2. Visit <http://localhost:8000> in a browser. The service worker, local saves and responsive layout can be tested from this origin.
3. To deploy, publish the project directory with a static host such as Netlify. The included `_headers` file provides the site's HTTP security headers; verify them on the deployed site.

## Optional Supabase accounts

Guest play and local saving work without an account. To set up cloud saves:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql).
2. Configure Supabase Auth email sign-in, confirmation URLs, rate limits and allowed origins; review row-level security and account deletion behavior.
3. Copy `supabase-config.example.js` to `supabase-config.js`, then set the Supabase project URL and **publishable** client key. `supabase-config.js` is git-ignored intentionally.
4. Keep `localTestMode` false for public hosting. Set `legalDocumentsReady` true and provide the actual terms/privacy version identifiers only after the legal pages are complete and reviewed.

The browser key is public by design; never add a Supabase service-role/secret key, database password or other credential to browser code or a public repository. Read [SUPABASE-SETUP.md](SUPABASE-SETUP.md) before enabling accounts. The bundled privacy and terms pages still contain draft placeholders and are **not ready for public account registration**; complete the [publication checklist](PUBLICATION-CHECKLIST.md) before enabling cloud sign-up.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | App shell, responsive interface and visual styling |
| `app.js` | Draft state, match simulation, substitutions, tournaments and local saves |
| `players-2026-27.js`, `global-data-2026-27.js` | Player pool and generated season/competition snapshot |
| `scripts/import-global-data.py` | Regenerate the global data snapshot from public source feeds |
| `account.js`, `supabase/` | Optional Supabase account and data-storage integration |
| `service-worker.js`, `manifest.webmanifest`, `icons/` | Offline caching and installable PWA assets |
| `GLOBAL-DATA-SOURCES.md` | Data sourcing, rating disclosures and simulation limitations |
| `SUPABASE-SETUP.md`, `PUBLICATION-CHECKLIST.md` | Account setup and pre-publication checks |

## Rights and attribution

XI Draft is an independent fan project and is not affiliated with or endorsed by EA SPORTS, EA SPORTS FC, UEFA, ESPN, the Turkish Football Federation, the Süper Lig, any club, or Transfermarkt. Names, ratings, portraits, crests and other referenced materials may be subject to third-party rights. Public availability is not a license; review permissions and applicable data-use terms before redistributing or deploying the project. No software or data license is granted by this repository unless one is added separately.
