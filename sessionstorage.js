// Session handling for the transaction flow.
//
// transaction1.html asks the backend whether this browser still holds an admin
// login, stores the student username in sessionStorage, and the later pages read
// that username back so every step knows which account is being changed.
// Loaded by transaction1.html and transaction-middle.html.

const STUDENT_USERNAME_KEY = 'student_username';
const TRANSACTION_NEXT_URL = '/transaction-middle.html';

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

// Stores the trimmed username and returns whether that worked.
function storeStudentUsername() {
    const field = transactionForm?.elements.namedItem('student_username');
    const username = field ? field.value.trim() : '';

    if (!username) {
        alert('Enter a student username first.');
        return false;
    }

    sessionStorage.setItem(STUDENT_USERNAME_KEY, username);
    console.log('Stored student username in sessionStorage:', username);
    return true;
}

// transaction1.html: Next is a plain link, so the permission check and an empty
// username are what cancel the navigation.
transactionNext?.addEventListener('click', function (event) {
    if (!permissionGranted() || !storeStudentUsername()) {
        event.preventDefault();
    }
});

// Pressing Enter inside the single input submits the form, not the link.
transactionForm?.addEventListener('submit', function (event) {
    event.preventDefault();

    if (permissionGranted() && storeStudentUsername()) {
        window.location.href = TRANSACTION_NEXT_URL;
    }
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

checkLoginPermission();

