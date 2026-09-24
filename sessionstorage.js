// Session handling for the transaction flow.
//
// transaction1.html asks the backend whether this browser still holds an admin
// login, and asks it again whether the typed student exists before it lets the
// flow move on. The confirmed username is stored in sessionStorage, and the later
// pages read that username back so every step knows which account is being
// changed — and refuse to carry on when no student has been confirmed.
// Loaded by transaction1.html and transaction-middle.html.

const STUDENT_USERNAME_KEY = 'student_username';
const TRANSACTION_NEXT_URL = '/transaction-middle.html';

// Public account list, the route the typing picker in studentpicker.js also
// loads. Its ?name= filter is an exact, case-sensitive lookup (checked live:
// ?name=a answers the account "a", while ?name=A and ?name=Arm both answer []),
// so the filtered call is the direct answer to "is this a student account?", and
// the whole list is only fetched when that answered nothing, to still accept a
// username that was typed in the wrong case.
const STUDENT_ACCOUNTS_URL = 'https://api.rongrongwu.com/getuser';

// What the results block below the form says when the typed username is not an
// account the backend knows — word for word what this flow was asked to show.
const INVALID_STUDENT_MESSAGE = 'invalid user, make sure you typed it right/add the user';

// Protected route used to ask whether this browser is still an admin session.
// The API has no "who am I" route, and this one is the cheapest way to ask:
// POST /adduser with an empty body answers "Not logged in" (401) before it ever
// looks at the body, exactly like the add-account form in app.js shows.
//   401 {"detail": "Not logged in"} -> no admin session, the flow stays shut
//   422                             -> only the empty body was rejected, so the
//                                      session was accepted and permission is
//                                      granted. An empty body can never create
//                                      a user, so the check changes nothing.
const PERMISSION_URL = 'https://api.rongrongwu.com/adduser';

// 422 is the "you are logged in" answer, not a failure — but Chrome still prints
// it in red ("422 (Unprocessable Content)") because that is what the HTTP status
// says, and JavaScript cannot silence that line. Nothing is created either way.
// checkLoginPermission() prints a console note saying as much, and every answer
// that does not confirm a session gets the red on-page message instead.

const transactionForm = document.getElementById('transactionform');
const transactionNext = document.getElementById('transactionnext');
const transactionStudent = document.getElementById('transactionstudent');
const transactionSession = document.getElementById('transactionsession');

// 'unknown' while the backend is being asked, then 'granted' or 'denied'.
let permission = 'unknown';

// True while GET /getuser is being asked about the typed student, so a double
// click cannot start a second check.
let studentCheckRunning = false;

// The username the last check could not confirm, and the line that says why. While
// one is remembered the Next link stays grey and unclickable and that same name is
// not asked about twice; typing anything into the field clears both, because an
// answer about one name says nothing about another.
let blockedStudent = '';
let blockedMessage = '';

// The username as typed, trimmed; '' when the field is empty.
function typedStudentUsername() {
    const field = transactionForm?.elements.namedItem('student_username');
    return field ? field.value.trim() : '';
}

// Saves the name the backend confirmed. The account's own spelling is what gets
// stored — and shown back in the field — so a name typed in the wrong case cannot
// travel on as typed.
function storeStudentUsername(username) {
    sessionStorage.setItem(STUDENT_USERNAME_KEY, username);

    const field = transactionForm?.elements.namedItem('student_username');

    if (field) {
        field.value = username;
    }

    console.log('Stored student username in sessionStorage:', username);
}

// Forgets the stored username. A name that turned out not to be an account must
// not leave an older, confirmed one behind: the later pages read this key and
// open a transaction for it, and a transaction may only ever run for a name the
// backend has just agreed with.
function forgetStudentUsername() {
    sessionStorage.removeItem(STUDENT_USERNAME_KEY);
    console.log('Forgot the stored student username: the typed name is not an account.');
}

// transaction1.html: Next is a plain link, so the click is always held back until
// the backend has agreed about the student; confirmStudent() opens the next page
// itself once it has.
transactionNext?.addEventListener('click', function (event) {
    event.preventDefault();
    confirmStudent();
});

