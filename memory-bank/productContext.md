# Product Context — Bonura bank

## Why this project exists
A school wants a lightweight, self-hosted "bank" to run its student reward economy
("Bonura Bucks"). Staff need to open accounts, hand out jobs and salaries, charge rent,
give bonuses, and levy fines — and students need to see their own balance and submit
requests. This frontend is the whole user-facing product; the money logic lives in the
API.

## The two users
### Admin (staff)
- Signs in on the landing card (`index.html`) → the **admin hub** (`home.html`).
- The hub is a grid of doors, each opening a page:
  - **Add transaction** → `transaction1.html` (pick one or many students) →
    `transaction-middle.html` (type menu: Bonus / Fine / Expense / Others) →
    `transaction_bonus.html` / `transaction_fines.html` / `transaction_spending.html` /
    `transaction-other.html`.
  - **Add student** → `addaccount.html`.
  - **Remove student** → `remove.html` (type-ahead picker + Y/N confirm).
  - **View students** → `students.html` (table of the admin's students ranked by balance,
    with job and job-salary).
  - **View student transaction history** → `transaction-view-middle.html` (name) →
    `transaction-view.html` (the table; admin may edit/delete rows).
  - **Approve transactions** → `approve_transactions.html` (submissions, Approve /
    Decline per row).
  - **Rotate jobs** → `job_rotation.html`.
  - **Pay salaries** → `salary.html`.
  - **Pay rent** → `rent.html`.
- **Sign out** at the foot of the hub cards.

### Student
- Signs in through the *same* landing card's **Student sign in** button
  (POST `/student-login`) → the **student hub** (`student-home.html`).
- The student hub has two doors:
  - **submit transactions** → `transaction_student_middle.html` (same four-type menu) →
    `transaction_student_bonus.html` / `transaction_student_fines.html` /
    `transaction_student_spending.html` / `transaction_student_other.html`
    (rows are *submitted* for approval, not recorded).
  - **View transaction history** → `transaction-view-student.html` (read-only).
- The hub also shows the student's **balance**, read as the page opens (from the last row
  of their history), and a **Sign out**.

## How it works (user experience)
- **One card per page.** Every page is a single centred card on a light teal canvas, with
  the bank's name across the top, a `← Home` tag, the page's own title/hint line, the
  page's content, a status line (`role="status" aria-live="polite"`), and a footnote.
- **Progressive status.** Buttons grey out during round trips; status lines say, in
  plain words, what the backend answered — including the API's own error sentence.
- **Confirmations.** Destructive / irreversible actions (remove student, approve, decline,
  paying) go through the app's own Y/N dialog before anything is sent.
- **Permission is re-checked.** Protected pages ask the backend for permission as they
  load *and again* at the moment of the action, because a session can expire while a page
  sits open.

## Design language
- One brand colour: **teal `#21ffda`** (`--accent`), which *is* the card's fill. Everything
  on a card is drawn in deeper "ink" tints of it (`--accent-ink`, `--accent-ink-soft`,
  `--accent-deep`) plus a red (`--danger-ink`) for errors.
- Controls are pale boxes with an ink outline (`.btn--door`, `.btn--ghost`, fields); the one
  committing button (`.btn--primary`) is the ink itself.
- Typeface: **Comfortaa** (Google Fonts; no OS ships it, so it is always a webfont).
- Full detail lives in the header comment of `styles.css`.

## Conventions worth knowing
- Pages are addressed **relatively** in scripts but **absolutely** in links
  (`href="/home.html"`), because they are served from a site root.
- A page's flow is declared once, on the `<body>`: `data-flow="student"` (student
  transaction pages), `data-history="admin|student"` (the two history pages),
  `data-payroll="salary|rent"` (the two money pages). The script branches on that word
  rather than being duplicated.
- A transaction card carries `data-reason-type` (which `/reasons/{slug}` list to fetch and
  whether amounts are signed) and `data-transaction-type` (the `type` column value the row
  is filed under).
