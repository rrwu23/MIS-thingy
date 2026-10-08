// The student's own hub: student-home.html, the page behind the front door's student
// door (index.html, app.js).
//
// Who is signed in is not asked of the backend: the student door wrote the username it
// signed in with into sessionStorage, and this file reads it back — the same key app.js
// writes (SIGNED_IN_STUDENT_KEY) and the same key transactionview.js reads for the
// student's own history page, kept in sync by hand, the way STUDENT_USERNAME_KEY is kept
// between sessionstorage.js and transactionview.js. The balance is asked for as the card
// opens rather than when a button on it is pressed — the box stands on the card with the
// dots in it until that read answers — and Sign out is the one thing this card sends that
// ends something instead of reading something.
//
// The figure in the box is not asked of a balance route of its own. It is the balance the
// last row of this student's own transaction history ended on, read from the very route the
// door left on the card opens a page onto (transaction-view-student.html,
// transactionview.js) — every row of a history carries the balance the account stood at
// after that transaction, so the last row recorded is where the account stands now, and
// nothing is added up here:
//
//   GET https://api.rongrongwu.com/transaction-student-history?student=<username>
//   -> [{"user": "Rongrong Wu", "amount": 100, "type": "BONUS BUCKS", "date": null,
//        "memo": null, "detailedreason": "Birthday Bonus", "balance": 100}, …
//       {"user": "Rongrong Wu", "amount": 25, …, "balance": 235}]   (checked live: the rows
//      come back oldest first, and that last row's balance is the figure
//      GET /get-balance?student= answers with — 235 for that student, the same figure this
//      page used to ask that route for)
//
// Sign out is the other route this card knows, and it is the same one the admin's hub
// posts: POST /logout. Its summary in openapi.json says Logoutadmin, but the cookie it
// empties is the student's own session — kept in the browser as student_session_id, a name
// of its own that the Cloudflare Pages Function functions/api/[[path]].js gives the backend's
// one session_id for the student's door, so a browser can be signed in as an admin and as a
// student at the same time — and checked live with curl it answers 200 with that cookie
// emptied even when no session was sent, so there is no student session for it to turn away.
// There is therefore no student logout of its own to wait for.
//
// This file is the page's own script, so the readers it needs are kept here rather than
// shared: studentpicker.js, jobrotation.js, transactionview.js and sessionstorage.js do
// the same, and no page ever loads two of them.

// The student this browser signed in as. Kept in sync with SIGNED_IN_STUDENT_KEY in
// app.js, which writes it, and in transactionview.js, which reads it for the history.
const SIGNED_IN_STUDENT_KEY = 'student_login';

// Where one student's transactions are read from: the history route the door on the card
// opens a page onto, in the ?student= query every other student route in the API takes. It
// answers the rows of that account, oldest first, each carrying the balance the account
// ended it on — and the last of them is the balance this page draws. Kept in sync by hand
// with STUDENT_HISTORY_URL and HISTORY_URL in transactionview.js, which reads the same
// route for the same student's history page.
// Every route below is asked of this site's own origin —
// `${API_ORIGIN}/transaction-student-history`, and '/api' once the page is on the deployed
// site — where the Cloudflare Pages Function functions/api/[[path]].js fetches the same
// route from the API and hands the answer back, the session cookie included. apibase.js,
// loaded before this file on every page, carries that origin and says why the API is no
// longer asked by its own hostname (a SameSite=lax cookie cannot cross from bonurabank.ca to
// rongrongwu.com). What follows API_ORIGIN is the API's own route, unchanged.
const HISTORY_URL = `${API_ORIGIN}/transaction-student-history`;

// The fields a transaction may carry its ending balance in, most likely first — the same
// list transactionview.js fills the history page's last column from. The route is untyped,
// openapi.json promises nothing about a record, so the figure is looked for rather than
// trusted; GET /transaction-student-history sends it as "balance" (checked live).
const BALANCE_KEYS = ['ending_balance', 'balance_after', 'end_balance', 'balance'];

// Ending the session: POST /logout, the route the admin's own hub posts as well. Kept in
// sync by hand with LOGOUT_URL in app.js — one route, written out in the two files that
// post it, the way the session keys are.
const LOGOUT_URL = `${API_ORIGIN}/logout`;

// The header that tells the Cloudflare Pages Function (functions/api/[[path]].js) which session
// this POST /logout is giving up, since the route's name is the same for the admin's hub and the
// student's: 'student' hands the call the student's own student_session_id and leaves the admin's
// session_id — which the same browser may also hold — standing. Kept in sync by hand with
// SESSION_ROLE_HEADER in that Function, the way the routes above are.
const SESSION_ROLE_HEADER = 'X-Session-Role';
const SESSION_ROLE_STUDENT = 'student';

// The front door, index.html — the sign-in card. That is where a browser that has just
// given up its session belongs, since the card holds nothing but the signing in; kept in
// sync with SIGN_IN_URL in app.js, which sends the admin's hub the same way.
const SIGN_IN_URL = '/index.html';

// How long the sentence that says what just happened is left standing before the browser
// is handed back to the sign-in card — the same moment app.js gives the admin's own.
const REDIRECT_DELAY_MS = 900;

