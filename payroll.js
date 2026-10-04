// Pay salaries and Pay rent pages (salary.html, rent.html).
//
// The two money doors on the hub, and one page script for both. Each page lists the students of
// the signed-in admin in the box transaction1.html picks its students in — the student's name, the
// word beside it and the box a click ticks — and the students ticked there are the ones the page
// sends, one request each, in the order they were ticked:
//
//   POST /pay-salary   {"student": "<name>"}   salary.html, behind the hub's "Pay salaries" door
//   POST /pay-rent     {"student": "<name>"}   rent.html,   behind the hub's "Pay rent" door
//
// Which of the two this file is standing on it reads off the page itself — salary.html's <body>
// carries data-payroll="salary" and rent.html's carries data-payroll="rent" — so the two pages are
// the same card, the same box and the same question about one student, and no part of this file is
// copied between them. transactionview.js reads its own two pages the same way, off data-history,
// and draws the two of them from one script for the same reason.
//
// Both routes are listed in https://api.rongrongwu.com/openapi.json, and both take the account's
// own name in the one field their body declares: Body_pay_salary_pay_salary_post and
// Body_pay_rent_pay_rent_post are each {"student": <string>} and nothing else, so that is the whole
// of what travels. What they answer with is the app's untyped object of strings, lists and rows: a
// `message` sentence, the rows actually written for named students under `paid` (salary) or
// `charged` (rent) as {"student": ..., "amount": ..., "date": ...}, and `skipped` for a student the
// route left alone. Checked live on 2026/10/03:
//
//   POST /pay-salary {"student": "___payroll_probe___"}
//     {"message": "No salaried job to pay for ___payroll_probe___", "paid": [], "skipped": []}
//   POST /pay-rent {"student": "___payroll_probe___"}
//     {"message": "Charged 1 student(s)", "amount": -200, "type": "rent",
//      "memo": "pay for desk and chair",
//      "charged": [{"student": "___payroll_probe___", "amount": -200, "date": "2026/10/03/09/56"}],
//      "skipped": []}
//
// so an answer that wrote nothing for a student is answered 200 as well, and only a row that names
// the student may turn an answer into a payment: an empty `paid` is nothing paid, whatever the
// status said. That is why the page's sentences are written from those rows rather than from the
// status, and why the line under the box is the backend's own sentence when it wrote no row for a
// student. One student's rent is charged at -200 — the figure the rent route answered with above,
// and the memo its own rows carry — so the rent page can name what the account loses; the salary
// page names the job's own salary instead, read from GET /getuser beside each account.
//
// Only the students of a signed-in admin may be paid, so the page asks the backend for permission
// as it loads — the empty-body POST /adduser probe every protected flow asks (app.js's
// ADMIN_CHECK_URL, sessionstorage.js's PERMISSION_URL, jobrotation.js's JOB_PERMISSION_URL) — and
// asks again when the button is pressed, because a session can expire while the page is open.
// Nothing is listed before the first answer, and nothing leaves the page without the second.
//
// The button asks the app's own Y/N question before it sends — the .confirm overlay, built here the
// way transactionview.js builds it, this being the page's own script — and the question names every
// ticked student and what each answer does. Y sends them, one student at a time; N drops the whole
// thing and leaves the box as it was. A student the backend wrote a row for is unticked as soon as
// that is known, because a second press would pay them a second time; a student it wrote no row for
// stays ticked and is named on the line under the box, so pressing the button again tries only them.
// When every ticked student went through, the page hands the admin back to the home page, the way
// every other finished flow in the app does.
//
// The box arrives with every student of the admin already ticked, on both pages: the round either
// page is opened for is the whole roll, and the few who are not to be paid or charged are unticked by
// the same click that would have ticked them. It is a starting state, not something remembered —
// nothing is restored from an earlier visit on either page (see below).
//
// Nothing is kept in sessionStorage: the transaction flow stores its pick because the pages after it
// continue where that pick left off, and this page continues nowhere — a tick is a paying or a
// charging and nothing else, and a pick that survived a reload could be sent a second time.
//
// This file is the page's own script, so the readers and the question it needs are kept here rather
// than shared: studentpicker.js, sessionstorage.js, jobrotation.js and transactionview.js do the
// same, and no page ever loads two of them.


// Every route below is asked of this site's own origin — `${API_ORIGIN}/pay-salary`, and
// '/api' once the page is on the deployed site — where the Cloudflare Pages Function
// functions/api/[[path]].js fetches the same route from the API and hands the answer back,
// the session cookie included. apibase.js, loaded before this file on every page, carries
// that origin and says why the API is no longer asked by its own hostname (a SameSite=lax
// cookie cannot cross from bonurabank.ca to rongrongwu.com). What follows API_ORIGIN is the
// API's own route, unchanged.
const PAY_SALARY_URL = `${API_ORIGIN}/pay-salary`;
const PAY_RENT_URL = `${API_ORIGIN}/pay-rent`;

