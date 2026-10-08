# Tech Context — Bonura bank

## Technologies in use
- **HTML5** — one file per page, all at the repo root (`*.html`).
- **CSS3** — a single shared stylesheet, `styles.css` (~68 KB), custom properties for the
  design tokens, Comfortaa webfont from Google Fonts.
- **Vanilla JavaScript (ES2017+)** — no framework, no bundler, no transpiler. Scripts are
  loaded with plain `<script src="..." defer>` tags.
- **Cloudflare Pages Functions** — `functions/api/[[path]].js` is an ES module
  (`export async function onRequest`) run by the Cloudflare edge as a catch-all reverse
  proxy to the API.
- **Backend API** — external, `https://api.rongrongwu.com` (FastAPI-shaped: JSON
  `{"detail": ...}` errors, an `openapi.json`, sessions via a `session_id` cookie).

## There is NO build step
- No `package.json`, no `node_modules`, no `wrangler.toml` in the repo root.
- No dependency install, no compile, no bundle. Edit a file, commit, deploy.
- Deployment is Cloudflare Pages: it serves the static files and picks up the
  `functions/` directory automatically as routes.

## How the code is organized
Flat, by role, all at the repository root (except the Function):

| File | Role |
| --- | --- |
| `*.html` | 25 pages — one per screen (see `systemPatterns.md` for the map). |
| `app.js` | The big shared script (~4,700 lines) loaded by most pages: sign-in card, add/remove student, home hub, students table, the reason/transaction pages, and the student-transaction flow. |
| `apibase.js` | Defines `API_ORIGIN` (`'/api'` on the deployed site, the real API host on `file://`/localhost). Loaded **first** on every page. |
| `sessionstorage.js` | The student picker + session handling for the admin transaction flow (`transaction1.html`, `transaction-middle.html`, `transaction-view-middle.html`). |
| `transactionview.js` | The transaction-history page script (both admin and student history pages). |
| `studentpicker.js` | The type-ahead student dropdown used by `remove.html`. |
| `jobrotation.js` | The `job_rotation.html` page. |
| `payroll.js` | The `salary.html` / `rent.html` pages (one script, two pages). |
| `studenthome.js` | The student hub `student-home.html`. |
| `styles.css` | The one stylesheet, loaded by every page. |
| `functions/api/[[path]].js` | The Cloudflare Pages Function reverse proxy to the API. |

## Loading order (important)
Every page loads, in `<head>`:
1. Google Fonts (Comfortaa)
2. `styles.css?v=N`
3. `apibase.js?v=1` — **always first among scripts**, so `API_ORIGIN` exists before any
   page script builds a route from it
4. the page's own script(s)

## Asset cache-busting convention
Assets are referenced as `file.js?v=N` / `styles.css?v=N`. The host sends assets with
`max-age=14400` (4 h), so **whenever a file changes you must bump its `?v=` number in
every page that loads it**, or browsers keep painting a stale copy.
Current versions (as of last update — verify with `grep -rho '?v=[0-9]*' *.html`):
- `apibase.js?v=1`
- `styles.css?v=28`
- `app.js?v=35`
- `sessionstorage.js?v=6`
- `transactionview.js?v=10`
- `studentpicker.js?v=6`
- `jobrotation.js?v=5`
- `payroll.js?v=5`
- `studenthome.js?v=6`

## Development setup
- **Serve locally with the Function:** `wrangler pages dev .` in the repo root — this runs
  the static pages *and* the `/api` Function together on localhost, exactly like the
  deployed site (so the login session works).
- **Open from disk (`file://`) or a plain local server:** `apibase.js` falls back to
  asking `https://api.rongrongwu.com` directly. Routes answer (they are public), but a
  session **cannot** be held from a `file://` page, because it is a third-party site to
  the API.
- **Syntax check:** there is no test runner; validate a script with
  `node --check <file>.js`. (Node is available in this environment.)

## Technical constraints
- The `session_id` cookie is `HttpOnly; SameSite=lax; Secure` with **no `Domain`**, so it
  is host-only for `api.rongrongwu.com`. A page on a *different site* (e.g.
  `bonurabank.ca`) cannot receive or send it — hence the `/api` proxy (see
  `systemPatterns.md`).
- The API's one session cookie, `session_id`, is handed out by **both** doors. So the `/api`
  Function keeps the student's session in the browser under a **second name**,
  `student_session_id`, apart from the admin's `session_id` — one browser can hold both at
  once. Each call is handed to the API under `session_id` (the student's cookie for the
  student-flow routes, the admin's otherwise), and the API's `Set-Cookie` is renamed back to
  `student_session_id` for the student's calls. Do not merge this back into one cookie, or the
  two sign-ins collide again.
- The proxy enforces a **15-second** API timeout (`API_TIMEOUT_MS`) and answers with a
  JSON `{"detail": ...}` on failure (504 on timeout, 502 on unreachable).
- `fetch` calls that need a session always send `credentials: "include"`.
- No TypeScript, no JSX, no imports between the page scripts — a shared helper is either
  in `app.js` or deliberately duplicated per file (each page loads only one page script;
  no page loads two of them).

## Tooling / Environment notes
- Platform: macOS (darwin). Working dir: `/Volumes/MacMini/rongrong/App1`.
- Git remote: `https://github.com/rrwu23/MIS-thingy.git`.
