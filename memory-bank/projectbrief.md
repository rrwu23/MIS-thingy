# Project Brief — Bonura bank

## What this is
**Bonura bank** is a school banking web app. It is a *static frontend* — plain HTML,
CSS and vanilla JavaScript, no framework and no build step — that a school uses to run a
in-school "bank" of student accounts:

- An **admin** (a teacher/staff member) signs in and manages the bank: creates student
  accounts, gives students jobs, pays salaries, charges rent, records bonus/fine/expense
  transactions, approves or declines transactions students have submitted, rotates jobs,
  views students and their balances, and looks at any student's transaction history.
- A **student** signs in and looks at their own balance and transaction history, and
  submits transactions for an admin to approve.

The frontend is deployed on **Cloudflare Pages** and talks to a separate REST API at
**`https://api.rongrongwu.com`** (a FastAPI-style backend — its errors are JSON
`{"detail": "..."}` and it publishes an `openapi.json`).

## Core requirements / goals
1. Serve every page as a static asset from `*.pages.dev` / a custom hostname
   (e.g. `www.bonurabank.ca`).
2. Reach the backend API with a real, logged-in **session** (the `session_id` cookie),
   which is why the `/api` reverse-proxy Function exists (see `systemPatterns.md`).
3. Two distinct, role-gated flows — **admin** and **student** — built from the same
   pages and scripts wherever possible, told apart by a single word on the `<body>`
   (`data-flow`, `data-history`, `data-payroll`).
4. No client state beyond the session cookie and a little `sessionStorage` used only to
   carry a picked student between steps of the multi-page transaction flow.

## Scope boundaries
- **In scope:** the static pages (`*.html`), their scripts (`app.js`, `sessionstorage.js`,
  `transactionview.js`, `studentpicker.js`, `jobrotation.js`, `payroll.js`,
  `studenthome.js`), the shared stylesheet (`styles.css`), the API origin shim
  (`apibase.js`) and the Cloudflare Pages Function (`functions/api/[[path]].js`).
- **Out of scope:** the backend API itself (lives elsewhere, at
  `https://api.rongrongwu.com`). This repo only *calls* it.
- **No tests, no linter, no package manager** are committed. Historically there were Node
  test harnesses (`check.js`, `date-check.js`, `approve-check.js`, `student-check.js`),
  referenced in commit messages, but they are **not present in the repo**.

## Source of truth for scope
This file plus `productContext.md`. When in doubt, the code's own extensive comments (see
the house rule below) are the most detailed record of intent.

## Repository
- GitHub: `https://github.com/rrwu23/MIS-thingy.git` (remote `origin`, branch `main`).
- There is a local branch `backup-before-reset` alongside `main`.
- The root `README.md` is a joke ("i suck at programming trust me") and carries no
  information — ignore it as documentation.