// The app's admin-session probe, the route app.js (ADMIN_CHECK_URL), sessionstorage.js
// (PERMISSION_URL) and jobrotation.js (JOB_PERMISSION_URL) ask as well — POST with an empty body,
// because an empty body is refused before anything else is looked at, which is how the app hears
// whether the session cookie is still good.
const PAYROLL_PERMISSION_URL = `${API_ORIGIN}/adduser`;

// Where the admin behind the session cookie is named, and where that admin's students are listed —
// the same two routes and the same ?supervisor= filter jobrotation.js and the students table use.
const PAYROLL_ADMIN_URL = `${API_ORIGIN}/current-admin`;
const PAYROLL_STUDENTS_URL = `${API_ORIGIN}/getuser`;

// Fields the GET /current-admin reply may carry the admin name in, most likely first — the route is
// untyped, openapi.json only promises an object of strings.
const PAYROLL_ADMIN_NAME_KEYS = ['admin_name', 'name', 'admin', 'username'];

// Where a GET /getuser account carries the student's name, the job they hold and the salary that job
// pays. The route answers the accounts table's own columns — {"name": "Venus Wu", "password":
// "12345", "supervisor": "teacher", "birthday": "2017-10-30", "job": "Errand Leader",
// "job-salary": 55} (checked live) — so those three are read here; nothing else on an account is
// this page's business.
const PAYROLL_STUDENT_NAME_KEYS = ['name', 'student'];
const PAYROLL_STUDENT_JOB_KEYS = ['job'];
const PAYROLL_STUDENT_SALARY_KEYS = ['job-salary', 'salary'];

// Where an answer names the students it wrote rows for: the salary route answers `paid` and the rent
// route `charged` (both live above), and either is read on either page, because the two are the same
// list under two names.
const PAYROLL_WRITTEN_KEYS = ['paid', 'charged', 'records', 'students'];

// Where one of those rows carries the student it was written for and the figure it carries. A row is
// {"student": "Venus Wu", "amount": -200, "date": "..."} live, so those are the names read.
const PAYROLL_ROW_STUDENT_KEYS = ['student', 'user', 'name'];
const PAYROLL_ROW_AMOUNT_KEYS = ['amount', 'job-salary', 'salary'];

// The two words the box beside a student is spelled with, the sketch's own pair: a student who is
// not ticked reads "[uncheck]" and a student who is reads "[check]".
const PAYROLL_UNCHECKED_WORD = '[uncheck]';
const PAYROLL_CHECKED_WORD = '[check]';

// Which of the two pages this is, read once off the <body> (see the note at the top). Everything the
// two pages do differently hangs off these words: the route a tick is sent to, and the noun and the
// verb the page's sentences are written with.
const PAYROLL_IS_RENT = document.body?.dataset.payroll === 'rent';
const PAYROLL_URL = PAYROLL_IS_RENT ? PAY_RENT_URL : PAY_SALARY_URL;

// What one student is charged for the rent, from the live POST /pay-rent answer above: the route
// charges -200 and files the row with the memo "pay for desk and chair". Named in the question
// before anything is sent, and on the line under the box only as the figure the answer reports.
const PAYROLL_RENT_AMOUNT = 200;

const PAYROLL_NOUN = PAYROLL_IS_RENT ? 'rent' : 'salary';
const PAYROLL_VERB = PAYROLL_IS_RENT ? 'charged' : 'paid';
const PAYROLL_DONE = PAYROLL_IS_RENT ? 'Charged' : 'Paid';

// Where a finished payment goes: the home page, the same page every other finished flow is handed
// back to (app.js's HOME_URL), and for the same reason — the flow is done with the accounts it
// changed, and the hub is where the next thing starts.
const PAYROLL_HOME_URL = '/home.html';
const PAYROLL_REDIRECT_DELAY_MS = 900;

const payrollForm = document.getElementById('payrollform');
const payrollList = document.getElementById('payrolllist');
const payrollButton = document.getElementById('payrollbutton');
const payrollResults = document.getElementById('payrollresults');

// The students the backend listed, in the order they came back (alphabetical): the account's own
// spelling of the name, the job it holds and the salary that job carries — the three things this
// page's sentences are written from. [] until GET /getuser has answered.
let listedStudents = [];

// The students ticked in the box, in the order they were ticked: exactly what pressing the button
// sends, and in exactly that order. Empty until a row is clicked.
let tickedStudents = [];

// 'unknown' while the backend is being asked whether this browser holds an admin session, then
// 'granted' — the page may be used — or 'denied', which is every answer that leaves nothing to pay:
// no session, no admin named for the cookie, a student list that could not be read, an admin with no
// students. The button is grey while it is not 'granted', and the flag is what the keyboard is
// checked against as well, because a form can be submitted whether or not a button looks live.
let permission = 'unknown';

