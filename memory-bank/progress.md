# Progress — Bonura bank

## Current status
The app is **feature-complete for the flows it was built for** and is deployed on
Cloudflare Pages against the live API. Both flows (admin and student) are wired end to
end. The latest work (approvals, then the two-session change that lets one browser hold an admin
and a student session at once) is finished and committed.

## What works
### Sessions
- **Admin and student signed in at once.** The API sets its one cookie, `session_id`, on both
  doors; the `/api` Function (`functions/api/[[path]].js`) keeps the student's in the browser
  under a second name, `student_session_id`, hands each call to the API under `session_id` with
  only the cookie that call is about, and renames the API's `Set-Cookie` back for the student's
  calls. Sign-out ends only the caller's own session — the student hub hints
  `X-Session-Role: student`. Verified with a stubbed-`fetch` test of the Function; see
  `systemPatterns.md` §2.

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
2. `/tmp/measure.js` — on `load`, reports two things into `<pre id="measure">`. **Alignment:** for
   `scrollLeft` 0, 150 and the far end, compares each `.approvals__label`'s rect against the same
   column's `.approvals__value` in every row. **Wrapping:** ranges over each visible value's own
   text node (the `sr-only` name is `position: absolute`, so it takes no room) and reads the line
   boxes it broke into — `lines=`, the widest line, the cell's own content width, its height and its
   `white-space`, flagging `*** OVERFLOWS ***` and (for a `nowrap` cell) `*** NOWRAP BUSTED ***`.
   **Columns:** prints the resolved `gridTemplateColumns` of the head row and of every row, and says
   whether they are all the same list — the one direct read of what each column's width really is.
3. `/tmp/build.py` — inlines the two into `/tmp/scroll-test.html` (the harness links the real
   `styles.css`).
4. `python3 /tmp/extract.py /tmp/scroll-<width>.html` — prints the report out of each DOM dump.
Run Chrome as
`'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new --disable-gpu
--no-sandbox --no-first-run --no-default-browser-check --user-data-dir=/tmp/prof-n
--force-device-scale-factor=1 --window-size=760,900 --virtual-time-budget=5000 --dump-dom
file:///tmp/scroll-test.html > /tmp/scroll-narrow.html`, backgrounded with a poll for the dump,
then `pkill -f 'user-data-dir=/tmp/prof-n'`. Every column must read `ALIGNED` at every offset, and
nothing may read `OVERFLOWS` or `NOWRAP BUSTED`.

**What it last proved (2026-10-05, one commit after the change):** 30/30 `ALIGNED`, 0
`MISALIGNED`/`OVERFLOWS`/`NOWRAP BUSTED` across both widths, and `every row shares the head's track
list=YES`. The report also prints the **resolved** tracks (`getComputedStyle().gridTemplateColumns`),
which settles what the column widths actually are — measured at window widths 760, 1000, 1005, 1015,
1030, 1200, 1440 and 1920:

| track | resolved | constant? |
|---|---|---|
| Student | 104px (6.5rem) | yes — at every width, head and rows |
| Date | 176px (11rem) | yes |
| Type | 96px (6rem) | yes |
| Amount | 88px (5.5rem) | yes |
| Memo | 128px (its 8rem floor) … 155.625px | **the only one that moves** |
| Actions (buttons) | 184px (11.5rem) | yes |

- **Five of the six tracks never change**, and none of them depends on content — that is why a name
  and its value stay cut on one line (a 6-line memo does not widen its column, it wraps).
- **The Memo track is the window's one lever**, and its range is small: pinned at 128px for any
  window narrower than ≈1014px, then growing 1:1 with the frame until the frame itself stops at
  830px (the card caps at `60rem` = 960px and its padding takes the rest). So 128px → 155.625px, and
  no further. The relation is exactly `memo = frame.clientWidth − 27 − 648` (27 = the head row's
  24px padding + 3px transparent borders; 648 = the other five tracks), which is why the figure
  moves only 27.6px in total.
- **The tracks are `rem`, so "constant" is in `rem`, not in px** — at the browser's default 16px root
  (confirmed in the report) they are the px above; a different root font size scales all six.
- Two more facts worth keeping:
- **A long memo wraps inside its own column and the row grows taller instead of pushing its
  neighbours.** At 1440px the memo cell has 133.23px of content and broke into 3/3/5 lines (widest
  line 127.92px); at 760px it has 105.6px and broke into 3/4/6 (widest 100.77px). Row heights
  followed (91.13/91.13/137.75 at 1440px) — no value ever pushed the buttons out or ran under them.
- **The date's `white-space: nowrap` never breaks** (always `lines=1`) and the stamp — the widest
  single value on the page at 126.86px — is what sizes that column's 11rem.
- A long hyphenated student name is the one thing that *does* break across lines (row 2's
  "Liam Fitzgerald-Kowalski", 3 lines at 760px). That is `overflow-wrap: anywhere` doing its job:
  it breaks rather than overflowing, so the column holds.
