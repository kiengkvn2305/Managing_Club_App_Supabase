# Project structure

Project type: fullstack monorepo. The runtime currently consists of a Laravel 12 HTTP application in `backend/` and a Vite HTML/CSS/Vanilla JavaScript SPA in `frontend/`. `scripts/` starts the local stack; `compose.yaml` describes the MySQL/PHP development path.

## Entry points and layers

- Frontend entry: `frontend/index.html` → `frontend/src/main.js` → `frontend/src/app.js`. `app.js` owns hash routing, loading state, event delegation and page orchestration. Page renderers and module dialogs are separate JavaScript files.
- Backend entry: `backend/public/index.php` → Laravel bootstrap → `backend/routes/web.php`. All application HTTP APIs are under `/api/v1`; middleware provides auth, active-account and club-tenant context.
- Backend layers: controllers (API orchestration), Form Requests (validation), Eloquent models/resources (persistence/serialization), policies (authorization), services (transactions and domain rules), migrations (schema), and feature tests.
- Supabase target entry: `frontend/src/main.js` remains unchanged as the browser entry; `frontend/src/supabase-api.js` is the target data/auth adapter. `supabase/migrations/` is the database boundary.

## Functional areas

Authentication/profile; multi-club access and invitations; club/team/member/board management; finance and dues; inventory; activities/training/attendance; matches/lineups/stats; discovery/friendly matches; polls; recruitment; sponsorship; discipline; Excel import/export; PWA/Capacitor shell.

## Runtime-reachable target files

`frontend/index.html`, `frontend/src/main.js`, `frontend/src/app.js`, `frontend/src/api.js`, `frontend/src/supabase-api.js`, `frontend/src/state.js`, `frontend/src/pages.js`, the feature page/dialog modules, `frontend/public/manifest.webmanifest`, and `frontend/public/sw.js`.

The Laravel source was the migration baseline and is removed from Project 2 after the Supabase cutover boundary; its behavior is preserved in the migration artifacts and Git history. It is not a runtime dependency.