// The sentence the last permission answer wrote, so a press that is refused says what the page said
// when it loaded rather than nothing at all.
let permissionText = 'Asking the backend whether this browser holds an admin session…';

// True while a round of payments is in flight, so a second click cannot send the ticked students a
// second time.
let sending = false;

// One paragraph per line under the box, so a round that reported several students stays readable and
// the live region reads each of them out. { text, isError } lets the students a round could not pay
// stand in the red the app draws a failure in while the sentence about the ones that went through
// stays plain.
function showPayrollLines(lines) {
    if (!payrollResults) return;

    payrollResults.replaceChildren(...lines.map(function (line) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line.text;

        if (line.isError) {
            paragraph.className = 'results__error';
        }

        return paragraph;
    }));
}

function showPayrollMessage(text, isError) {
    showPayrollLines([{ text: text, isError: isError }]);
}

// The button's own words, as the page writes them ("Pay salaries" on salary.html, "Pay rent" on
// rent.html): read off the button rather than spelled again here, so a sentence that tells the admin
// what to press cannot name a button that is not on the page.
function payrollButtonWords() {
    return payrollButton?.textContent.trim() || (PAYROLL_IS_RENT ? 'Pay rent' : 'Pay salaries');
}

// First field that actually carries something, or null when none of them does. Empty strings count
// as missing, so they never turn into a blank name or a blank figure.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// Asks the backend whether this browser still holds an admin session, with the empty-body POST
// /adduser probe above. Answers with the verdict and with the sentence the page should show for it —
// the shape app.js's checkAdminPermission and jobrotation.js's jobAdminPermission answer in — and
// every refusal is an error the page says out loud rather than something to read in the console.
//   401 {"detail": "Not logged in"} -> no session
//   422 (or 2xx)                    -> only the empty body was refused, so the session cookie was
//                                      accepted and the admin is logged in. An empty body can never
//                                      create a user, so the check changes nothing.
async function payrollAdminPermission() {
    try {
        const response = await fetch(PAYROLL_PERMISSION_URL, {
            method: 'POST',
            credentials: 'include', // the admin session cookie
            body: new FormData()    // empty body: cannot add an account
        });

        if (response.ok || response.status === 422) {
            return { granted: true, text: 'Admin login confirmed by the backend.' };
        }

        if (response.status === 401) {
            console.error('Admin check: the backend refused the request — not logged in.');
            return {
                granted: false,
                text: 'Not logged in — the backend refused the request. Log into the admin account first, then reload this page.'
            };
        }

        console.error('Admin check error:', response.status, await response.text());
        return {
            granted: false,
            text: `Unexpected reply from the API (${response.status}) — your login could not be confirmed. Log into the admin account and reload this page.`
        };
    } catch (error) {
        console.error('Network Error:', error);
        return {
            granted: false,
            text: 'Network error — the login check could not reach the API. Log into the admin account and reload this page.'
        };
    }
}

// The admin behind the session cookie, or '' when the backend will not name one. Asked once per
// page: the answer cannot change without a login.
let payrollAdmin = null;

async function loggedInAdmin() {
    if (payrollAdmin !== null) return payrollAdmin;

    try {
        const response = await fetch(PAYROLL_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // the admin session cookie
        });

        payrollAdmin = response.ok ? adminNameIn(await response.json()) : '';
    } catch (error) {
        console.error('Current admin error:', error);
        payrollAdmin = '';
    }

    console.log(payrollAdmin
        ? `The students of the admin "${payrollAdmin}" are the ones this page will be filled with.`
        : 'The backend named no admin, so there is nobody to pay or charge.');

    return payrollAdmin;
}

