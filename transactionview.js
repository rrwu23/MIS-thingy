// The history flow's own page script, and it serves the two pages that carry the table:
//
//   transaction-view.html          the admin's page, behind the hub's "View student
//                                  transaction history" door. The page before it,
//                                  transaction-view-middle.html, has already asked the
//                                  backend whether the typed name is one of the
//                                  signed-in admin's own students, and has stored the
//                                  confirmed username in sessionStorage — the same file
//                                  the transaction flow stores it with,
//                                  sessionstorage.js, because it is exactly the same
//                                  question.
//   transaction-view-student.html  the student's own page, behind the student hub's
//                                  "View transaction history" door. Nothing is typed on
//                                  the page before it and nothing is confirmed there:
//                                  the student it shows is the one the front door signed
//                                  in — app.js — kept in sessionStorage under a key of
//                                  its own.
//
// The two pages are the same card, the same five columns and the same question about one
// account, so the script reads which of the two it is standing on off the page itself
// (OWN_HISTORY below) instead of being copied. What it asks, one route per page, with the
// student in the same ?student= query:
//
//   GET https://api.rongrongwu.com/gettransactions?student=<username>
//   GET https://api.rongrongwu.com/transaction-student-history?student=<username>
//
// One row per transaction, in the five columns the sketch draws: the date, the amount,
// the type, the memo, and the balance the account ended on.
//
// This file is the page's own script, so the readers it needs are kept here rather
// than shared: studentpicker.js, jobrotation.js and sessionstorage.js do the same, and
// no page ever loads two of them.

// Where the transactions of one student are read from, the admin's way in: the student
// goes in a ?student= query, the shape every other student route in the API takes
// (GET /get-balance?student=). The route is not in
// https://api.rongrongwu.com/openapi.json today and answers 404 {"detail": "Not Found"}
// when it is asked (checked live), so the page says what the backend answered rather
// than showing a table with no rows in it, which would read as "this student never had a
// transaction".
const ADMIN_HISTORY_URL = 'https://api.rongrongwu.com/gettransactions';

// The student's own way in: the transactions of the student this browser signed in as, in
// the same ?student= query, answered by the same five-column table — the same format as
// the admin's route, because it is the same question about the same records. The name is
// not typed on that page and not confirmed by the page before it: it is the account the
// student sign in on the front door went through with.
const STUDENT_HISTORY_URL = 'https://api.rongrongwu.com/transaction-student-history';

// Which of the two pages this script is standing on, which the page says about itself:
// transaction-view-student.html carries data-history="student" on its <body>, and
// transaction-view.html carries nothing of the sort. Everything that differs between the
// two hangs off this one word — whose username is read, and which route answers.
const OWN_HISTORY = document.body?.dataset.history === 'student';

const HISTORY_URL = OWN_HISTORY ? STUDENT_HISTORY_URL : ADMIN_HISTORY_URL;

// The route as it is written in a sentence, for the lines that name it out loud.
const HISTORY_ROUTE = OWN_HISTORY ? '/transaction-student-history' : '/gettransactions';

// The student whose history this is, on the admin's page: the username
// transaction-view-middle.html had the backend confirm. Kept in sync with
// STUDENT_USERNAME_KEY in sessionstorage.js — the same key, because it is the same
// student, and the transaction flow reads it back the same way.
const HISTORY_STUDENT_KEY = 'student_username';

// The student the student's own page belongs to: the account the front door's student
// sign in went through with, kept by app.js under the same key (SIGNED_IN_STUDENT_KEY
// there). A browser can hold both names at once — an admin can confirm a student for a
// transaction, and that student can then sign in without the admin flow forgetting them —
// so the two are kept apart rather than sharing one key.
const SIGNED_IN_STUDENT_KEY = 'student_login';

// The five columns, in the order the sketch draws them — the same order, and the same
// five words, as the head row the two pages that carry the table write out. Each column
// names the fields its value may arrive in, most likely first: the route is untyped,
// openapi.json promises nothing about the body, so a record is read with the same
// tolerance the other pages read /getuser and /get-balance with:
//   {"date": "2026/09/29/16/17", "amount": -10, "type": "fines", "memo": "third time",
//    "ending_balance": 225}
// numeric marks the two figures at the ends of a row: they are numbers written under
// each other, so they take the roster's .roster__amount cells — right-aligned in
// fixed-width digits — and the red for a figure below zero. date marks the one column
// that is re-cut rather than shown as it came: historyDate() draws it in the shape the
// head of the column names, YYYY/MM/DD HH:mm.
const HISTORY_COLUMNS = [
    {
        keys: ['date', 'created_at', 'timestamp', 'time'],
        className: 'history__date',
        date: true
    },
    {
        keys: ['amount', 'bonura_bucks', 'value', 'points'],
        className: 'roster__amount',
        numeric: true
    },
    {
        keys: ['type', 'category', 'kind'],
        className: 'history__type'
    },
    {
        keys: ['memo', 'note', 'notes'],
        className: 'history__memo'
    },
    {
        keys: ['ending_balance', 'balance_after', 'end_balance', 'balance'],
        className: 'roster__amount',
        numeric: true
    }
];