// Pressing Enter inside the single input submits the form, not the link.
transactionForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    confirmStudent();
});

// Editing the username lifts the lock: the backend's answer was about the name
// that was asked about, not about this new one.
transactionForm?.addEventListener('input', function () {
    if (!blockedStudent) return;

    blockedStudent = '';
    blockedMessage = '';
    setNextEnabled(permission === 'granted');
});

// transaction-middle.html: show who the transaction is for, and keep the four
// transaction types out of reach while no student has been confirmed — a type
// opened without one would start a transaction for nobody, which is exactly what
// this page must not allow.
if (transactionStudent) {
    const confirmedStudent = sessionStorage.getItem(STUDENT_USERNAME_KEY);

    if (confirmedStudent) {
        transactionStudent.textContent = confirmedStudent;
    } else {
        transactionStudent.textContent = 'no student confirmed by the backend — go back and enter a username that exists';
        lockTransactionTypes();
    }
}

// Switches the four type links off the same way the Next link is switched off:
// aria-disabled, which styles.css greys out and makes unclickable, plus no href so
// they cannot be tabbed to, copied or opened in a new tab either. The footnote's
// Back link stays live: it is the way out of this state.
function lockTransactionTypes() {
    document.querySelectorAll('.actions .btn').forEach(function (link) {
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
        link.setAttribute('tabindex', '-1');
    });
}

// transaction1.html: ask the backend for login permission as the page opens.
async function checkLoginPermission() {
    if (!transactionForm) return; // only transaction1.html has the form

    // Next is grey and unclickable until the backend has confirmed the session.
    setNextEnabled(false);

    try {
        const response = await fetch(PERMISSION_URL, {
            method: 'POST',
            credentials: 'include', // send the admin session cookie
            body: new FormData()    // empty body: cannot add an account
        });

        // 422 means /adduser only complained about the empty body, so the session
        // cookie was accepted: the admin is logged in. Spell that out, because the
        // browser logs the status in red and it reads like a failure.
        if (response.ok || response.status === 422) {
            permission = 'granted';
            setNextEnabled(true);
            console.info(`POST /adduser answered ${response.status} on purpose: the empty body was rejected, which is how this app hears "admin session accepted". It is the logged-in signal, not an error, and no account was created.`);
            showSessionMessage('Admin login confirmed by the backend — you can open a transaction.', false);
            return;
        }

        if (response.status === 401) {
            denyPermission('Not logged in — the backend refused the request. Log into the admin account first, then reload this page.');
            return;
        }

        denyPermission(`Unexpected reply from the API (${response.status}) — your login could not be confirmed. Log into the admin account and reload this page.`);
    } catch (error) {
        console.error('Network Error:', error);
        denyPermission('Network error — the login check could not reach the API. Log into the admin account and reload this page.');
    }
}

// Shuts the transaction flow down: Next goes grey and unclickable (the
// .btn[aria-disabled] state in styles.css) and the results line below the form
// says in red to log in. Every answer that does not confirm an admin session ends
// up here, so the flow can never start on an unconfirmed login.
function denyPermission(message) {
    permission = 'denied';
    setNextEnabled(false);
    showSessionMessage(message, true);
}

// Shared gate for the Next link and the Enter key.
function permissionGranted() {
    if (permission === 'granted') {
        return true;
    }

    if (permission === 'denied') {
        alert('log into admin account before making a transaction');
    }

    return false;
}

function setNextEnabled(enabled) {
    if (!transactionNext) return;

    if (enabled) {
        transactionNext.removeAttribute('aria-disabled');
    } else {
        transactionNext.setAttribute('aria-disabled', 'true');
    }
}

function showSessionMessage(text, isError) {
    if (!transactionSession) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    transactionSession.replaceChildren(paragraph);
}

