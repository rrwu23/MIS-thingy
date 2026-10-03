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
// The admin's page — and only the admin's page — can take a row away and put another one
// in its place. The red delete button at the end of each row takes that row away, and a
// click on the row itself (anywhere but that button) opens it for retyping: the date, the
// amount, the type and the memo become boxes holding what the row reads now, and a save
// answers the app's Y/N question before anything is sent. The fifth column is not among
// them — the ending balance is the figure the backend worked out for the account, so it is
// drawn as it was read and never retyped. A change is a delete and then a write, in that
// order, because that is what the routes offer: POST /remove takes a row away by the id
// the backend sent for it — {"id": 5}, the route's one field and its one required one — and
// the new row goes to the very same POST /transaction-record the four transaction-type
// pages write with.
//
// The id is the request's whole business and nothing on the page's face. It is read off the
// record a read answered, kept on that record and in the list of records the table was drawn
// from — never written into the markup: no cell, no heading, no title, no data- attribute, no
// sentence — and handed to the delete as the body and to nothing else. So the admin never
// sees it, never types it and never picks a row by it: the row a request is about is the row
// whose own button was pressed, and the table names that row to them by its date.
//
// The student's own page carries none of this, and not by drawing alone: it has no sixth
// column for a delete button to stand in, no row of it opens, and the script refuses both
// routes outright on any page that is not the admin's (CAN_CHANGE_ROWS below), so nothing a
// student's browser can reach takes a transaction away or writes one over it. On the
// admin's page neither request leaves either without the backend first being asked whether
// this browser holds an admin session at all: the empty-body POST /adduser probe the rest
// of the app asks that question with (adminSession below). A session that has run out — or
// a browser that never held one — is refused by the backend and told so on the status line,
// whatever the page in front of it is drawing.
//
// This file is the page's own script, so the readers it needs are kept here rather
// than shared: studentpicker.js, jobrotation.js and sessionstorage.js do the same, and
// no page ever loads two of them.

// Where the transactions of one student are read from, the admin's way in: the student
// goes in a ?student= query, the shape every other student route in the API takes
// (GET /get-balance?student=). The route is listed in
// https://api.rongrongwu.com/openapi.json and answers 200 with a list of records (checked
// live). Each record carries the transaction's own id beside the five columns the table
// draws, and that id is the field a delete names the row by. A read that was refused says
// what the backend answered rather than showing a table with no rows in it, which would
// read as "this student never had a transaction".
const ADMIN_HISTORY_URL = 'https://api.rongrongwu.com/gettransactions';

// The student's own way in: the transactions of the student this browser signed in as, in
// the same ?student= query, answered by the same five-column table — the same format as
// the admin's route, because it is the same question about the same records. The name is
// not typed on that page and not confirmed by the page before it: it is the account the
// student sign in on the front door went through with.
const STUDENT_HISTORY_URL = 'https://api.rongrongwu.com/transaction-student-history';

// Which of the two pages this script is standing on, which the page says about itself:
// transaction-view-student.html carries data-history="student" on its <body>, and the
// admin's carries data-history="admin". Everything that differs between the two hangs off
// these two words — whose username is read, which route answers, and whether anything on
// the page may be changed.
const OWN_HISTORY = document.body?.dataset.history === 'student';

const HISTORY_URL = OWN_HISTORY ? STUDENT_HISTORY_URL : ADMIN_HISTORY_URL;

// The route as it is written in a sentence, for the lines that name it out loud.
const HISTORY_ROUTE = OWN_HISTORY ? '/transaction-student-history' : '/gettransactions';

