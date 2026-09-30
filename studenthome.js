// The student's own hub: student-home.html, the page behind the front door's student
// door (index.html, app.js).
//
// Nothing on this card is asked of the backend until View balance is pressed, and who is
// signed in is not asked of it at all: the student door wrote the username it signed in
// with into sessionStorage, and this file reads it back — the same key app.js writes
// (SIGNED_IN_STUDENT_KEY) and the same key transactionview.js reads for the student's own
// history page, kept in sync by hand, the way STUDENT_USERNAME_KEY is kept between
// sessionstorage.js and transactionview.js.
//
// The figure in the box is not asked of a balance route of its own. It is the balance the
// last row of this student's own transaction history ended on, read from the very route the
// hub's other door opens a page onto (transaction-view-student.html, transactionview.js) —
// every row of a history carries the balance the account stood at after that transaction,
// so the last row recorded is where the account stands now, and nothing is added up here:
//
//   GET https://api.rongrongwu.com/transaction-student-history?student=<username>
//   -> [{"user": "Rongrong Wu", "amount": 100, "type": "BONUS BUCKS", "date": null,
//        "memo": null, "detailedreason": "Birthday Bonus", "balance": 100}, …
//       {"user": "Rongrong Wu", "amount": 25, …, "balance": 235}]   (checked live: the rows
//      come back oldest first, and that last row's balance is the figure
//      GET /get-balance?student= answers with — 235 for that student, the same figure this
//      page used to ask that route for)
//
// This file is the page's own script, so the readers it needs are kept here rather than
// shared: studentpicker.js, jobrotation.js, transactionview.js and sessionstorage.js do
// the same, and no page ever loads two of them.

// The student this browser signed in as. Kept in sync with SIGNED_IN_STUDENT_KEY in
// app.js, which writes it, and in transactionview.js, which reads it for the history.
const SIGNED_IN_STUDENT_KEY = 'student_login';

// Where one student's transactions are read from: the history route the hub's other door
// opens a page onto, in the ?student= query every other student route in the API takes. It
// answers the rows of that account, oldest first, each carrying the balance the account
// ended it on — and the last of them is the balance this page draws. Kept in sync by hand
// with STUDENT_HISTORY_URL and HISTORY_URL in transactionview.js, which reads the same
// route for the same student's history page.
const HISTORY_URL = 'https://api.rongrongwu.com/transaction-student-history';

// The fields a transaction may carry its ending balance in, most likely first — the same
// list transactionview.js fills the history page's last column from. The route is untyped,
// openapi.json promises nothing about a record, so the figure is looked for rather than
// trusted; GET /transaction-student-history sends it as "balance" (checked live).
const BALANCE_KEYS = ['ending_balance', 'balance_after', 'end_balance', 'balance'];

// The card: the name in the greeting, the two doors, the balance box and the figure in
// it, and the status line under the doors.
const studentNameField = document.getElementById('studentname');
const studentBalanceBox = document.getElementById('studentbalance');
const studentBalanceFigure = document.getElementById('studentbalancefigure');
const studentStatus = document.getElementById('studentstatus');
const viewBalanceButton = document.getElementById('viewbalance');
const viewHistoryDoor = document.getElementById('viewhistory');

// The line the hub says everything on — the same one-paragraph shape showHomeMessage,
// showRosterMessage and showHistoryMessage write into their own blocks, so an error is
// the red variant of the same panel.
function showStudentMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// The student the front door signed in, or '' when this browser has none. Surrounding
// space comes off, because the name is shown to the student and goes into a query string.
function signedInStudent() {
    return (sessionStorage.getItem(SIGNED_IN_STUDENT_KEY) || '').trim();
}

// Both doors switched off the way the history page switches its Refresh off:
// aria-disabled, which styles.css greys out and makes unclickable, plus no tab stop. It
// is what the hub does with no student behind it, since there is no account to read a
// balance for and no history to open.
function lockDoors() {
    for (const door of [viewBalanceButton, viewHistoryDoor]) {
        door?.setAttribute('aria-disabled', 'true');
        door?.setAttribute('tabindex', '-1');
    }
}

// The first of the named fields a record carries a value in, or null when it carries none
// of them. The same reader app.js, sessionstorage.js, studentpicker.js and
// transactionview.js use: the routes are untyped, so a missing field has to be survived
// rather than trusted.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// Every transaction in a GET /transaction-student-history reply. The shapes accepted mirror
// historyRecords in transactionview.js exactly — that page draws this very answer, and this
// page takes the last row of it, so the two must agree on what a record is:
//   [{"date": …, "balance": …}, …]                                -> used as is
//   {"transactions": […]}, {"records": […]}, {"history": […]},
//   {"data": […]}, {"items": […]}                                 -> the inner list
//   {"date": …, "balance": …}                                     -> wrapped in an array
//   null / undefined / ""                                        -> []
// Only objects count as records: a transaction is a set of fields, so a bare string cannot
// be one, and anything else is dropped rather than read as a row of nothing.
function historyRecords(payload) {
    if (Array.isArray(payload)) {
        return payload.filter(isRecord);
    }

    if (payload === null || payload === undefined || payload === '' || typeof payload !== 'object') {
        return [];
    }

    for (const key of ['transactions', 'records', 'history', 'data', 'items']) {
        const nested = payload[key];

        if (Array.isArray(nested)) {
            return nested.filter(isRecord);
        }

        if (nested && typeof nested === 'object') {
            return historyRecords(nested);
        }
    }

    return [payload];
}