// transaction1.html: the check behind both Next and Enter. The admin session has
// to be confirmed first, then the backend is asked whether the typed username is
// an account it knows about; only then is the name stored and the next page
// opened. Otherwise the flow stays put and the results line below the form says
// why.
async function confirmStudent() {
    if (studentCheckRunning) return; // one check at a time, however fast the clicks
    if (!permissionGranted()) return;

    const username = typedStudentUsername();

    if (!username) {
        alert('Enter a student username first.');
        return;
    }

    // A name the backend has already called invalid is not asked about again: that
    // answer stands until the field changes, so Enter cannot be hammered into
    // asking the same question over and over.
    if (blockedStudent === username) {
        showSessionMessage(blockedMessage, true);
        return;
    }

    studentCheckRunning = true;
    setNextEnabled(false);
    showSessionMessage(`Asking the backend whether "${username}" is a student account…`, false);

    try {
        const account = await findStudentAccount(username);

        if (!account) {
            blockStudent(username, INVALID_STUDENT_MESSAGE);
            forgetStudentUsername();
            return; // no student, no way on: Next stays grey until the name changes
        }

        blockedStudent = '';
        blockedMessage = '';
        storeStudentUsername(account);
        showSessionMessage(`${account} confirmed by the backend — opening the transaction…`, false);
        window.location.href = TRANSACTION_NEXT_URL;
    } catch (error) {
        console.error('Student check error:', error);
        blockStudent(username, 'Network error — the account check could not reach the API, so the transaction stays locked. Try again.');
    } finally {
        studentCheckRunning = false;

        // Grey and unclickable for every username that did not come back confirmed
        // — a bad name or a check that could not be completed. Editing the field is
        // what unlocks another attempt.
        if (!blockedStudent) {
            setNextEnabled(true);
        }
    }
}

// Locks the flow on a username the backend did not confirm: the results line says
// in red why, and Next is left in the .btn[aria-disabled] state styles.css greys
// out and makes unclickable. Remembering the name stops the same question being
// asked twice, so a held-down Enter cannot hammer the API.
function blockStudent(username, message) {
    blockedStudent = username;
    blockedMessage = message;
    setNextEnabled(false);
    showSessionMessage(message, true);
}

// The backend's own spelling of the typed username, or null when no account
// carries it. The ?name= filter answers the exact username straight away; a name
// typed in the wrong case comes back empty, because that filter is case-sensitive,
// so the whole list is asked once before the username is called invalid.
async function findStudentAccount(username) {
    const filtered = await studentNamesFromUrl(
        `${STUDENT_ACCOUNTS_URL}?${new URLSearchParams({ name: username })}`
    );
    const match = matchingStudentName(filtered, username);

    if (match) {
        return match;
    }

    return matchingStudentName(await studentNamesFromUrl(STUDENT_ACCOUNTS_URL), username);
}

async function studentNamesFromUrl(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    return studentNames(await response.json());
}

// The listed name that is the typed username once surrounding space and case are
// ignored, or null when none of them is.
function matchingStudentName(names, username) {
    const wanted = username.trim().toLowerCase();

    for (const name of names) {
        if (name.trim().toLowerCase() === wanted) {
            return name;
        }
    }

    return null;
}

// Every account name in a GET /getuser payload. The shapes accepted mirror
// studentAccountList in studentpicker.js, because that endpoint is untyped:
//   [{"name": "X"}]                                          -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}  -> the inner list
//   {"name": "X"} / "X"                                      -> wrapped in an array
//   null / undefined / ""                                    -> []
function studentNames(payload) {
    return studentEntries(payload)
        .map((entry) => studentEntryName(entry))
        .filter((name) => name !== null);
}

function studentEntries(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload === null || typeof payload !== 'object') {
        return payload ? [payload] : [];
    }

    for (const key of ['users', 'accounts', 'data', 'items']) {
        const nested = payload[key];

        if (Array.isArray(nested)) {
            return nested;
        }

        if (nested && typeof nested === 'object') {
            return studentEntries(nested);
        }
    }

    return [payload];
}

// Fields an account object may carry its username in, most likely first — the
// same order studentpicker.js reads them in.
function studentEntryName(entry) {
    if (entry === null || typeof entry !== 'object') {
        return entry ? String(entry) : null;
    }

    for (const key of ['name', 'username', 'account', 'id']) {
        const value = entry[key];

        if (value !== undefined && value !== null && value !== '') {
            return String(value);
        }
    }

    return null;
}


checkLoginPermission();
