# System Patterns — Bonura bank

## High-level architecture

```
 Browser (static pages on Cloudflare Pages, e.g. www.bonurabank.ca)
        │  fetch(`${API_ORIGIN}/<route>`, { credentials: 'include' })
        ▼
   API_ORIGIN = '/api'   (apibase.js decides this)
        │  same-origin request, session_id cookie rides along
        ▼
 Cloudflare Pages Function  functions/api/[[path]].js
        │  fetches https://api.rongrongwu.com/<route>
        │  (same method, headers incl. browser Cookie, body)
        ▼
 Backend API  https://api.rongrongwu.com   (FastAPI)
        │  answers status + headers + Set-Cookie
        ▲
 Function hands the answer straight back, Set-Cookie included
```

## Why the `/api` proxy exists (the single most important design decision)
- `POST /login` returns `set-cookie: session_id=...; HttpOnly; SameSite=lax; Secure`, with
  **no `Domain`** → host-only on `api.rongrongwu.com`. `SameSite=lax` means a browser
  stores and returns that cookie only for pages on the same **site** (`rongrongwu.com`).
- Served from `mis.rongrongwu.com` / `rongrongwu.com` the app worked. Served from
  `www.bonurabank.ca` it did **not**: `bonurabank.ca` and `rongrongwu.com` are different
  sites, so the login's `Set-Cookie` was refused as third-party and every protected read
  returned `401 {"detail": "Not logged in"}` — the cookie was visible in the browser's
  list but no page request ever carried it.
- **Fix:** pages ask the API on **their own origin** (`/api/<route>`), and the Cloudflare
  Function at `functions/api/[[path]].js` proxies to the real API. The cookie then belongs
  to the page's hostname and the whole exchange is first-party — no third-party cookie to
  refuse and no CORS to satisfy.
