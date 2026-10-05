# Active Context — Bonura bank

## Current focus (as of last session)
Finishing the **approvals** flow. The most recent work made the "Approve transactions"
page fully live:
- `GET /getsubmittransaction` loads the waiting submissions (one row each, oldest first).
- **Approve** now sends `POST /approve {id}` (previously it wrote via
  `/transaction-record`); the backend files the row and removes the submission.
- **Decline** sends `POST /decline {id}`.
- The stale prose that claimed these routes 404'd was removed, and `app.js` was bumped to
  `?v=33` across all pages that load it.

## Recent changes (last few commits, newest first)
- `approvals: /approve and /decline are live — drop the stale 404 prose` (app.js v33).
- `approve: send POST /approve {id} instead of writing via /transaction-record`.
- `Decline sends POST /decline with {id: <transaction id>}` (app.js v31).
- `Load approvals from the live GET /getsubmittransaction route` (app.js v30).
- Added the student flow: `transaction_student_middle.html` + the four
  `transaction_student_<type>.html` twins, all gated by `data-flow="student"`
  (app.js v29).
- Re-commented **every** function in `app.js` in the Input/Output/Action/Role house shape.

## Next steps / open items
- No obviously unfinished feature is recorded in the repo. Likely next work is whatever
  the backend adds or whatever the school asks for (per the project's short-iteration
  style).
- **Keep versions in sync:** the CSS header comment says the stylesheet is "at 25" but the
  pages load `styles.css?v=26`. That is a stale comment, not a bug — worth fixing the
  comment if `styles.css` is next touched.
- The Node test harnesses named in commit messages (`check.js`, `date-check.js`,
  `approve-check.js`, `student-check.js`) are **not in the repo**. If verification is
  needed, either re-create them or use `node --check` on the scripts.

## Active decisions & patterns to keep
- **All API calls go through `/api`** (`API_ORIGIN`), never straight to the API host in
  page scripts — the cookie must stay first-party.
- **Always send `credentials: "include"`** on session-bearing calls.
- **Every new/changed asset bumps its `?v=` number** in every page that loads it
  (`styles.css`, `app.js`, etc.), because assets are cached for 4 hours.
- **Protected flows: probe permission on load AND before the action; confirm irreversible
  actions with the Y/N dialog.**
- **Match the verbose comment style** — every function gets Input/Output/Action/Role, and
  prose explaining the *why* is expected.
- One script per page; shared helpers are either in `app.js` or intentionally duplicated
  per script (keep route constants in sync by hand).

## Important patterns & preferences
- The two flows (admin/student) are deliberately built from shared pages switched by a
  single `<body>` data attribute (`data-flow`, `data-history`, `data-payroll`) rather than
  duplicated files.
- Status is always spoken in plain words, including the API's own error sentence.
- `sessionStorage` carries only the picked student across the transaction flow steps.

## Learnings / insights
- The reason this app needed a proxy at all is the third-party-cookie / `SameSite=lax`
  problem once it moved to `www.bonurabank.ca`. Any change that makes page scripts call the
  API host directly would reintroduce the 401 problem on the deployed custom domain.
- `functions/api/[[path]].js` must hand back `Set-Cookie` **uncombined** (a `Headers`
  object can't hold multiple `Set-Cookie` lines) — the code splits/rebuilds them by hand.
  Keep that behavior if the Function is edited.
- The proxy has a 15-second timeout and answers a JSON `{"detail": ...}` so pages show a
  readable sentence rather than hanging.