// What the page says where the student's name goes when there is nobody to name — on the
// admin's page the sentence transaction-middle.html puts on the page it opens with nobody
// behind it, cut down to the half of it a name can carry; on the student's own page the
// student who never signed in. The status line below spells the rest out either way.
const NO_STUDENT_TEXT = OWN_HISTORY
    ? 'No student signed in'
    : 'No student confirmed by the backend';

// The table the two pages carry and the line above it. A read that found no table to put
// an answer in does nothing at all, the way every other page's guard in this project
// works.
const historyStudent = document.getElementById('historystudent');
const historyRows = document.getElementById('historyrows');
const historyStatus = document.getElementById('historystatus');
const historyFrame = document.getElementById('historyframe');
const historyStamp = document.getElementById('historystamp');
const historyRefreshButton = document.getElementById('historyrefresh');

// One read at a time: a Refresh pressed while a slow answer is still on its way must
// not pile a second read up behind the first.
let historyReadRunning = false;

// The stored student, then the transactions recorded for them, then the rows. Anything
// that is not a table is spelled out on the status line above it, and the rows of the
// read before are dropped rather than left standing as if they were current.
async function readHistory() {
    if (!historyRows) return; // only the two history pages have the table
    if (historyReadRunning) return;

    // Whose history this is: on the admin's page the username the page before this one had
    // the backend confirm, and on the student's own page the student this browser signed
    // in as. Without one there is nothing to ask about, so the page says so and its
    // Refresh stays switched off until there is a name to read for.
    const student = sessionStorage.getItem(OWN_HISTORY ? SIGNED_IN_STUDENT_KEY : HISTORY_STUDENT_KEY);

    if (!student) {
        if (historyStudent) {
            historyStudent.textContent = NO_STUDENT_TEXT;
        }

        lockHistory();
        clearHistoryTable();
        showHistoryMessage(historyStatus, OWN_HISTORY
            ? `No student is signed in on this browser, so there is no history to read. Sign in with the student door on the front page.`
            : `No student was confirmed by the backend, so no transaction could be read. Go back one page and enter a name that exists.`, true);
        return;
    }

    if (historyStudent) {
        historyStudent.textContent = student;
    }

    historyReadRunning = true;
    historyRefreshButton?.setAttribute('aria-disabled', 'true'); // one read at a time
    showHistoryMessage(historyStatus, `Reading the transactions recorded for “${student}”…`, false);

    try {
        const response = await fetch(`${HISTORY_URL}?${new URLSearchParams({ student })}`, {
            method: 'GET',
            credentials: 'include' // send the session cookie, the admin's or the student's
        });

        // A route the backend does not have answers 404 with {"detail": "Not Found"}.
        // Spelling that out is the point: an empty table would say this student never
        // had a transaction, which is not what a missing route says.
        if (response.status === 404) {
            clearHistoryTable();
            showHistoryMessage(historyStatus, `The backend has no route for reading a student’s transactions yet — GET ${HISTORY_ROUTE} answered 404, so there is nothing to show for “${student}”. Nothing that has been recorded was changed.`, true);
            return;
        }

        if (!response.ok) {
            clearHistoryTable();
            showHistoryMessage(historyStatus, `The transactions of “${student}” could not be read — the backend answered ${response.status}. Press Refresh to ask again.`, true);
            return;
        }

        const records = historyRecords(await response.json().catch(() => null));

        if (!records.length) {
            clearHistoryTable();
            showHistoryMessage(historyStatus, `The backend lists no transaction for “${student}”.`, false);
            return;
        }

        drawHistoryTable(records);
        showHistoryMessage(historyStatus, `${records.length} transaction${records.length === 1 ? '' : 's'} recorded for “${student}”, in the order the backend answered in.`, false);
    } catch (error) {
        console.error('Transaction history error:', error);
        clearHistoryTable();
        showHistoryMessage(historyStatus, `Network error — the transactions of “${student}” could not be read from the API. Press Refresh to ask again.`, true);
    } finally {
        historyReadRunning = false;

        // A read that had a student to ask about leaves Refresh live again, tab stop and
        // all: lockHistory() is only for the state this page opens in with nobody behind
        // it, where there is nothing to read.
        historyRefreshButton?.removeAttribute('aria-disabled');
        historyRefreshButton?.removeAttribute('tabindex');
        stampHistory();
    }
}

// The first of the named fields a record carries a value in, or null when it carries
// none of them. The same reader app.js, sessionstorage.js and studentpicker.js use:
// the routes are untyped, so a missing field has to be survived rather than trusted.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// Every transaction in a GET /gettransactions reply. The shapes accepted mirror
// studentEntries in sessionstorage.js, because that is how an untyped route is read
// everywhere in this project:
//   [{"date": …, "amount": …}, …]                                -> used as is
//   {"transactions": […]}, {"records": […]}, {"history": […]},
//   {"data": […]}, {"items": […]}                                -> the inner list
//   {"date": …, "amount": …}                                     -> wrapped in an array
//   null / undefined / ""                                        -> []
// Only objects count as records: a transaction is a set of fields, so a bare string
// cannot be one, and anything else is dropped rather than drawn as a row of dashes.
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