// Whether this page may change what it lists, which the admin's page and only the admin's
// page may: a student does not take their own transactions away, and the two routes a change
// is made with — POST /remove and POST /transaction-record — are the admin's. The page has
// to say so about itself, so this asks for the one word the admin's page carries rather than
// for the student's page's word being absent: only transaction-view.html says
// data-history="admin", and only it draws the sixth column, opens a row for retyping and
// asks either route.
//
// Read that way round on purpose. Asking "is this the student's page?" answers "no" for
// every page that says nothing at all — a page that has not been written yet, a page whose
// own word is misspelled, a copy of this table saved under another name — and each of those
// would then be handed the delete buttons. Asking "is this the admin's page?" fails shut
// instead: a page nobody has vouched for is a table and nothing more, which is the safe half
// of the two. The routes are held to the same rule inside themselves (deleteRecord and
// writeRecord below), so the page cannot be changed by a caller either.
const CAN_CHANGE_ROWS = document.body?.dataset.history === 'admin';



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
//
// label is the column's own word — the one the head row of the page writes over it — and
// field is the name the backend's transaction body carries the column under, the five
// fields of POST /transaction-record. The pairs are here for the admin's page: a change is
// sent as those five fields, so it needs the backend's names, and the words that name a row
// out loud — the delete button, the question the dialog asks — use the head row's. The
// ending balance is the one column with no field: a change does not send it back, which is
// the whole of what "the ending balance cannot be retyped" means.
const HISTORY_COLUMNS = [
    {
        keys: ['date', 'created_at', 'timestamp', 'time'],
        label: 'Date',
        field: 'date',
        className: 'history__date',
        date: true
    },
    {
        keys: ['amount', 'bonura_bucks', 'value', 'points'],
        label: 'Amount',
        field: 'amount',
        className: 'roster__amount',
        numeric: true
    },
    {
        keys: ['type', 'category', 'kind'],
        label: 'Type',
        field: 'type',
        className: 'history__type'
    },
    {
        keys: ['memo', 'note', 'notes'],
        label: 'Memo',
        field: 'memo',
        className: 'history__memo'
    },
    {
        keys: ['ending_balance', 'balance_after', 'end_balance', 'balance'],
        label: 'Ending balance',
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
//
// Answers whether it read at all: false from the two guards — a page with no table to fill
// and a read already on its way — and true from every read that went out, including one the
// backend refused, because a refusal is something the status line has to say. A change below
// reads the account again once it has written, and folds the read's own sentence into what
// it has to say: the false is what tells it whether there is a sentence there to fold in.
async function readHistory() {
    if (!historyRows) return false; // only the two history pages have the table
    if (historyReadRunning) return false;

    // A read paints the table again from what the backend holds, so it closes any row that
    // is open for retyping: those boxes are about to be replaced by the read's own cells,
    // and a save pressed after that would be about boxes no longer on the page.
    editingRow = null;

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
        return true;
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
            return true;
        }

        if (!response.ok) {
            clearHistoryTable();
            showHistoryMessage(historyStatus, `The transactions of “${student}” could not be read — the backend answered ${response.status}. Press Refresh to ask again.`, true);
            return true;
        }

        const records = historyRecords(await response.json().catch(() => null));

        if (!records.length) {
            clearHistoryTable();
            showHistoryMessage(historyStatus, `The backend lists no transaction for “${student}”.`, false);
            return true;
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

    return true;
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

// The records of the read the table is showing, kept so a cancelled row can be drawn back
// exactly as the read left it: the table is painted again from these records rather than the
// edited cells patched back one by one, which would be a second place the drawing of a row
// could go wrong.
let historyLastRead = [];

// Fills the table: one row per transaction, the five columns in the sketch's order.
// Every cell is built as a node rather than with innerHTML, because the values come
// from the backend.
function drawHistoryTable(records) {
    const body = document.createDocumentFragment();

    historyLastRead = records;

    for (const record of records) {
        body.append(historyRow(record));
    }

    historyRows.replaceChildren(body);

    if (historyFrame) {
        historyFrame.hidden = false;
    }

    console.log(`Listed ${records.length} transaction(s).`, records);
}

// One row: the five cells of the sketch's table, and — on the admin's page — the cell that
// holds what may be done with it. The record itself is closed over by the row's own
// listeners, so the delete button and the click that opens the row are about the very
// transaction the row was drawn from, and not about the cells as they happen to read.
function historyRow(record) {
    const line = document.createElement('tr');
    line.className = 'roster__row';

    for (const column of HISTORY_COLUMNS) {
        line.append(historyCell(column, firstField(record, column.keys)));
    }

    if (CAN_CHANGE_ROWS) {
        // A row the backend sent no id for is drawn as the read left it and nothing more. The
        // two routes that take a row away and write another in its place both name the row by
        // its id, so with no id there is nothing they could be asked: the cell that answers
        // "what may be done with this transaction" is left empty, and the row does not open —
        // a change would have to take the old row away first, which is the very thing that
        // cannot be named. The cell is still there, so the last column of every row stands
        // under the head row's last column.
        const identified = rowId(record) !== null;

        if (identified) {
            line.classList.add('history__row--changeable');

            // The row is opened by a click on it or by Enter on it, so the keyboard has the
            // same way in as the mouse. tabindex is what makes a row reachable at all;
            // nothing about the row claims to be a control — the delete button beside it is
            // the control in the row, and the line over the table is what says a row opens.
            line.tabIndex = 0;
            line.addEventListener('click', function (event) {
                // the delete button's own click, and the typing in an open row, are answered
                // by the boxes and buttons themselves
                if (event.target.closest('button, input')) return;

                openRow(line, record);
            });
            line.addEventListener('keydown', function (event) {
                if (event.target !== line) return; // a button in the row answers its own keys
                if (event.key !== 'Enter' && event.key !== ' ') return;

                event.preventDefault();
                openRow(line, record);
            });
        }

        line.append(changeCell(line, record));
    }

    return line;
}

// The last cell of a changeable row: the red delete button while the row stands as it was
// read, and the save and cancel pair while it is open for retyping. Both states are the same
// cell, so the last column of the table always holds what the row is asking for. The head
// row above it leaves the column unnamed — an unnamed head cell would be a screen reader's
// blank over the buttons — so the page's own head row puts a word there that nobody sees.
// A row the backend sent no id for has no state to be in: the cell is drawn empty, which is
// the column's own question answered with nothing (see showRowActions).
function changeCell(line, record) {
    const cell = document.createElement('td');
    cell.className = 'history__actions';

    showRowActions(cell, line, record);

    return cell;
}

// The delete button of a row that is closed: the app's red (.btn--danger), because it takes
// a transaction away and this app has no undo. Its label names the row it belongs to, since
// a column of buttons all reading "delete" says nothing about which row any of them is on.
// A row the backend sent no id for gets no button at all: the route that takes a row away
// names it by its id, so there is nothing this button could ask for. The cell is emptied
// rather than left standing, which is the column's own question — "what may be done with
// this transaction" — answered with nothing.
function showRowActions(cell, line, record) {
    if (rowId(record) === null) {
        cell.replaceChildren();
        return;
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--danger';
    remove.textContent = 'delete';
    remove.setAttribute('aria-label', `Delete the transaction of ${rowDate(record)}`);
    remove.addEventListener('click', function () {
        removeRow(record, remove);
    });

    cell.replaceChildren(remove);
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

// A row's own date as the table drew it, for the words that have to name one row among many:
// the delete button says which row it belongs to, and the line a delete or a change is
// reported on names the row it took away. A record carrying no date at all is named the way
// its cell was drawn — a dash — rather than by an empty word.
function rowDate(record) {
    const value = firstField(record, HISTORY_COLUMNS[0].keys);

    return value === null ? '—' : historyDate(value);
}

// The field a row is identified to the backend by. GET /gettransactions answers each record
// with the transaction's own id beside the five columns the table draws — {"date": …,
// "amount": …, "id": 5, "balance": …} (checked live) — and POST /remove names the row it is
// to take away with that id and nothing else. So this is the one value on a record that is
// about that transaction and no other: a date is only unique to the minute and two rows can
// share one, which is why the delete stopped being asked by date.
//
// The id is read for the request and for nothing else — it is not one of HISTORY_COLUMNS, so
// no cell, no head row and no question about a row carries it, and the page's own words name
// a row by its date instead (rowDate below). It never leaves this file either: the record it
// came on is closed over by the row's own delete button, and the value is written into one
// place only, the body of the request that takes the row away.
//
// Only unambiguous names for a transaction's own identifier are read, and nothing is ever
// guessed at — the named field is the field, whatever it carries. Two names rather than one
// because the routes are untyped and have spelled the same idea twice before (…_id), and
// because the alternative failure is worse than a miss: reading some other field as an id
// would point the delete at the wrong row, where reading none at all only means the row
// cannot be asked about — which is the safe half of the two.
const TRANSACTION_ID_KEYS = ['id', 'transaction_id'];

// The transaction's own id, as the backend sent it, or null when the record carries none. An
// id of 0 is an id like any other: the value is asked for being present, not for being true,
// the way every other field on this page is read.
function rowId(record) {
    return firstField(record, TRANSACTION_ID_KEYS);
}

// The date column is drawn in the shape the head of the column names — YYYY/MM/DD HH:mm,
// as in 2026/09/29 16:17, read the way a pattern is written: MM is the month and mm the
// minute, and the space is what holds the date and the time apart. A stamp arrives here
// in one of two separators: the ISO one this app writes itself, 2026-09-29 and
// 2026-09-29T16:17:00 (the one shape an <input type="date"> reports), and the slashes
// the backend stamps a transaction with, 2026/09/29/16/17.
// Both are re-cut into the shape above for the same two reasons: a date and a time are
// held apart by a space where a person reads them, and the minute is marked with a colon
// where a clock writes it. So 2026-09-29T16:17:00 and 2026/09/29/16/17 both come out
// 2026/09/29 16:17. A date with no time on it keeps the three parts it has — the hour and
// the minute are the backend's to send, and a time nobody recorded is not invented. The
// parts are read as they were written, never shifted into this machine's clock, so seconds,
// fractions of a second and a trailing timezone are read past rather than shown. A value in
// any other shape is shown exactly as it came, rather than guessed at, and the whole value
// has to be the stamp for any of this to happen: half a date left behind in a cell would be
// worse than one drawn in a shape nobody planned, so the pattern is anchored at both ends.
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

// What the status line above the table last said, and whether it was the red variant. The
// change below reads the account again once it has written, and has to say what it did *and*
// what the read found; the read writes its own sentence first, so it is kept here to be read
// back — the change's sentence carries the read's after it.
let historyStatusText = '';
let historyStatusError = false;

// Replace the previous status line above the table with a single message — the same
// one-paragraph shape showRosterMessage, showHomeMessage and showReasonMessage write
// into their own blocks, so an error is the red variant of the same panel.
function showHistoryMessage(results, text, isError) {
    if (!results) return;

    if (results === historyStatus) {
        historyStatusText = text;
        historyStatusError = Boolean(isError);
    }

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// ------------------------------------------------------- the two routes ----
// Where a transaction is taken away: POST /remove, asked with the row's own id and nothing
// else — {"id": 5} — which is the one field the route names, and a required one. It is listed
// in https://api.rongrongwu.com/openapi.json (summary "Remove", operationId
// remove_remove_post): the body is {"id": <integer>} and nothing besides, a body without an id
// is refused with
// 422 {"detail": [{"type": "missing", "loc": ["body", "id"], "msg": "Field required"}]}, and
// the 200 answer is an object of flat values — {"message": "Transaction removed", "id": 5,
// "deleted": 1} (checked live with curl).
//
// Two things about that answer are read here. The first is that a 200 is not a delete: an id
// the backend does not know is answered 200 as well, with {"message": "transaction not found",
// "id": 99999999, "deleted": 0} (checked live), so a sentence may only say a row is gone once
// `deleted` is a number above zero — the same count-not-status reading the remove page makes
// of POST /remove-student. The second is that the id the answer echoes back is read by this
// page not at all: it is the backend telling itself which row it worked on, and the admin is
// told about a row in the table's own words instead.
//
// The id goes exactly as the record carried it, never re-cut, re-typed or guessed at: a row
// that is to be found again is found by the value the backend itself sent, and the id is the
// one value on a record that is about that transaction and no other. A date would not do: it
// is unique only to the minute, so two rows of one account can share one, and the route would
// then have two rows to choose between. (A record whose id is not the integer the route
// declares — a word, a missing field — is refused by the backend with 422, and that refusal is
// said out loud rather than passed over.)
const REMOVE_URL = 'https://api.rongrongwu.com/remove';

// Where the new row of a change is written: the very route, with the very five fields, that
// the four transaction-type pages record an approved transaction with — user, amount, type,
// date, memo — so a row this page writes and a row those pages write come out alike, and the
// two flows cannot drift into two shapes.
const RECORD_URL = 'https://api.rongrongwu.com/transaction-record';

// Where this browser is asked whether it still holds an admin session, which is asked
// immediately before either of the two routes above is called: the app's own probe, POST
// /adduser with an empty body — the very request app.js (ADMIN_CHECK_URL), sessionstorage.js
// (PERMISSION_URL) and jobrotation.js (JOB_PERMISSION_URL) ask the same question with. The
// empty body is the point of it: whatever the backend does with the request, it cannot have
// been asked to create an account, so the probe changes nothing.
const ADMIN_CHECK_URL = 'https://api.rongrongwu.com/adduser';

// The four columns a row is retyped in: the date, the amount, the type and the memo — the four
// an admin fills in by hand on the approving pages, so the four this page hands back. The
// fifth column is not one of them: the ending balance is the figure the account stood at after
// the row, worked out by the backend and written on the record by the backend, so it is drawn
// as it was read and is nobody's to retype. The row that is written carries no balance at all:
// the old row's figure goes with the old row, and the backend is what puts the rows that are
// left back together.
const CHANGE_COLUMNS = HISTORY_COLUMNS.slice(0, 4);

// The two questions this page asks, in the "…, Y/N" shape the approving pages ask theirs in.
const DELETE_QUESTION = 'confirm delete transaction, Y/N';
const CHANGE_QUESTION = 'confirm change transaction, Y/N';

// The row that is open for retyping — { line, cell, record, boxes } — or null when no row is
// open. One row at a time: while a row is open its boxes are the admin's typing, and a second
// row opening over them would throw that typing away, so a click on another row, or on another
// row's delete, is left unanswered until this row is saved or cancelled.
let editingRow = null;

// True while a delete or a change is on its way to the backend, so a second click cannot ask
// the same question about the same row twice.
let changeRunning = false;

// Every column of a row as the table drew it, keyed by the field a change is sent under: what
// the boxes of an open row start from, and what the words about a change name. A field the
// record carries nothing in is an empty string here — a box left empty rather than holding the
// dash the cell drew, because a dash is a drawing and not a value.
function drawnRow(record) {
    const row = {};

    for (const column of CHANGE_COLUMNS) {
        const value = firstField(record, column.keys);
        row[column.field] = value === null ? '' : drawnValue(column, value);
    }

    return row;
}

// One row as a sentence: every column that may be retyped, named the way the head row of the
// table names it — "date 2026/09/29 16:17, amount 63, type …" — so a question names the very
// columns the boxes under it are holding. A column carrying nothing is named as its cell in
// the table drew it: a dash.
function rowWords(parts) {
    return CHANGE_COLUMNS
        .map((column) => `${column.label.toLowerCase()} ${parts[column.field] || '—'}`)
        .join(', ');
}

// Whose row this is: the name the record itself carries, or — a record that names nobody — the
// student this page was confirmed with, which is the name the read is asked with, and so the
// account every row on the page belongs to.
function rowStudent(record) {
    return firstField(record, ['user', 'student', 'name'])
        ?? sessionStorage.getItem(HISTORY_STUDENT_KEY)
        ?? '';
}


// -------------------------------------------------------- opening a row ----
// Opens a row for retyping: the four columns a change may touch become boxes holding what the
// row reads now, the ending balance is left exactly as it was drawn, and the delete button is
// replaced by the save and cancel pair. Nothing is sent yet — the question comes first, and a
// cancelled row leaves nothing behind.
function openRow(line, record) {
    if (editingRow || changeRunning) return; // one row at a time (see editingRow)

    const values = drawnRow(record);
    const boxes = [];

    CHANGE_COLUMNS.forEach(function (column, index) {
        const cell = line.children[index];
        if (!cell) return;

        const box = document.createElement('input');
        box.type = 'text';
        box.className = 'history__box';
        box.value = values[column.field];
        box.setAttribute('aria-label', `${column.label} of this transaction`);
        if (column.numeric) box.inputMode = 'decimal';

        cell.replaceChildren(box);
        boxes.push(box);
    });

    const cell = line.children[HISTORY_COLUMNS.length]; // the last cell: the buttons
    if (!cell || boxes.length !== CHANGE_COLUMNS.length) return;

    line.classList.add('history__row--open');
    editingRow = { line, cell, record, boxes };

    showEditActions(cell);
    boxes[0].focus(); // the keyboard lands in the first box, ready to be retyped
}

// The two buttons an open row asks with, in the place the delete button stood: save answers the
// question, cancel puts the row back as it was read. Save is the app's ink button and cancel
// the quiet one beside it, so the heavier-looking of the two is also the one that writes.
function showEditActions(cell) {
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn--primary';
    save.textContent = 'save';
    save.addEventListener('click', function () {
        submitChange(save);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost';
    cancel.textContent = 'cancel';
    cancel.addEventListener('click', cancelRow);

    cell.replaceChildren(save, cancel);
}

// The cancel button: the row is closed and the table is drawn again from the records of the
// read, so the row goes back to exactly what it was read as. Nothing is sent, and nothing has
// to be remembered about the cells as they stood before the boxes replaced them. The keyboard
// is put back on the row that was open, so the same row can be opened again without reaching
// for the table.
function cancelRow() {
    const edit = editingRow;

    if (!edit) return;

    editingRow = null;
    drawHistoryTable(historyLastRead);

    const index = historyLastRead.indexOf(edit.record);
    if (index >= 0) historyRows?.children[index]?.focus();
}

// What the four boxes hold, as the fields a change is sent under. Each value is trimmed: a box
// left holding a space holds nothing.
function typedChange(boxes) {
    const change = {};

    CHANGE_COLUMNS.forEach(function (column, index) {
        change[column.field] = boxes[index]?.value.trim() ?? '';
    });

    return change;
}

// What is wrong with the typed row — said on the status line, with the field whose box has to
// be put right — or null when there is nothing wrong with it. Two of the four boxes can be
// wrong, and they are the two the approving pages are strict about: the date, which has to be
// a stamp this table can read back (the shapes STAMP reads, 2026/09/29 16:17 and
// 2026/09/29/16/17 among them), since a date drawn as it was typed would be a row nobody could
// read a moment out of; and the amount, which has to be a figure, since a balance cannot be
// worked out around "sixty". The type and the memo are free text, and either may be left
// empty: a row carrying a date and a figure is a row.
function untypedRow(change) {
    if (!STAMP.test(change.date)) {
        return {
            field: 'date',
            text: 'The date box has to hold a day — YYYY/MM/DD HH:mm, as in 2026/09/29 16:17, or the same stamp with slashes on their own — before the row can be written. The date the table drew can be typed back as it stands.'
        };
    }

    if (change.amount === '' || !Number.isFinite(Number(change.amount))) {
        return {
            field: 'amount',
            text: 'The amount box has to hold a figure — 63, or -25 for a type that takes points away — before the row can be written.'
        };
    }

    return null;
}


// ----------------------------------------------------------- the buttons ----
// What the delete question says: the row as the table reads it, in the table's own words, and
// the fact that this app has no undo.
function describeDelete(student, record) {
    return `The row of “${student}” — ${rowWords(drawnRow(record))} — is taken away for good: this app has no undo. Y deletes it, N drops it.`;
}

// What the change question says: the row as the table reads it, and then the row the boxes
// hold. Both halves are named in the table's own words, so the question reads as the two rows
// the admin can see — the one standing in the table and the one their typing would write. The
// second half is written from the boxes' own text, because that text is exactly what will be
// sent: nothing here re-cuts a typed date the way the column draws one.
function describeChange(student, record, change) {
    return `The row of “${student}” — ${rowWords(drawnRow(record))} — is taken away and this row is written in its place: ${rowWords(change)}. Y replaces it, N drops it.`;
}

// Says what came of a delete or a change on the status line above the table, with the sentence
// the read that followed it wrote after it: the change is what was done, and the read is what
// the account holds now — which is what the table under the line is showing. A read that was
// refused makes the whole line the red one, whatever the change came to, because the admin has
// to know the table is not current.
function reportChange(text, isError, read) {
    const tail = read && historyStatusText ? ` ${historyStatusText}` : '';

    showHistoryMessage(historyStatus, `${text}${tail}`, isError || Boolean(read && historyStatusError));
}

// What answering Y on the delete question is met with once a row has actually gone. The count
// the backend answered with is read back, the way app.js reads POST /remove-student's: an
// answer that took two rows while the sentence said one would be a half-honest sentence. The
// row is named by its date, as the table reads it — never by its id.
function deletedMessage(student, record, count) {
    if (count === 1) {
        return `Deleted — the row of ${rowDate(record)} for “${student}” is gone from the account.`;
    }

    return `Deleted — ${count} rows for “${student}” are gone from the account, the row of ${rowDate(record)} among them.`;
}

// The delete button: the question first, then POST /remove with the row's own id — which the
// admin is never shown — and then the read that shows the account without it. An answer that
// took nothing away is not a delete and is reported as the refusal it is, with the row left in
// the table exactly as it was read.
async function removeRow(record, button) {
    // A row open for retyping is the admin's typing, and the read a delete ends with would
    // throw it away: the delete of another row is not asked while one is open.
    if (editingRow) {
        showHistoryMessage(historyStatus, 'Save or cancel the row you are changing first — reading the account again now would drop what you have typed.', true);
        return;
    }

    if (changeRunning) return;

    const student = rowStudent(record);
    const confirmed = await askConfirmation(DELETE_QUESTION, describeDelete(student, record), {
        danger: true,
        returnFocus: button
    });

    if (!confirmed) return;

    changeRunning = true;

    const removed = await deleteRecord(record);

    if (!removed.ok) {
        changeRunning = false;
        reportChange(`Nothing was deleted — ${removed.text}`, true, false);
        return;
    }

    const read = await readHistory();
    changeRunning = false;

    reportChange(deletedMessage(student, record, removed.count), false, read);
}

// The save button: reads the boxes, refuses a row that is not one, and puts the question in
// front of the admin. Nothing is sent while the question is up, and the object the question
// names is the object the request will carry — built here, once, from the boxes.
async function submitChange(button) {
    const edit = editingRow;

    if (!edit || changeRunning) return;

    const change = typedChange(edit.boxes);
    const problem = untypedRow(change);

    if (problem) {
        // the row stays open, holding what was typed, with the keyboard put back in the box
        // that has to be put right
        showHistoryMessage(historyStatus, problem.text, true);
        edit.boxes[CHANGE_COLUMNS.findIndex((column) => column.field === problem.field)]?.focus();
        return;
    }

    const student = rowStudent(edit.record);
    const transaction = {
        user: student,
        amount: Number(change.amount),
        type: change.type,
        date: change.date,
        memo: change.memo === '' ? null : change.memo
    };

    const confirmed = await askConfirmation(CHANGE_QUESTION, describeChange(student, edit.record, change), {
        danger: true,
        returnFocus: button
    });

    if (!confirmed) return;

    changeRunning = true;

    const outcome = await sendChange(student, edit.record, transaction);

    // A change the backend refused wrote nothing, so the table still stands as it was read and
    // the row is left open, holding what was typed, for the box that was refused to be put
    // right and save pressed again.
    if (!outcome.stale) {
        changeRunning = false;
        reportChange(outcome.text, outcome.isError, false);
        return;
    }

    // The delete went through, so the table is out of date whether or not the write did: it is
    // read again, and the open row is closed by that read.
    const read = await readHistory();
    changeRunning = false;

    reportChange(outcome.text, outcome.isError, read);
}


// ---------------------------------------------------------- the requests ----
// What the backend said about a refusal, after the status code: the `detail` its refusals
// carry, read the way app.js reads the same field — a sentence, or the messages out of a list
// of them — and nothing at all when it said neither.
function backendDetail(result) {
    const detail = result?.detail;

    if (typeof detail === 'string' && detail) {
        return `: ${detail}`;
    }

    if (Array.isArray(detail)) {
        return `: ${detail.map((item) => item.msg).join('; ')}`;
    }

    return '';
}

// The admin session, asked about before either route below changes anything. POST /adduser
// with an empty body is the probe the rest of the app asks this question with — app.js's
// checkAdminPermission, sessionstorage.js's checkLoginPermission, jobrotation.js's — so the
// sentence a refusal puts on the status line is the sentence those pages show for it.
//   422, or any 2xx   the body was the only thing refused, so the cookie was accepted:
//                      an admin session stands behind this browser
//   401                Not logged in — no admin session, and no row may be changed
// Anything else, or no answer at all, is not a yes: this page writes only for an admin the
// backend itself has just called one, so an answer it cannot read has to be taken as no.
async function adminSession() {
    try {
        const response = await fetch(ADMIN_CHECK_URL, {
            method: 'POST',
            credentials: 'include', // the admin session cookie travels with the probe
            body: new FormData()    // empty body: a probe cannot add an account
        });

        if (response.ok || response.status === 422) {
            return { granted: true, text: '' };
        }

        if (response.status === 401) {
            return {
                granted: false,
                text: 'the backend refused the request — not logged in. Log into the admin account and try again.'
            };
        }

        return {
            granted: false,
            text: `the backend answered the admin check with ${response.status}, so it cannot be said that these are an admin's to change.`
        };
    } catch (error) {
        console.error('Admin check error:', error);

        return { granted: false, text: 'the admin check could not reach the API.' };
    }
}

// One POST of a change, as both routes are asked: the body as JSON, the session cookie
// travelling with it — the same credentials every read on this page uses — and the answer read
// without being trusted to parse, since a refusal can carry anything. Answers { ok, status,
// result }, where a status of 0 is the network itself being gone, which no HTTP status can say.
async function postJson(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        return {
            ok: response.ok,
            status: response.status,
            result: await response.json().catch(() => null)
        };
    } catch (error) {
        console.error(`${url} error:`, error);

        return { ok: false, status: 0, result: null };
    }
}

// How many transactions the answer says were taken away, or null when it does not say with a
// number. Only this count may turn an answer into a delete: 200 on its own means no such thing
// here, since an id the backend does not know is answered 200 too (see REMOVE_URL). The same
// reader app.js makes of POST /remove-student's answer, under the same name.
function removedCountIn(result) {
    const deleted = result?.deleted;

    return typeof deleted === 'number' ? deleted : null;
}

// POST /remove, asked with the row's own id. Answers { ok, count, text }: how many rows the
// backend said it took away, and the sentence the status line has to carry when the request
// was refused or took nothing away — and nothing when a row went.
//
// Three things stand between a row and this request, and the request is the last thing to
// happen: the page has to be one that may change what it lists, the row has to carry an id
// for the route to name it by, and the backend has to answer the admin check with yes. The
// first two are read off the page and off the row, so they are asked first — refusing there
// costs nothing — and the backend is asked about the session last, as late as it can be,
// because a session that runs out between the check and the request is the very thing the
// check is for.
//
// The id itself is never part of a sentence: not the value that travels, not the value the
// answer echoes back. The admin is told which row a request was about the way the table names
// it — by its date — and the count of rows that went is the only figure read out of the answer.
async function deleteRecord(record) {
    const where = `the row of ${rowDate(record)}`;
    const id = rowId(record);

    // A page that may not change what it lists is refused here and not by its drawing alone:
    // the student's own page draws no delete button, and this is the same rule standing where
    // the request would leave from. Nothing is sent, and the backend is asked nothing.
    if (!CAN_CHANGE_ROWS) {
        return { ok: false, text: `this page does not change transactions, so ${where} was not deleted — a row is only ever taken away from the admin's history page.` };
    }

    // A row with no id cannot be named to the route, so the request is never made: a body
    // carrying nothing but an absent field would be asking the backend to take away whatever
    // it liked, and this app has no undo. The refusal names the row in the table's own words.
    if (id === null) {
        return { ok: false, text: `the backend sent no id for ${where}, so POST /remove had nothing to name it by and nothing was deleted. Press Refresh and try again.` };
    }

    // Whose session this is, asked immediately before the row is taken away: the id and the
    // cookie travel together, and the request only goes out once the backend has said the
    // cookie is an admin's.
    const session = await adminSession();

    if (!session.granted) {
        return { ok: false, text: `no admin session stands behind this browser, so ${where} is still there — ${session.text}` };
    }

    const answer = await postJson(REMOVE_URL, { id });

    // The network itself being gone, which no status can say. Asked first because there is no
    // answer at all to read a count out of.
    if (answer.status === 0) {
        return { ok: false, text: `POST /remove could not reach the API, so ${where} was not deleted.` };
    }

    if (answer.ok) {
        const count = removedCountIn(answer.result);

        if (count === null) {
            return { ok: false, text: `the backend answered ${answer.status} to the delete of ${where} without saying how many rows it took away, so there is nothing that says the row is gone. Press Refresh and read the account again.` };
        }

        // 200 with nothing taken away: the id the read gave this row is not one the backend
        // knows — a row it has already taken away, a read that has gone stale. The row stands,
        // and the read that follows is what tells the admin what the account holds now.
        if (count < 1) {
            return { ok: false, text: `the backend's answer took no transaction away — it knows no transaction by the id this row was read with, so ${where} is still there. Press Refresh and try again.` };
        }

        return { ok: true, count, text: '' };
    }

    // The route is listed in openapi.json, so a 404 here is a backend that has moved it rather
    // than one that has never had it. Said plainly either way: a delete that was not answered
    // must never read as a delete.
    if (answer.status === 404) {
        return { ok: false, text: `the backend has no route for deleting a transaction — POST /remove answered 404, so ${where} is still there.` };
    }

    return { ok: false, text: `the backend refused the delete of ${where} (${answer.status})${backendDetail(answer.result)}.` };
}

// POST /transaction-record, the write an approved transaction is recorded with, asked with the
// same five fields of the same body. Answers the same { ok, text } pair, and the same two
// things stand in front of the request: the page has to be one that may change what it lists,
// and the backend has to answer the admin check with yes, asked immediately before the row
// leaves. This is the write the four transaction-type pages also make, through the one
// function they both send with, and the same check stands there too (app.js's
// sendTransaction), so no page in this app writes a transaction without the backend having
// said whose session is asking.
async function writeRecord(transaction, student) {
    if (!CAN_CHANGE_ROWS) {
        return { ok: false, text: `this page does not change transactions, so nothing was written for “${student}” — a row is only ever written over from the admin's history page.` };
    }

    const session = await adminSession();

    if (!session.granted) {
        return { ok: false, text: `no admin session stands behind this browser, so nothing was written for “${student}” — ${session.text}` };
    }

    const answer = await postJson(RECORD_URL, transaction);

    if (answer.ok) return { ok: true, text: '' };

    if (answer.status === 404) {
        return { ok: false, text: 'the backend has no route for writing a transaction — POST /transaction-record answered 404.' };
    }

    if (answer.status === 0) {
        return { ok: false, text: `POST /transaction-record could not reach the API, so nothing was written for “${student}”.` };
    }

    return { ok: false, text: `the backend refused the new row of “${student}” (${answer.status})${backendDetail(answer.result)}.` };
}

// The change itself: the old row is taken away first and the new row written after it, in that
// order, because those are the two routes — /remove takes a row away by its id, and
// /transaction-record writes one. A delete that was refused stops there: a refusal cannot be
// written over, so nothing goes to the second route and the account keeps the row it had. A
// write that was refused leaves the account a row short, and that is said outright — there is
// no undo here, and the way back is to write the row again by hand.
//
// Each of the two routes asks the backend about the session itself before it changes anything
// (adminSession, in both), so a change asks about it twice: once in front of the delete and
// once in front of the write. That pair is not a wasted one — by the time the write is asked
// about, the delete has already left, and a session that ran out in between is exactly what
// the second check is there to catch. What it catches is the write half's refusal, which
// leaves the account a row short, and the sentence below says so.
//
// Answers { text, isError, stale }: what the status line has to say, whether it is the red
// line, and whether the table is out of date and has to be read again — which it is as soon as
// the delete went through, whether or not the write did.
async function sendChange(student, record, transaction) {
    const removed = await deleteRecord(record);

    if (!removed.ok) {
        return { text: `Nothing was changed — ${removed.text}`, isError: true, stale: false };
    }

    const written = await writeRecord(transaction, student);

    if (!written.ok) {
        return {
            text: `The row of ${rowDate(record)} was taken away, but nothing stands in its place — ${written.text} The account holds one transaction fewer, and writing the row again by hand is the only way back.`,
            isError: true,
            stale: true
        };
    }

    return {
        text: `Changed — the row of ${rowDate(record)} was taken away and a row of ${rowWords(transaction)} was written for “${student}”.`,
        isError: false,
        stale: true
    };
}


// ------------------------------------------------------- the Y/N question ----
// Taking a transaction away — and replacing one, which takes the old row away first — cannot
// be undone, so the choice is put in front of the admin once more: "confirm delete
// transaction, Y/N" and "confirm change transaction, Y/N", answered with two buttons.
// window.confirm() would answer OK/Cancel, which is not what those questions ask, so the
// question is the app's own dialog — the same overlay the approving pages and remove.html ask
// theirs with, .confirm in styles.css — built on first use and hidden again until it is
// needed. Nothing is sent while it is up, and the row it names is the row the request will
// carry, because both are built from the same record and the same boxes.
//
// Both questions this page asks are asked the approving pages' way, with Y and N and no
// heading of their own — the question itself is the heading — so only two things are handed in
// by the caller: the sentence under it, and whether the yes answer is to be the red one. Both
// of this page's are, because each takes a row away for good.
const CONFIRM_YES = 'Y';
const CONFIRM_NO = 'N';

let confirmDialog = null;   // the overlay, built the first time anything is deleted or changed
let confirmHeading = null;  // the h2 inside it: what is being asked
let confirmText = null;     // the sentence inside it: the row that is about to go
let confirmYes = null;      // the yes button, where the focus lands
let confirmNo = null;       // the no button beside it
let confirmBack = null;     // where the keyboard goes once the question is answered
let confirmPending = null;  // { promise, resolve } of the question on screen

// One of the two answers. Both are ordinary .btn buttons, so they look and behave like every
// other button on the page.
function confirmButton(label, variant, answer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${variant}`;
    button.textContent = label;
    button.addEventListener('click', function () {
        answerConfirmation(answer);
    });

    return button;
}

// The overlay the two questions are asked in: the same .confirm markup app.js builds, so it is
// styled by the same rules and reads to a screen reader as the same dialog.
function buildConfirmDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'confirm';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'confirmquestion');
    dialog.setAttribute('aria-describedby', 'confirmtext');

    const panel = document.createElement('div');
    panel.className = 'confirm__panel';

    const question = document.createElement('h2');
    question.className = 'confirm__question';
    question.id = 'confirmquestion';

    const text = document.createElement('p');
    text.className = 'confirm__text';
    text.id = 'confirmtext';

    const actions = document.createElement('div');
    actions.className = 'confirm__actions';

    confirmYes = confirmButton(CONFIRM_YES, 'btn--primary', true);
    confirmNo = confirmButton(CONFIRM_NO, 'btn--ghost', false);
    actions.append(confirmYes, confirmNo);

    panel.append(question, text, actions);
    dialog.append(panel);
    document.body.append(dialog);

    // The two answers work as keys too — the question says so — and Escape is the same answer
    // as the quieter one, so the question can always be dismissed without a mouse. The
    // listener lives on the document because the buttons are the only things inside the
    // overlay and the keyboard may be anywhere.
    document.addEventListener('keydown', function (event) {
        if (dialog.hidden) return;

        const key = event.key.toLowerCase();

        if (key === CONFIRM_YES.toLowerCase()) {
            answerConfirmation(true);
        } else if (key === CONFIRM_NO.toLowerCase() || key === 'escape') {
            answerConfirmation(false);
        }
    });

    confirmDialog = dialog;
    confirmHeading = question;
    confirmText = text;
}

// Puts the question on screen and answers true for the yes button, false for the other. The
// sentence under it and the treatment the yes answer gets are the caller's, because the two
// questions this page asks are not the same question. A question already up is the question
// that has to be answered, so a second call shares it instead of stacking another one on top.
function askConfirmation(question, text, options = {}) {
    if (confirmPending) {
        return confirmPending.promise;
    }

    if (!confirmDialog) {
        buildConfirmDialog();
    }

    // The dialog is built once and asked many times, so every word on the panel is written
    // over the last question: the heading, the sentence and the yes button's colour — red when
    // the answer destroys something that cannot be brought back.
    confirmHeading.textContent = question;
    confirmText.textContent = text;
    confirmYes.className = `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`;

    confirmBack = options.returnFocus ?? null;
    confirmDialog.hidden = false;
    confirmYes.focus();

    const pending = { promise: null, resolve: null };
    pending.promise = new Promise(function (resolve) {
        pending.resolve = resolve;
    });
    confirmPending = pending;

    return pending.promise;
}

// Answers the question and takes it off the screen. The first answer is the answer: once it is
// gone there is nothing left to resolve, so a second click or key cannot change what was
// decided.
function answerConfirmation(answer) {
    const pending = confirmPending;

    if (!pending) {
        return;
    }

    confirmPending = null;
    confirmDialog.hidden = true;

    // The keyboard goes back to the button the question was asked from — the row's delete, or
    // the row's save — rather than being dropped on the body, so the admin can carry on
    // without reaching for the mouse. On a save the row is still open and that button is still
    // there; on a delete the table is read again and its rows replaced, so the focus goes to
    // the body with the button it was on.
    confirmBack?.focus();

    pending.resolve(answer);
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