// The admin name inside a GET /current-admin reply (an object of strings), or '' when the reply names
// nobody.
function adminNameIn(payload) {
    if (typeof payload === 'string') {
        return payload.trim();
    }

    if (payload === null || typeof payload !== 'object') {
        return '';
    }

    for (const key of PAYROLL_ADMIN_NAME_KEYS) {
        const value = payload[key];

        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

// The students of `admin`, alphabetically and without duplicates, each with the job it holds and the
// salary that job carries. An account only counts when its own supervisor field names that admin,
// exactly apart from surrounding space — the rule jobrotation.js, the transaction flow and the
// students table all follow — so another admin's student is never listed and an account with no
// supervisor belongs to nobody. GET /getuser?supervisor= filters on the backend as well (checked
// live: an unknown supervisor answers []), so the two checks agree.
async function payrollStudents(admin) {
    const response = await fetch(`${PAYROLL_STUDENTS_URL}?${new URLSearchParams({ supervisor: admin })}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    // No response annotation to read, so the answer is taken as the array of account objects the
    // route answers with — one row of the accounts table each. Anything else is a shape this page
    // cannot list students from, and it says so.
    const accounts = await response.json();

    if (!Array.isArray(accounts)) {
        throw new Error('the answer is not the array of accounts GET /getuser answers with');
    }

    const students = new Map();

    for (const account of accounts) {
        const name = accountNameIn(account);
        const supervisor = String(account?.supervisor ?? '').trim();

        if (name && supervisor === admin && !students.has(name)) {
            students.set(name, {
                name: name,
                job: accountJobIn(account),
                salary: accountSalaryIn(account)
            });
        }
    }

    // Case and accents are ignored while sorting, so "ada" and "Ada" sit together instead of every
    // capital coming first.
    return [...students.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// The student's name in one account of GET /getuser, trimmed: the name field of the account object
// (see PAYROLL_STUDENT_NAME_KEYS). A bare string names an account with nothing else, so it is taken
// as it stands; anything else names nobody.
function accountNameIn(account) {
    if (typeof account === 'string') {
        return account.trim();
    }

    if (account === null || typeof account !== 'object') {
        return '';
    }

    return String(firstField(account, PAYROLL_STUDENT_NAME_KEYS) ?? '').trim();
}

// The job one account holds, trimmed, or '' when the account has none.
function accountJobIn(account) {
    if (account === null || typeof account !== 'object') {
        return '';
    }

    return String(firstField(account, PAYROLL_STUDENT_JOB_KEYS) ?? '').trim();
}

// The salary that job pays, as a number, or null when the account carries no figure this page can
// read. Both spellings the accounts table uses are read (job-salary live, salary as the annotated
// models spell it), and a figure that is not a number — "" on an account with no job, say — is
// nothing rather than a zero, so the question never names a salary nobody pays.
function accountSalaryIn(account) {
    if (account === null || typeof account !== 'object') {
        return null;
    }

    const value = firstField(account, PAYROLL_STUDENT_SALARY_KEYS);

    if (value === null) {
        return null;
    }

    const salary = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(salary) ? salary : null;
}

// One ticked student as the page's own sentences name them: the account's own spelling, and, on the
// salary page, the job it holds and the salary that job carries, the two fields GET /getuser answers
// with — so the question spells out the figures Y pays before it is answered. The rent page's
// students are named plainly: every one of them is charged the one rent, which the question says
// once. A name the listing no longer knows, or one with no salary beside it, is named on its own.
function studentWords(name) {
    const account = listedStudents.find((student) => student.name === name);

    if (PAYROLL_IS_RENT || !account || account.salary === null) {
        return name;
    }

    return `${name} (${account.job ? `${account.job}, ` : ''}${account.salary} pts)`;
}

// One row of the box: the student's name, the word beside it and the box a click ticks — the same
// three spans, and the same classes, sessionstorage.js draws the transaction page's rows with, so
// the two boxes read and look alike. The word is this page's own pair (the sketch's "[uncheck]" and
// "[check]"), and the tick itself is only ever the row's aria-checked: styles.css draws the box off
// that attribute, and what it says is what a click reads back, so the drawn tick and the ticked list
// cannot drift apart. A row is drawn ticked, because the box arrives holding the whole roll; a click
// is what takes a student out of it.
function payrollRow(student) {
    const row = document.createElement('li');

    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'picker__option';
    option.setAttribute('role', 'checkbox'); // a button drawn as a checkbox: role + aria-checked
    option.setAttribute('aria-checked', 'true');
    option.setAttribute('data-student-name', student.name);

    const name = document.createElement('span');
    name.className = 'picker__name';
    name.textContent = student.name;

    const word = document.createElement('span');
    word.className = 'picker__choose';
    word.setAttribute('aria-hidden', 'true');
    word.textContent = PAYROLL_CHECKED_WORD;

    const box = document.createElement('span');
    box.className = 'picker__box';
    box.setAttribute('aria-hidden', 'true'); // a box with no text of its own; aria-checked says it

    option.append(name, word, box);
    row.appendChild(option);

    return row;
}

// The row drawn for a student, or null: a name is looked up the way every lookup in the app looks
// one up — surrounding space and case ignored — so a row drawn from the backend's spelling is found
// by the name the backend answered with.
function payrollRowFor(name) {
    const wanted = String(name).trim().toLowerCase();

    return payrollOptions().find(
        (option) => option.getAttribute('data-student-name').trim().toLowerCase() === wanted
    ) ?? null;
}

// The rows currently in the box, in the order they stand in it. Read off the box rather than kept in
// a variable, so what is ticked and what is written down cannot disagree.
function payrollOptions() {
    return [...(payrollList?.querySelectorAll('.picker__option') ?? [])];
}

// Draws every student into the box, in the order they were read (alphabetical), every one of them
// ticked: this page always arrives at the same box, whatever it held a moment ago. Nothing is
// restored from an earlier visit on purpose — a tick here is a payment, and a payment that outlived
// the page could be sent a second time.
function fillPayrollPicker(students) {
    if (!payrollList) return;

    // Written from the rows about to be drawn, so the ticked list and the drawn ticks agree from the
    // first frame on.
    tickedStudents = students.map((student) => student.name);
    payrollList.replaceChildren(...students.map(payrollRow));
}

// The line inside the box while there is nothing to tick: the reason, the way sessionstorage.js's
// noteInPicker and jobrotation.js's jobNoteInPicker write theirs. The rows replace it as soon as
// there are any.
function noteInPicker(text) {
    if (!payrollList) return;

    const note = document.createElement('li');
    note.className = 'picker__note';
    note.textContent = text;

    payrollList.replaceChildren(note);
}

// Ticks or unticks one student: aria-checked is both the state the stylesheet draws the box from and
// the state a screen reader is told, so writing it and the word beside it is the whole of the tick —
// and the ticked list is written from that same click rather than read back later. The line under the
// box is not written here: a click writes it once, and a round of payments that unticked a student on
// its way through would otherwise wipe out the line that round is reporting.
function setTicked(name, ticked) {
    const option = payrollRowFor(name);
    if (!option) return;

    option.setAttribute('aria-checked', ticked ? 'true' : 'false');

    const word = option.querySelector('.picker__choose');
    if (word) {
        word.textContent = ticked ? PAYROLL_CHECKED_WORD : PAYROLL_UNCHECKED_WORD;
    }

    const at = tickedStudents.indexOf(name);

    if (ticked && at === -1) {
        tickedStudents.push(name);
    } else if (!ticked && at !== -1) {
        tickedStudents.splice(at, 1);
    }
}

// A click on a row: the tick is turned over, the line under the box says who is ticked now, and the
// button follows — live exactly while there is something to pay and a session to pay it with. Read
// off the row's own aria-checked, because that is what was drawn.
function toggleTickedStudent(option) {
    const name = option.getAttribute('data-student-name');
    if (!name || sending) return; // nothing is ticked or unticked while a round is in flight

    setTicked(name, option.getAttribute('aria-checked') !== 'true');
    showPickMessage();
    setPayrollEnabled(permission === 'granted' && tickedStudents.length > 0);
}

// The line under the box while nothing is being sent: who is ticked now, and what pressing the button
// would do. Only written once the session has been confirmed, because before that the line belongs to
// the permission check, which is the reason the box has no rows in it to tick.
function showPickMessage() {
    if (permission !== 'granted') return;

    const button = payrollButtonWords();

    showPayrollMessage(
        tickedStudents.length
            ? `${tickedStudents.length === 1 ? 'One student is ticked' : `${tickedStudents.length} students are ticked`}: ${tickedStudents.join(', ')} — pressing ${button} ${PAYROLL_IS_RENT ? 'charges the rent to each of them' : 'pays each of them the salary of their job'}, one student at a time.`
            : `Nothing is ticked yet — click a student in the box above to tick them, and click them again to untick. Pressing ${button} with nothing ticked does nothing.`,
        false
    );
}

// Sets the button's greyed-out state, the aria-disabled styles.css draws for .btn — and takes it out
// of the tab order while it is grey, the way the history page's Refresh is taken out, so a keyboard
// cannot press what a mouse cannot.
function setPayrollEnabled(enabled) {
    if (!payrollButton) return;

    if (enabled) {
        payrollButton.removeAttribute('aria-disabled');
        payrollButton.removeAttribute('tabindex');
    } else {
        payrollButton.setAttribute('aria-disabled', 'true');
        payrollButton.setAttribute('tabindex', '-1');
    }
}


// ------------------------------------------------------- the Y/N question ----
// Paying a salary and charging the rent both change an account for good — the app has no undo — so
// the ticked roll is put in front of the admin once more before anything is sent: "confirm pay
// salaries, Y/N" on one page and "confirm pay rent, Y/N" on the other, answered with two buttons.
// window.confirm() would answer OK/Cancel, which is not what those questions ask, so the question is
// the app's own dialog — the same overlay app.js, the approving pages, remove.html and
// transactionview.js ask theirs with, .confirm in styles.css — built on first use and hidden again
// until it is needed. Nothing is sent while it is up, and the students it names are the students the
// requests will carry, because both are built from the same ticked list.
const CONFIRM_YES = 'Y';
const CONFIRM_NO = 'N';

let confirmDialog = null;   // the overlay, built the first time the button is pressed
let confirmHeading = null;  // the h2 inside it: what is being asked
let confirmText = null;     // the sentence inside it: the students that are about to be paid
let confirmYes = null;      // the yes button, where the focus lands
let confirmNo = null;       // the no button beside it
let confirmBack = null;     // where the keyboard goes once the question is answered
let confirmPending = null;  // { promise, resolve } of the question on screen

// The question this page asks, in the app's own shape: the button's own words, lowercased, behind
// "confirm" and in front of ", Y/N" — "confirm pay rent, Y/N", as transactionview.js asks "confirm
// delete transaction, Y/N" and app.js asks "confirm transaction, Y/N".
function payrollQuestion() {
    return `confirm ${payrollButtonWords().toLowerCase()}, Y/N`;
}

// One of the two answers. Both are ordinary .btn buttons, so they look and behave like every other
// button on the page.
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

// The overlay the question is asked in: the same .confirm markup app.js builds, so it is styled by
// the same rules and reads to a screen reader as the same dialog.
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

    // The two answers work as keys too — the question says so — and Escape is the same answer as the
    // quieter one, so the question can always be dismissed without a mouse. The listener lives on the
    // document because the buttons are the only things inside the overlay and the keyboard may be
    // anywhere.
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

// Puts the question on screen and answers true for the yes button, false for the other. A question
// already up is the question that has to be answered, so a second call shares it instead of stacking
// another one on top.
function askConfirmation(question, text, options = {}) {
    if (confirmPending) {
        return confirmPending.promise;
    }

    if (!confirmDialog) {
        buildConfirmDialog();
    }

    // The dialog is built once and asked again on every press, so every word on the panel is written
    // over the last question: the heading, the sentence, and the yes button's colour — the accent
    // green .btn--primary, the ordinary button that takes you further in, which is the treatment the
    // approving pages' Y wears too. The two money answers are not the remove page's: that question
    // takes a student away for good and asks it in the red, while paying a salary and charging the
    // rent are what these two pages are for, and the answer that does them looks like the answer
    // that does anything else. N keeps the quiet outline beside it.
    confirmHeading.textContent = question;
    confirmText.textContent = text;
    confirmYes.className = 'btn btn--primary';

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

// Answers the question and takes it off the screen. The first answer is the answer: once it is gone
// there is nothing left to resolve, so a second click or key cannot change what was decided. The
// keyboard goes back to the button the question was asked from, so the admin can carry on without
// reaching for the mouse.
function answerConfirmation(answer) {
    const pending = confirmPending;

    if (!pending) {
        return;
    }

    confirmPending = null;
    confirmDialog.hidden = true;
    confirmBack?.focus();

    pending.resolve(answer);
}


// --------------------------------------------------------- the payments ----
// What the question says, with every ticked student named and what each answer does, the way
// describeTransaction and describeDelete write theirs in the app's own words. The salary page names
// the job and the salary that job carries beside each student, so the figures about to be paid can be
// read once more before Y; the rent page names the one rent every student is charged, the figure the
// rent route itself answered with (PAYROLL_RENT_AMOUNT), once.
function describePayment(picked) {
    const named = picked.map((student) => (PAYROLL_IS_RENT ? student : studentWords(student))).join(', ');
    const them = picked.length === 1 ? 'that student' : 'those students';

    return PAYROLL_IS_RENT
        ? `The backend's rent of ${PAYROLL_RENT_AMOUNT} pts is charged to ${named} — one student at a time. Y charges ${them}, N leaves their accounts as they are.`
        : `The salary of the job each holds is paid to ${named} — one student at a time. Y pays ${them}, N leaves their accounts as they are.`;
}

// The rows an answer says it wrote, or null when it carries no such list at all — the difference
// between "the backend wrote no row for this student" (a list that is empty or names somebody else)
// and "this answer is not one this page can read", which is not the same thing and must not be
// reported as a payment that happened.
function writtenRows(result) {
    for (const key of PAYROLL_WRITTEN_KEYS) {
        if (Array.isArray(result?.[key])) {
            return result[key];
        }
    }

    return null;
}

// The name inside one written row: a row of plain names, or the row object live above. A name that is
// not a string (a number, an object) is read as its text, so a row that names somebody is not passed
// over; a row that names nobody is ''.
function writtenRowIn(rows, student) {
    const wanted = String(student).trim().toLowerCase();

    return rows.find((row) => {
        const name = row !== null && typeof row === 'object'
            ? firstField(row, PAYROLL_ROW_STUDENT_KEYS)
            : row;

        return String(name ?? '').trim().toLowerCase() === wanted;
    }) ?? null;
}

// The figure one written row carries, as a number, or null when the row carries none this page can
// read. The rent route's own rows are negative (-200, live above), so the sign is part of the figure
// and is never dropped.
function rowAmount(row) {
    if (row === null || typeof row !== 'object') {
        return null;
    }

    const value = firstField(row, PAYROLL_ROW_AMOUNT_KEYS);

    if (value === null) {
        return null;
    }

    const amount = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(amount) ? amount : null;
}

// The figure a written row carries, spelled the way the rest of the app spells one: with its sign —
// "-200 pts" — because the rent route's own row is negative, and with the one point spelled "1 pt".
function amountWords(amount) {
    if (amount === null) {
        return 'a row with no figure in it';
    }

    return `${amount} ${Math.abs(amount) === 1 ? 'pt' : 'pts'}`;
}

// The sentence a 200 answer carries, or a plain one when it carries none: `message` is what both
// routes write there (the live answers at the top), and anything that is not a string is nothing to
// read, so the page says the little it knows instead of inventing an answer.
function backendMessage(result, student) {
    const message = result?.message;

    return typeof message === 'string' && message.trim()
        ? message.trim()
        : `the answer names no row for ${student}`;
}

// One student's payment: the body the route declares and nothing else, one request per student
// because that is what the routes take. Answers { student, written, amount, text } — written is
// whether the backend wrote a row naming this student, which is the only thing that makes the press a
// payment, and text is the line the round reports for them either way.
async function sendPayment(student) {
    try {
        const response = await fetch(PAYROLL_URL, {
            method: 'POST',
            credentials: 'include', // the admin session cookie
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student: student })
        });

        // A refusal can answer with something that is not JSON at all, so the body is read once and
        // never trusted to parse.
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Payment error:', response.status, result);

            return {
                student: student,
                written: false,
                amount: null,
                text: `${student}: nothing was written — POST ${PAYROLL_NOUN} answered ${response.status}, so nothing was sent for them.`
            };
        }

        const rows = writtenRows(result);
        const row = rows ? writtenRowIn(rows, student) : null;

        if (!row) {
            console.log('Payment skipped:', student, result);

            return {
                student: student,
                written: false,
                amount: null,
                text: `${student}: nothing was written — the backend answered “${backendMessage(result, student)}”.`
            };
        }

        return {
            student: student,
            written: true,
            amount: rowAmount(row),
            text: `${student}: ${amountWords(rowAmount(row))}`
        };
    } catch (error) {
        console.error('Network Error:', error);

        return {
            student: student,
            written: false,
            amount: null,
            text: `${student}: nothing was written — the backend could not be reached (network error).`
        };
    }
}