- `apibase.js` is the other half: it exposes `API_ORIGIN` (`'/api'` when served from a real
  host; the API's own URL when opened from `file://` / localhost, where no Function exists).

## Page map (admin flow)
| Page | Opened by | Script |
| --- | --- | --- |
| `index.html` | — (front door / sign-in card) | `app.js` |
| `home.html` | sign-in success | `app.js` |
| `addaccount.html` | hub "Add student" | `app.js` |
| `remove.html` | hub "Remove student" | `app.js` + `studentpicker.js` |
| `students.html` | hub "View students" | `app.js` |
| `transaction1.html` | hub "Add transaction" | `sessionstorage.js` |
| `transaction-middle.html` | continue on `transaction1.html` | `sessionstorage.js` |
| `transaction_bonus.html` | type menu → Bonus | `app.js` |
| `transaction_fines.html` | type menu → Fine | `app.js` |
| `transaction_spending.html` | type menu → Expense | `app.js` |
| `transaction-other.html` | type menu → Others | `app.js` |
| `transaction-view-middle.html` | hub "View student transaction history" | `sessionstorage.js` + `studentpicker.js` |
| `transaction-view.html` | Next on the history middle page | `transactionview.js` (`data-history="admin"`) |
| `approve_transactions.html` | hub "Approve transactions" | `app.js` |
| `job_rotation.html` | hub "Rotate jobs" | `jobrotation.js` |
| `salary.html` | hub "Pay salaries" | `payroll.js` (`data-payroll="salary"`) |
| `rent.html` | hub "Pay rent" | `payroll.js` (`data-payroll="rent"`) |

## Page map (student flow)
| Page | Opened by | Script |
| --- | --- | --- |
| `student-home.html` | landing card "Student sign in" | `studenthome.js` |
| `transaction_student_middle.html` | student hub "submit transactions" | `app.js` (`data-flow="student"`) |
| `transaction_student_bonus.html` | student type menu → Bonus | `app.js` (`data-flow="student"`) |
| `transaction_student_fines.html` | type menu → Fine | `app.js` (`data-flow="student"`) |
| `transaction_student_spending.html` | type menu → Expense | `app.js` (`data-flow="student"`) |
| `transaction_student_other.html` | type menu → Others | `app.js` (`data-flow="student"`) |
| `transaction-view-student.html` | student hub "View transaction history" | `transactionview.js` (`data-history="student"`) |

## Key design patterns
### 1. One script, many pages — with a one-word switch
- `app.js` is loaded by many pages and gates its sections on which elements exist
  (`getElementById(...)` may be `null`; guards use `?.`).
- Where two pages are near-identical, one script serves both and the page says which it is
  with a single `<body>` attribute:
  - `data-flow="student"` — the student transaction pages differ from the admin's
    by exactly: **who** the row is for (`GET /current-student` vs. the `sessionStorage`
    pick), the **write** route (`POST /add-transaction-submit` vs.
    `POST /transaction-record`), the wording ("submitted"/"submission" vs.
    "recorded"/"row"), and the **hub** a finished page returns to (`student-home.html` vs.
    `home.html`). A page with no `data-flow` is the admin flow; a page nobody vouched for
    refuses to write.
  - `data-history="admin|student"` — the two history pages; only the admin page gets the
    sixth (actions) column and the delete/edit routes; the student page reads
    `GET /transaction-student-history`.
  - `data-payroll="salary|rent"` — the two money pages differ only by route
    (`POST /pay-salary` vs. `POST /pay-rent`) and the noun/verb of their sentences.

### 2. Session handling
- The session lives **only** in the backend's `session_id` cookie — never in a page.
- Every authenticated request sends `credentials: "include"`.
- The admin the session belongs to is read with `GET /current-admin`; the student with
  `GET /current-student`.
- `sessionStorage` is used **only** to carry a picked student between steps of the
  multi-page transaction flow:
  - `student_username` — the first picked student (read by the pages after).
  - `selected_students` — the whole pick, in order.
  - `selected_student_<name>` — one key per picked student, all holding the same mark
    (`"shared"`), because those students share one transaction written one row each.
  - `student_login` — the student sign-in username, written by `app.js`, read by
    `studenthome.js` and `transactionview.js` (kept in sync by hand).

### 3. Permission probe + Y/N confirm
- **Permission probe:** protected flows prove the session by POSTing an **empty** body to
  `POST /adduser` (`ADMIN_CHECK_URL` / `PERMISSION_URL` / `JOB_PERMISSION_URL` /
  `PAYROLL_PERMISSION_URL`). It cannot create an account (no fields), so it changes nothing
  while revealing whether the session holds.
- **Re-check:** the probe is asked **as the page loads** (buttons start greyed) and
  **again** just before the action leaves the page.
- **Y/N dialog:** the app's own Yes/No overlay guards irreversible actions.

### 4. Routes are constants
- Each script names its routes once, as `const XXX_URL = \`${API_ORIGIN}/route\``, and uses
  them everywhere, so the route strings and the comments about them stay in one place.
- **Shared routes are deliberately redeclared per script** (e.g. every script that needs
  `current-admin` declares its own `CURRENT_ADMIN_URL`), because a page loads exactly one
  page script and the scripts share no module system. Keep these copies in sync by hand.

### 5. Comments are the documentation (a house rule)
- Every function carries a header comment with **Input / Output / Action / Role**, and
  every page/section has long prose comments explaining *why*. This verbose-comment style
  is intentional and is the primary way the codebase records intent. Match it.

## HTML / DOM conventions
- Scripts find elements by **id** (`getElementById`) and gate work on presence.
- Status lines are `role="status" aria-live="polite"`, often with a `data-empty` attribute
  holding the "in progress" sentence shown before the first answer.
- Tables: the students roster (`.roster__table`) ranks rows by **balance ascending**
  (smallest first); the history table is a different table and is not uppercased.
- The transaction type menu reuses `.btn--door` links (four equal choices, none commits).
