# Progress — Bonura bank

## Current status
The app is **feature-complete for the flows it was built for** and is deployed on
Cloudflare Pages against the live API. Both flows (admin and student) are wired end to
end. The latest work (approvals) is finished and committed.

## What works
### Admin flow
- **Sign in** on the landing card → admin hub with greeting (`GET /current-admin`) and
  **Sign out** (`POST /logout`).
- **Add student** (`addaccount.html`): username typed twice (safety check), birthday
  validated (ISO shape), `POST /adduser`, then back to the hub.
- **Remove student** (`remove.html`): type-ahead picker limited to the admin's own
  students, Y/N confirm, `POST /remove-student`.
- **View students** (`students.html`): a four-column table (name, balance, job,
  job-salary) ranked by balance ascending, with a Refresh and a "last read" stamp;
  assembled from `GET /current-admin`, `GET /getuser`, `GET /get-balance`,
  `GET /get-jobs`.
- **Add transaction**: pick one or many students (`transaction1.html`) → type menu
  (`transaction-middle.html`) → one of four type pages, each fetching its
  `/reasons/{slug}` list and writing `POST /transaction-record` (one row per picked
  student).
- **View student transaction history**: name → `transaction-view.html`, a table from
  `GET /gettransactions`, with per-row **edit** and **delete** (`POST /remove`) on the
  admin page only.
- **Approve transactions** (`approve_transactions.html`): submissions from
  `GET /getsubmittransaction`, **Approve** (`POST /approve {id}`) and **Decline**
  (`POST /decline {id}`), each behind a Y/N confirm. A head row over the list
  (`#approvalshead`) names the five values in order — Student | Date | Type | Amount |
  Memo — and is shown only while there are rows; the ending balance is drawn nowhere
  on the page, in the head row or in a row. The head row and the rows are cut on **one
  shared six-column grid** (`--approvals-columns`), so each name stands exactly over its
  value, and the pair sits in `.approvals__frame`, which scrolls them sideways together
  in a narrow window. The page's card is the app's only wide one (60rem vs 46rem).
  Verified by headless-Chrome measurement (see `activeContext.md`).
- **Rotate jobs** (`job_rotation.html`): per-student job boxes with `/get-jobs`
  suggestions, `POST /set-jobs`.
- **Pay salaries** (`salary.html`) / **Pay rent** (`rent.html`): the admin's students
  listed and pre-ticked, `POST /pay-salary` / `POST /pay-rent` one student at a time.

### Student flow
- **Student sign in** through the landing card (`POST /student-login`) → student hub.
- Student hub (`student-home.html`): greeting + **balance** read from the last row of
  `GET /transaction-student-history` as the page opens, and **Sign out**.
- **Submit transactions**: student type menu + four student type pages
  (`data-flow="student"`) → `POST /add-transaction-submit`.
- **View transaction history**: `transaction-view-student.html`, read-only
  (`GET /transaction-student-history`).

### Shared infrastructure
- `/api` proxy Function (`functions/api/[[path]].js`) making the session cookie
  first-party; `apibase.js` choosing the origin.
- One theme/stylesheet (`styles.css`), the teal card design, Comfortaa.

## What's left / not built
- **No automated tests in the repo.** The harnesses named in old commits are gone.
- No `wrangler.toml`, `package.json`, or CI config in the repo.
- Any further routes/features depend on the backend; the frontend has historically been
  written slightly ahead of the API (with prose comments noting a 404 until the route
  went live).

## Known issues / things to watch
1. **`styles.css` comment/version drift — fixed:** the header used to say the stylesheet was
   "at 25" while pages loaded `?v=26`; as of the approvals head-row change it read "at 27", and
   with the approvals column change it and the pages are now both at `styles.css?v=29`. Keep the
   header's N and the pages' N in step when either moves.
2. **Asset version drift:** every change to a shared asset (`app.js`, `styles.css`, …)
   must bump its `?v=` in all pages that load it. Forgetting leaves users on a 4-hour-old
   cache. Verify with `grep -rho '[a-z.]*js?v=[0-9]*\|styles.css?v=[0-9]*' *.html | sort -u`.
3. **Route constants are duplicated** across scripts on purpose (no modules). Changing a
   route means editing every script that declares it.
4. **`file://` cannot hold a session** — by design; use `wrangler pages dev` for local
   work that needs login.

## Evolution of decisions (recent history)
- Moved from asking the API by its own hostname → to the same-origin `/api` proxy, to fix
  the third-party (SameSite=lax) cookie failure on `www.bonurabank.ca`.
- Approvals moved from writing via `/transaction-record` → the dedicated `/approve` and
  `/decline` routes once the backend provided them.
- The students table was ranked by name → **by balance ascending**.
- The transaction flow's typed-username entry → a **click-to-pick box** of the admin's
  students (with multiple pick sharing one transaction).
- Balance on the student hub moved from a "View balance" door / `GET /get-balance` → read
  from the last row of the history as the page opens.
- Jobs rotate on its own page (`job_rotation.html`) rather than as chips on the hub.
- The add transaction flow was extended to the **student flow** (`data-flow="student"`)
  with `/add-transaction-submit` and the student hub.

## Version snapshot (verify before relying on it)
`apibase.js` v1 · `styles.css` v29 · `app.js` v36 · `sessionstorage.js` v6 ·
`transactionview.js` v10 · `studentpicker.js` v6 · `jobrotation.js` v5 ·
`payroll.js` v5 · `studenthome.js` v5

## How the approvals columns are verified (repeatable)
There is no test suite in the repo, so the alignment of the approvals head row and its rows is
proved with a throwaway headless-Chrome fixture (all of it under `/tmp`, so it must be re-created
from the notes in `activeContext.md`):
1. `/tmp/approvals-harness.html` — the approvals page's real markup with three hand-written rows.
2. `/tmp/measure.js` — on `load`, for `scrollLeft` 0, 150 and the far end, compares each
   `.approvals__label`'s rect against the same column's `.approvals__value` in every row and writes
   the report into `<pre id="measure">`.
3. `/tmp/build.py` — inlines the two into `/tmp/scroll-test.html` (the harness links the real
   `styles.css`).
4. `python3 /tmp/extract.py /tmp/scroll-<width>.html` — prints the report out of each DOM dump.
Run Chrome as
`'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new --disable-gpu
--no-sandbox --no-first-run --no-default-browser-check --user-data-dir=/tmp/prof-n
--force-device-scale-factor=1 --window-size=760,900 --virtual-time-budget=5000 --dump-dom
file:///tmp/scroll-test.html > /tmp/scroll-narrow.html`, backgrounded with a poll for the dump,
then `pkill -f 'user-data-dir=/tmp/prof-n'`. Every column must read `ALIGNED` at every offset.
