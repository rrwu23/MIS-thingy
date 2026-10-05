# API Routes — Bonura bank backend

Every route is asked of the API through this site's own origin: `${API_ORIGIN}/<route>`,
where `API_ORIGIN` is `'/api'` on the deployed site (the proxy Function forwards it to
`https://api.rongrongwu.com/<route>`), or the API's own host on `file://`/localhost.
All session-carrying calls send `credentials: "include"`.

Backend base: `https://api.rongrongwu.com` (FastAPI; errors are `{"detail": "..."}`).

| Method | Route | Used by | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | `index.html` (admin sign in), `login_admin` refs | Admin login; sets `session_id`. Reads `admin_name`, `password`. |
| POST | `/student-login` | `index.html` (Student sign in) | Student login; reads the same two boxes as the student's username/password. |
| POST | `/logout` | home hub, student hub | Clears `session_id` (Max-Age=0). Answers 200 even with no session. |
| POST | `/add-admin` | add-admin page | Creates an admin (not linked from the hub). |
| POST | `/adduser` | `addaccount.html`; **also the empty-body permission probe** for every protected flow | Creates a student account (`name`, `birthday`, `initialbalance`, `password`). Empty body reveals session validity without side effects. |
| GET | `/current-admin` | hub greeting, students page, pickers, payroll, job rotation, etc. | Names the admin behind the session cookie. |
| GET | `/current-student` | student transaction pages | Names the student behind the session cookie. |
| GET | `/getuser?supervisor=<admin>` | students table, pickers, payroll, job rotation | Lists the accounts supervised by an admin. |
| GET | `/get-balance?student=<name>` | (legacy; balance now read from history) | Reports a student's balance. |
| POST | `/remove-student` | `remove.html` | Deletes a student account (form field `removestudentname`). |
| GET | `/reasons/{slug}` | the four transaction type pages | The reason list for a type. Slugs: `bonus-bucks`, `bonura-bank-fines`, `ways-to-spend-bonura-bucks`. |
| POST | `/transaction-record` | admin type pages, history page edits, approvals (legacy) | Writes a transaction row: `date`, `amount`, `type`, `memo`, `name`. |
| POST | `/add-transaction-submit` | the student type pages | Submits a transaction for admin approval. |
| GET | `/getsubmittransaction` | `approve_transactions.html` | Lists transactions students have submitted. |
| POST | `/approve` | `approve_transactions.html` | Files a submission (`{id}`) into the transaction table and removes it from the list. |
| POST | `/decline` | `approve_transactions.html` | Removes a submission (`{id}`) without filing it. |
| GET | `/gettransactions?student=<name>` | `transaction-view.html` (admin history) | The transactions of one student. |
| GET | `/transaction-student-history?student=<name>` | `transaction-view-student.html`, `studenthome.js` | The signed-in student's own history (also the source of the hub balance). |
| POST | `/remove` | `transaction-view.html` | Deletes one transaction row by its id. |
| GET | `/get-jobs` | `job_rotation.html` | The list of jobs (and salaries) for suggestions. |
| POST | `/set-jobs` | `job_rotation.html` | Sends the student→job assignments. |
| POST | `/pay-salary` | `salary.html` | Pays one student the salary of their job. |
| POST | `/pay-rent` | `rent.html` | Charges one student rent (recorded at -200). |

## Notes
- Route strings live as `const *_URL` constants in each script (see `systemPatterns.md`
  §4 — copies are intentional). To audit the live set run:
  `grep -rho 'API_ORIGIN}/[a-z-]*' *.js | sort -u`
- The `?student=` / `?supervisor=` query shape is used consistently for the per-account
  reads.
- The API has an `openapi.json` (several comments reference it); a redirect on `/docs` is
  handled by the proxy (`redirect: 'manual'`).
- Historically some routes 404'd while the frontend was written ahead of the backend
  (e.g. `/getsubmittransaction`, `/add-transaction-submit`), and the prose comments once
  said so. As of the latest commits `/approve` and `/decline` are **live** and the stale
  404 prose has been removed.