// The card: the name in the greeting, the two doors on it, the balance box and the
// figure in it, the status line under the doors, and Sign out at the foot.
const studentNameField = document.getElementById('studentname');
const studentBalanceBox = document.getElementById('studentbalance');
const studentBalanceFigure = document.getElementById('studentbalancefigure');
const studentStatus = document.getElementById('studentstatus');
const addTransactionDoor = document.getElementById('addtransaction');
const viewHistoryDoor = document.getElementById('viewhistory');
const signOutButton = document.getElementById('signout');

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

// Both doors switched off the way the history page switches its Refresh off: aria-disabled,
// which styles.css greys out and makes unclickable, plus no tab stop. It is what the hub does
// with no student behind it, since there is neither a type menu nor a history of nobody's to
// open — the two pages refuse on their own when they are reached with no session, but the hub
// does not offer what it knows cannot be walked. Sign out is deliberately left alone: it ends
// whatever session this browser is holding, which is a real thing to do even when it holds no
// student.
function lockDoor() {
    addTransactionDoor?.setAttribute('aria-disabled', 'true');
    addTransactionDoor?.setAttribute('tabindex', '-1');
    viewHistoryDoor?.setAttribute('aria-disabled', 'true');
    viewHistoryDoor?.setAttribute('tabindex', '-1');
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

// The page starts itself: the greeting is filled in as the page opens from the username the
// front door stored, and the balance is read straight after it, into the box that is already
// standing on the card. There is nothing to read for without a name, so the door is switched
// off, the box is taken off the card — the dots in the markup would never become a figure —
// and the status line explains what is missing instead.
if (studentStatus) {
    const student = signedInStudent();

    if (student) {
        if (studentNameField) {
            studentNameField.textContent = student;
        }

        showStudentBalance(student);
    } else {
        if (studentBalanceBox) {
            studentBalanceBox.hidden = true;
        }

        showStudentMessage(studentStatus, 'No student is signed in on this browser, so there is no account to show. Sign in with the student door on the front page.', true);
        lockDoor();
    }
}

// The balance of the student this browser signed in as, in the box on the card — read off
// the last row of that student's own transaction history, the route the door above it opens
// a page onto. The card makes this read as it opens, so there is no button to put in the
// waiting state: the dots the box is drawn with are what stands in for the round trip. A
// read that failed puts the box away rather than leaving the figure of the read before
// standing there as if it were current, and since there is no button to press again, the
// status line asks for the page itself to be reloaded — a reload is what asks this again.
async function showStudentBalance(student) {
    showStudentMessage(studentStatus, `Reading the transactions recorded for “${student}”, for the balance the last one ended on…`, false);

    try {
        const balance = await studentBalance(student);

        // A student the backend has recorded nothing for has no last row, so there is no
        // figure to draw: the box goes away and the line under the door says why, the same
        // way the history page says it. A zero is not written there in its place — a zero is
        // a balance, and this is the absence of one.
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

        showStudentMessage(studentStatus, `The balance on “${student}” could not be read from the transaction history API. Reload this page to ask again.`, true);
    }
}

// Sign out: POST /logout — the route the admin's own hub posts (app.js, LOGOUT_URL), and the
// one route that ends a session, whichever of the front door's two doors opened it. The student's
// session is its own cookie in the browser — student_session_id, the name the Cloudflare Pages
// Function functions/api/[[path]].js keeps it under (see the note at the head of this file) — so
// the request says SESSION_ROLE_HEADER: student, and the Function hands this call the student's
// cookie and not the admin's, whose own session_id stays standing. The username the student door
// stored is given up here as well, so the hub behind the sign-in card cannot open on a student who
// has just left. The confirmed student of the transaction flow (STUDENT_USERNAME_KEY,
// sessionstorage.js) is deliberately left alone: that is an admin's choice about whose transaction
// is being filled in, and not this page's to clear.
signOutButton?.addEventListener('click', async function () {
    // One sign-out at a time: the button goes grey and unclickable for the round trip, the
    // same .btn[aria-disabled="true"] state the two forms are put in while they wait.
    signOutButton.setAttribute('aria-disabled', 'true');
    showStudentMessage(studentStatus, 'Signing this student out…', false);

    try {
        const response = await fetch(LOGOUT_URL, {
            method: 'POST',
            credentials: 'include', // carry the session cookie out with it
            // This one route is shared with the admin's hub, so its name alone cannot say whose
            // session is being ended; this header tells the Function to end the student's own
            // student_session_id and to leave the admin's session_id — if this browser holds one —
            // standing.
            headers: { [SESSION_ROLE_HEADER]: SESSION_ROLE_STUDENT }
        });

        if (!response.ok) {
            console.error('Logout error:', response.status);
            showStudentMessage(studentStatus, `Sign out failed (${response.status}) — the session is still open, so this student is still signed in.`, true);
            signOutButton.removeAttribute('aria-disabled');   // nothing was given up: let them try again
            return;
        }

        sessionStorage.removeItem(SIGNED_IN_STUDENT_KEY);
        showStudentMessage(studentStatus, 'Signed out — taking you back to the sign-in card…', false);

        // Deliberately not re-enabled on this path: the session is gone, so a second press
        // while the front door is on its way would only sign out nobody.
        window.setTimeout(function () {
            window.location.href = SIGN_IN_URL;
        }, REDIRECT_DELAY_MS);
    } catch (error) {
        console.error('Network Error:', error);
        showStudentMessage(studentStatus, 'Network error — the logout API could not be reached, so this student is still signed in.', true);
        signOutButton.removeAttribute('aria-disabled');
    }
});