// Fills the table: one row per transaction, the five columns in the sketch's order.
// Every cell is built as a node rather than with innerHTML, because the values come
// from the backend.
function drawHistoryTable(records) {
    const body = document.createDocumentFragment();

    for (const record of records) {
        const line = document.createElement('tr');
        line.className = 'roster__row';

        for (const column of HISTORY_COLUMNS) {
            line.append(historyCell(column, firstField(record, column.keys)));
        }

        body.append(line);
    }

    historyRows.replaceChildren(body);

    if (historyFrame) {
        historyFrame.hidden = false;
    }

    console.log(`Listed ${records.length} transaction(s).`, records);
}

// One cell: the value as the backend sent it. The two numeric columns take the
// roster's .roster__amount treatment — right-aligned in fixed-width digits — and, below
// zero, the same red the roster gives an account that has gone under. A field the
// record does not carry is a dash and never a zero: a zero is a figure, and a figure
// nobody read must not be drawn. Nothing here is added up: the ending balance is the
// figure the record itself carries.
function historyCell(column, value) {
    const cell = document.createElement('td');

    cell.className = column.numeric && Number(value) < 0
        ? `${column.className} roster__amount--negative`
        : column.className;
    cell.textContent = value === null ? '—' : drawnValue(column, value);

    return cell;
}

function drawnValue(column, value) {
    return column.date ? historyDate(value) : String(value);
}

// The date column is drawn in the shape the head of the column names — YYYY/MM/DD HH:mm,
// as in 2026/09/29 16:17, read the way a pattern is written: MM is the month and mm the
// minute, and the space is what holds the date and the time apart. A stamp arrives here
// in one of two separators: the ISO one this app writes itself, 2026-09-29 and
// 2026-09-29T16:17:00 (todayISO() in app.js, the one shape an <input type="date">
// reports), and the slashes the backend stamps a transaction with, 2026/09/29/16/17.
// Both are re-cut into the shape above for the same two reasons: a date and a time are
// held apart by a space where a person reads them, and the minute is marked with a colon
// where a clock writes it. So 2026-09-29T16:17:00 and 2026/09/29/16/17 both come out
// 2026/09/29 16:17. A date with no time on it keeps the three parts it has — the hour and
// the minute are the backend's to send, and a time nobody recorded is not invented. The
// parts are read as they were written, never shifted into this machine's clock, the way
// todayISO() is careful not to be, so seconds, fractions of a second and a trailing
// timezone are read past rather than shown. A value in any other shape is shown exactly
// as it came, rather than guessed at, and the whole value has to be the stamp for any of
// this to happen: half a date left behind in a cell would be worse than one drawn in a
// shape nobody planned, so the pattern is anchored at both ends.
const STAMP = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T/ ](\d{2})[:/](\d{2})(?:[:/]\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function historyDate(value) {
    const text = String(value);
    const stamp = STAMP.exec(text);

    if (!stamp) {
        return text;
    }

    const [, year, month, day, hour, minute] = stamp;

    // The time is drawn only when the stamp carried one.
    return hour === undefined
        ? `${year}/${month}/${day}`
        : `${year}/${month}/${day} ${hour}:${minute}`;
}

// Drops the rows and hides the frame they stand in. A read that failed or came back
// empty must not leave the table of the read before standing as if it were current.
function clearHistoryTable() {
    if (historyFrame) {
        historyFrame.hidden = true;
    }

    historyRows?.replaceChildren();
}

// The line beside the Refresh button, outside the live region, so a clock written there
// every read is not read out to a screen reader.
function stampHistory() {
    if (!historyStamp) return;

    historyStamp.textContent = `Last read at ${new Date().toLocaleTimeString()}.`;
}

// Replace the previous status line above the table with a single message — the same
// one-paragraph shape showRosterMessage, showHomeMessage and showReasonMessage write
// into their own blocks, so an error is the red variant of the same panel.
function showHistoryMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// Switches Refresh off the same way the flow's Next link is switched off: aria-disabled,
// which styles.css greys out and makes unclickable, plus no tab stop. It is what the
// page does with no confirmed student behind it, since there is nothing to read.
function lockHistory() {
    if (!historyRefreshButton) return;

    historyRefreshButton.setAttribute('aria-disabled', 'true');
    historyRefreshButton.setAttribute('tabindex', '-1');
}

// The page starts itself: the first read happens as the page opens, Refresh reads again
// on demand, and a read started in another tab — or a transaction written there — turns
// up here when this tab comes back to the front. Read again each time, because the stored
// student is read at the top of every read: a page whose student was refused on the page
// before it — or a student page opened after a different student signed in — must not go
// on showing the history of whoever was read for last.
if (historyRows) {
    readHistory();

    historyRefreshButton?.addEventListener('click', readHistory);

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            readHistory();
        }
    });
}
