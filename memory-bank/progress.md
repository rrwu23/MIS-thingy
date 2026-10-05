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
  (`#approvalshead`) names the six values in order — Student | Date | Type | Amount |
  Memo | Ending balance — and is shown only while there are rows.
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
   "at 25" while pages loaded `?v=26`; as of the approvals head-row change it reads "at 27" and
   pages load `styles.css?v=27`. Keep the header's N and the pages' N in step when either moves.
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
`apibase.js` v1 · `styles.css` v27 · `app.js` v34 · `sessionstorage.js` v6 ·
`transactionview.js` v10 · `studentpicker.js` v6 · `jobrotation.js` v5 ·
`payroll.js` v5 · `studenthome.js` v5