// The line under the box when a round is over: what was done, then one line per student the round
// could not pay, then where the admin stands — either the way on to the home page, or the students
// that are still ticked and the button that tries them again. The sentence about what went through is
// written from the rows the backend wrote, never from the status of the requests.
function reportPayments(results) {
    const done = results.filter((result) => result.written);
    const left = results.filter((result) => !result.written);
    const lines = [];

    if (done.length) {
        lines.push({
            text: `${PAYROLL_DONE} ${done.length} of ${results.length} — ${done.map((result) => `${result.student} ${amountWords(result.amount)}`).join(', ')}.`,
            isError: false
        });
    } else {
        lines.push({
            text: results.length === 1
                ? `Nothing was ${PAYROLL_VERB} — the one student ticked was left alone, and they are still ticked.`
                : `Nothing was ${PAYROLL_VERB} — none of the ${results.length} students ticked were, and they are all still ticked.`,
            isError: true
        });
    }

    for (const result of left) {
        lines.push({ text: result.text, isError: true });
    }

    lines.push(left.length
        ? { text: `Press ${payrollButtonWords()} again to try ${left.length === 1 ? 'that student' : 'those students'} once more.`, isError: false }
        : { text: 'Taking you back to the home page…', isError: false });

    showPayrollLines(lines);
}

