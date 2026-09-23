// Session handling for the transaction flow.
//
// transaction1.html asks the backend whether this browser still holds an admin
// login, and asks it again whether the typed student exists before it lets the
// flow move on. The confirmed username is stored in sessionStorage, and the later
// pages read that username back so every step knows which account is being
// changed.
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

const transactionForm = document.getElementById('transactionform');
const transactionNext = document.getElementById('transactionnext');
const transactionStudent = document.getElementById('transactionstudent');
const transactionSession = document.getElementById('transactionsession');

// 'unknown' while the backend is being asked, then 'granted' or 'denied'.
let permission = 'unknown';

// True while GET /getuser is being asked about the typed student, so a double
// click cannot start a second check.
let studentCheckRunning = false;

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

// transaction-middle.html: show who the transaction is for.
if (transactionStudent) {
    transactionStudent.textContent = sessionStorage.getItem(STUDENT_USERNAME_KEY) || 'no student selected';
}

// transaction1.html: ask the backend for login permission as the page opens.
async function checkLoginPermission() {
    if (!transactionForm) return; // only transaction1.html has the form

    setNextEnabled(false);

    try {
        const response = await fetch(PERMISSION_URL, {
            method: 'POST',
            credentials: 'include', // send the admin session cookie
            body: new FormData()    // empty body: cannot add an account
        });

        if (response.status === 401) {
            permission = 'denied';
            showSessionMessage(
                'Not logged in — the backend refused the request. Log into the admin account first.',
                true
            );
            return;
        }

        // 422 means /adduser only complained about the empty body, so the
        // session cookie was accepted: the admin is logged in.
        if (response.ok || response.status === 422) {
            permission = 'granted';
            setNextEnabled(true);
            showSessionMessage('Admin login confirmed by the backend — you can open a transaction.', false);
            return;
        }

        permission = 'denied';
        showSessionMessage(`Unexpected reply from the API (${response.status}) — cannot confirm your login.`, true);
    } catch (error) {
        console.error('Network Error:', error);
        permission = 'denied';
        showSessionMessage('Network error — the login check could not reach the API.', true);
    }
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

    studentCheckRunning = true;
    setNextEnabled(false);
    showSessionMessage(`Asking the backend whether "${username}" is a student account…`, false);

    try {
        const account = await findStudentAccount(username);

        if (!account) {
            showSessionMessage('invalid user, make sure you typed it right/add the user', true);
            return; // the flow stays on this page so the username can be fixed
        }

        storeStudentUsername(account);
        showSessionMessage(`${account} confirmed by the backend — opening the transaction…`, false);
        window.location.href = TRANSACTION_NEXT_URL;
    } catch (error) {
        console.error('Student check error:', error);
        showSessionMessage('Network error — the account check could not reach the API.', true);
    } finally {
        studentCheckRunning = false;
        setNextEnabled(true);
    }
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