function isRecord(entry) {
    return entry !== null && typeof entry === 'object';
}

// The balance on one student's account: the balance the last transaction recorded for them
// ended on, as a number — or null when the backend lists no transaction at all, which is
// the one case where there is no row to take the figure from.
//
// The figure is read, never worked out: the last row the backend answered with is the last
// row written to the account, and the balance that row ended on is where the account stands.
// Nothing is added up, exactly as nothing is added up in the history table. The answer is
// untyped, so a numeric string is read as the number it is and anything else is an error
// rather than a zero, because a zero is a real balance and a misread one is not.
async function studentBalance(name) {
    const response = await fetch(`${HISTORY_URL}?${new URLSearchParams({ student: name })}`, {
        method: 'GET',
        credentials: 'include' // send the session cookie, like every other call
    });

    if (!response.ok) {
        throw new Error(`GET /transaction-student-history answered ${response.status}`);
    }

    const records = historyRecords(await response.json().catch(() => null));

    if (!records.length) {
        return null;
    }

    // The last row as it was answered: the route lists a student's transactions oldest
    // first — checked live, and it is the order the history page draws them in — so the last
    // one is the transaction the account ended on. No sorting is done here: a row's date may
    // be null (it is, for every row the route answers today), so the backend's own order is
    // the only order there is to trust.
    const value = firstField(records[records.length - 1], BALANCE_KEYS);
    const balance = typeof value === 'string' ? Number(value.trim()) : value;

    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
        throw new Error(`the last transaction recorded for "${name}" carries no balance`);
    }

    return balance;
}

// The page starts itself: the greeting is filled in as the page opens from the username
// the front door stored, and the balance is read when it is asked for. There is nothing
// to read for without a name, so the doors are switched off and the status line explains
// what is missing instead.
if (studentStatus) {
    const student = signedInStudent();

    if (student) {
        if (studentNameField) {
            studentNameField.textContent = student;
        }
    } else {
        showStudentMessage(studentStatus, 'No student is signed in on this browser, so there is no account to show. Sign in with the student door on the front page.', true);
        lockDoors();
    }
}

// View balance: the balance of the student this browser signed in as, in the box under
// the doors — read off the last row of that student's own transaction history, the route
// the other door opens a page onto. One read at a time — the button goes grey and
// unclickable for the round trip, the state every other button in the app is put in while
// it waits — and a read that failed puts the box away rather than leaving the figure of the
// read before standing there as if it were current.
viewBalanceButton?.addEventListener('click', async function () {
    const student = signedInStudent();

    if (!student) {
        showStudentMessage(studentStatus, 'No student is signed in on this browser, so there is no balance to read. Sign in with the student door on the front page.', true);
        return;
    }

    viewBalanceButton.setAttribute('aria-disabled', 'true');
    showStudentMessage(studentStatus, `Reading the transactions recorded for “${student}”, for the balance the last one ended on…`, false);

    try {
        const balance = await studentBalance(student);

        // A student the backend has recorded nothing for has no last row, so there is no
        // figure to draw: the box stays away and the line under the doors says why, the
        // same way the history page says it. A zero is not written there in its place — a
        // zero is a balance, and this is the absence of one.
        if (balance === null) {
            if (studentBalanceBox) {
                studentBalanceBox.hidden = true;
            }

            showStudentMessage(studentStatus, `The backend lists no transaction for “${student}”, so there is no last row to take a balance from.`, false);
            return;
        }

        if (studentBalanceBox) {
            studentBalanceBox.hidden = false;
        }

        if (studentBalanceFigure) {
            studentBalanceFigure.textContent = String(balance);
            // A balance below zero is the one red on the students table; the figure
            // carries it here too, in the red that reads on the box's pale surface.
            studentBalanceFigure.className = balance < 0 ? 'hub__balance--negative' : '';
        }

        showStudentMessage(studentStatus, `The balance on “${student}” is the one the last transaction recorded for them ended on.`, false);
    } catch (error) {
        console.error('Balance error:', error);

        if (studentBalanceBox) {
            studentBalanceBox.hidden = true;
        }

        showStudentMessage(studentStatus, `The balance on “${student}” could not be read from the transaction history API. Press View balance to ask again.`, true);
    } finally {
        viewBalanceButton.removeAttribute('aria-disabled');
    }
});