// Hands the admin back to the home page once the round is over, after a pause long enough to read what
// was reported — the ending every other finished flow in the app has, and the same 900ms app.js gives
// its own redirectHomeAfter.
function redirectHomeAfter() {
    window.setTimeout(function () {
        window.location.href = PAYROLL_HOME_URL;
    }, PAYROLL_REDIRECT_DELAY_MS);
}

// Pay: the one button on the page. Nothing leaves without a confirmed session and at least one ticked
// student, and nothing at all is sent until the question has been answered with Y.
async function runPayment() {
    if (sending) return; // one round at a time, however fast the clicks come

    // The session is asked about again here, because a page can stand open while a session runs out
    // and the students in the box were listed while it was still good. The keyboard reaches this check
    // too: a greyed-out button is no tab stop, and a form can be submitted without a button.
    if (permission !== 'granted') {
        showPayrollMessage(permissionText, true);
        return;
    }

    const picked = tickedStudents.slice();

    if (!picked.length) {
        showPayrollMessage(`Nothing is ticked, so there is nobody to ${PAYROLL_IS_RENT ? 'charge the rent to' : 'pay a salary to'} — click a student in the box above to tick them.`, true);
        return;
    }

    sending = true;
    setPayrollEnabled(false);
    showPayrollMessage('Asking the backend whether this browser still holds an admin session…', false);

    try {
        const probe = await payrollAdminPermission();
        permissionText = probe.text;

        if (!probe.granted) {
            permission = 'denied';
            showPayrollMessage(probe.text, true);
            return;
        }

        const confirmed = await askConfirmation(payrollQuestion(), describePayment(picked), {
            returnFocus: payrollButton
        });

        if (!confirmed) {
            showPayrollMessage(`Nothing was sent — the ${picked.length === 1 ? `one student ticked (${picked[0]})` : `${picked.length} students ticked`} was not confirmed with Y, and the box is as it was.`, true);
            return;
        }

        showPayrollMessage(`${PAYROLL_IS_RENT ? 'Charging' : 'Paying'} ${picked.length} student${picked.length === 1 ? '' : 's'}, one at a time…`, false);

        const results = [];

        for (const student of picked) {
            const result = await sendPayment(student);
            results.push(result);

            // A student the backend wrote a row for is unticked the moment that is known, so a press
            // that went through cannot be sent again by another press: the box is what the next round
            // reads, and the ticked list is written from it.
            if (result.written) {
                setTicked(student, false);
            }
        }

        reportPayments(results);

        if (results.every((result) => result.written)) {
            redirectHomeAfter();
        }
    } catch (error) {
        console.error('Payment error:', error);
        showPayrollMessage('Network error — the payments could not be sent, and nothing was written for the students named above.', true);
    } finally {
        sending = false;
        setPayrollEnabled(permission === 'granted' && tickedStudents.length > 0);
    }
}


// -------------------------------------------------------- the page itself ----
// The page starts itself: the backend is asked whether this browser holds an admin session, the admin
// behind the cookie is read, and their students are listed in the box. Nothing is listed before that
// first answer, and the button stays grey until there is a student to pay and a session to pay them
// with — the shape jobrotation.js's own page-opening call gives that page.
async function openPayrollPage() {
    if (!payrollForm || !payrollList) return;

    setPayrollEnabled(false);
    showPayrollMessage('Asking the backend whether this browser holds an admin session…', false);

    const probe = await payrollAdminPermission();
    permissionText = probe.text;

    if (!probe.granted) {
        permission = 'denied';
        noteInPicker(probe.text);
        showPayrollMessage(probe.text, true);
        return;
    }

    showPayrollMessage('Reading the students of the signed-in admin…', false);

    const admin = await loggedInAdmin();

    if (!admin) {
        permission = 'denied';

        const text = 'No admin session — the backend named no admin for this browser, so there is nobody whose students could be listed. Log into the admin account, then reload this page.';

        noteInPicker(text);
        showPayrollMessage(text, true);
        return;
    }

    let students;

    try {
        students = await payrollStudents(admin);
    } catch (error) {
        console.error('Student list error:', error);
        permission = 'denied';

        const text = `The students of “${admin}” could not be read — GET /getuser answered: ${error.message}. Reload the page to try again.`;

        noteInPicker(text);
        showPayrollMessage(text, true);
        return;
    }

    if (!students.length) {
        permission = 'denied';

        const text = `The backend lists no student with “${admin}” as their supervisor, so there is nobody to ${PAYROLL_IS_RENT ? 'charge the rent to' : 'pay a salary to'}. Add a student of this admin first, then reload this page.`;

        noteInPicker(text);
        showPayrollMessage(text, true);
        return;
    }

    // The listing and the permission are the page's, in that order: the students are in the box before
    // it may be used, and the box arrives with every one of them ticked, which is a box ready to be
    // used at once.
    listedStudents = students;
    fillPayrollPicker(students);
    permission = 'granted';
    setPayrollEnabled(permission === 'granted' && tickedStudents.length > 0);

    const listed = students.length === 1 ? '1 student' : `${students.length} students`;

    console.log(`${listed} of the admin "${admin}" listed for ${PAYROLL_NOUN}.`);

    // What the box holds, said the way a count is said: one student is the one, everything above it
    // is all of them. The sentence then says which way round the box is — the ticking is already done,
    // so what it spells out is what an untick is for.
    const boxState = students.length === 1
        ? `The one student of “${admin}” is ticked`
        : `All ${listed} of “${admin}” are ticked, in alphabetical order`;

    showPayrollMessage(`${boxState} — untick anyone who is not to be ${PAYROLL_IS_RENT ? 'charged the rent' : 'paid'}, and press ${payrollButtonWords()}.`, false);
}

// One listener for the whole box, so a row drawn later needs no listener of its own. A click walks up
// to the row it landed in, whichever part of that row — the name, "[uncheck]" or the box — it hit, and
// a click that missed every row does nothing.
payrollList?.addEventListener('click', function (event) {
    const option = event.target.closest?.('.picker__option');

    if (!option) return;

    toggleTickedStudent(option);
});

// Enter inside the form submits it, so the button and the keyboard take the same path; the page is
// asked, never reloaded.
payrollForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    runPayment();
});

openPayrollPage();


