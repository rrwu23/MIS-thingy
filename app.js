console.log(document.getElementById("getusersform"));
console.log("loaded")

// 1. Select the form
const form = document.getElementById('adduserform');

// The safety check on the add account page: the student's account username has to
// be typed a second time, and the account is only created when both fields agree,
// so a slip of the finger cannot quietly make an account nobody can find. The
// account is looked up by its name, exact apart from space, so surrounding space
// and case are ignored here — the same way the transaction flow compares a typed
// username with the listed ones (matchingStudentName in sessionstorage.js).
function sameUsername(first, second) {
    return first.trim().toLowerCase() === second.trim().toLowerCase();
}

// The add account page's birthday check. A date input answers with YYYY-MM-DD, the one shape
// a date column reads, or with an empty string when it could not make sense of what was
// typed, so the shape is the whole test: a day written in it is a day the browser could name.
// The pattern is what catches a value that did not come from a date input at all, the way a
// hand-typed or scripted one can.
//
// Every day is taken, a birthday long past and a birthday still to come alike, and whichever
// day arrives is stored exactly as typed. The field is a date of record, not a rule about who
// may hold an account, so nothing caps it at today: it carries no max attribute for the
// browser to grey the coming days out with, and no check here compares it with today.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isISODate(value) {
    return ISO_DATE.test(value);
}

// The birthday field, on the one page that has it (app.js is loaded by every page). It is
// left as the page writes it — required, type="date", no newest day — and the check below
// still decides on submit, in case the page is driven by script instead of by a click.
const birthdayField = form?.elements.namedItem('birthday');

// 2. Listen for the submit event
form?.addEventListener('submit', async function(event) {
  // Prevent the default browser behavior (reloading the page)
  event.preventDefault(); 

  // Safety check before anything is sent: the username typed in Name has to come
  // back exactly the same in Retype student username.
  const usernameField = form.elements.namedItem('name');
  const retypedUsernameField = form.elements.namedItem('retype_name');

  if (retypedUsernameField && !sameUsername(usernameField.value, retypedUsernameField.value)) {
      alert('Error: The two usernames do not match — the account was not created.');
      return;
  }

  // The birthday is checked here too, before anything is sent: it has to be a real date, in
  // the one shape a date column reads. Any day of any year goes through, a day still to come
  // included, because nothing about the account turns on the day being behind us. The field
  // points itself out on the way back, the way the browser would have, so the admin is not
  // left hunting for the box.
  if (birthdayField && !isISODate(birthdayField.value)) {
      alert('Error: The birthday has to be a real date — the account was not created.');
      birthdayField.focus();
      return;
  }

  // 3. Gather the form data
  const formData = new FormData(form);

  // retype_name is the one field here that is not account data — it only ever served
  // the safety check above — so it is dropped and the request carries name, birthday,
  // initialbalance and password, which is what /adduser is asked to store.
  formData.delete('retype_name');
  
  // Convert the FormData into a standard JavaScript object

  try {
    // 4. Send the request to your server — this site's own /api route, which the Cloudflare
    // Pages Function functions/api/[[path]].js fetches from the API and hands straight back,
    // the session cookie with it (apibase.js carries API_ORIGIN and says why the API is no
    // longer asked by its own hostname; the note above GET_USERS_URL says the same for every
    // other route in this file).
    const response = await fetch(`${API_ORIGIN}/adduser`, {
      method: 'POST', // Use POST to send data
      credentials: "include", // Send the admin session cookie, else 401 "Not logged in"
      body: formData
    });

    // 5. Handle the server's response
    if (response.ok) {
        const result = await response.json(); // Assuming the server responds with JSON
        console.log('Success:', result);
        alert('Form submitted successfully!');

        // The account is made, and the home page is where it shows up (the student
        // balances page behind its "View students" door is the list it joins), so the
        // admin is handed back there instead of being left
        // on a filled-in form. The sentence above is read first: the redirect waits
        // for the alert to be dismissed.
        redirectHomeAfter(REDIRECT_DELAY_MS);
    } else {
        // Read the body once: response.json() can only be read a single time,
        // and response.json().detail reads .detail off the Promise instead.
        const error = await response.json();

        if (error.detail === "Not logged in") {
            alert('log into admin account before adding user');
        }    
        console.error("Validation error:", error);
    }
    
  } catch (error) {
       // This catches network errors (e.g., the server is down or unreachable)
       console.error('Network Error:', error);
  }
});

// Query accounts page ----------------------------------------------------------
// getusers.html's search form lists the accounts the two filters leave. Both are
// exact, case-sensitive lookups and both are optional — checked live:
// ?supervisor=test-account answers that admin's three accounts while
// ?supervisor=nonsense answers [] — so a blank field matches everyone. Every row is
// a plain object of account fields, the same shape the students table and the
// transaction flow read (live: [{"name": "hi there", "password": "hi", "supervisor": "lagoon",
// "birthday": "01/29"}, …]), and the route is untyped — openapi.json promises
// nothing about the body — so the card built for an account is filled from that
// account's own keys, in the order the backend sends them. Every field the table
// keeps is listed, and a field the backend starts sending later is listed too
// instead of being dropped by a list of names written out here by hand — the
// password being the one deliberate exception, skipped by ACCOUNT_HIDDEN_FIELDS
// below.
// Every route below is asked of this site's own origin — `${API_ORIGIN}/getuser`, and '/api'
// once the page is on the deployed site — where the Cloudflare Pages Function
// functions/api/[[path]].js fetches the same route from the API and hands the answer back,
// the session cookie included. apibase.js, loaded before this file on every page, carries
// that origin and says why the API is no longer asked by its own hostname (a SameSite=lax
// cookie cannot cross from bonurabank.ca to rongrongwu.com). What follows API_ORIGIN is the
// API's own route, unchanged.
const GET_USERS_URL = `${API_ORIGIN}/getuser`;

// Fields the query never shows, lower-cased. GET /getuser does answer each account's
// own password (checked live: {"name": "hi there", "password": "hi", …}), and the
// route is public, so it is the account's real login secret sitting in a public
// reply. Showing a student's password on a lookup page would turn that into the point
// of the page, so it is left out here: the rest of the account is still listed in
// full, and nothing else on the row is touched.
const ACCOUNT_HIDDEN_FIELDS = ['password'];

const getUsersForm = document.getElementById('getusersform');

getUsersForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    // A blank field travels as an empty string, which GET /getuser reads as "no
    // filter": both of its query parameters default to "".
    const params = new URLSearchParams({
        name: getUsersForm.elements.namedItem('name').value.trim(),
        supervisor: getUsersForm.elements.namedItem('supervisor').value.trim()
    });

    const results = document.getElementById('results');

    // One search at a time: the button goes grey and unclickable for the round trip,
    // the same .btn[aria-disabled="true"] state the home page's lookup uses.
    const submitButton = getUsersForm.querySelector('button[type="submit"]');
    submitButton?.setAttribute('aria-disabled', 'true');
    showAccountMessage(results, 'Asking the backend which accounts match…', false);

    try {
        const response = await fetch(`${GET_USERS_URL}?${params}`, {
            method: 'GET',
            credentials: 'include' // send the admin session cookie, like every other call
        });

        if (!response.ok) {
            console.error('Server error:', await response.text());
            showAccountMessage(results, `The backend answered ${response.status} — the accounts could not be listed.`, true);
            return;
        }

        const users = await response.json();
        const accounts = users === null ? [] : Array.isArray(users) ? users : [users];

        if (!accounts.length) {
            showAccountMessage(results, 'No users found.', false);
            return;
        }

        results.replaceChildren(); // Clear previous results

        for (const account of accounts) {
            results.append(accountCard(account));
        }

        console.log(`Listed ${accounts.length} account(s).`, params.toString());
    } catch (error) {
        console.error('Network error:', error);
        showAccountMessage(results, 'Network error — the accounts API could not be reached.', true);
    } finally {
        submitButton?.removeAttribute('aria-disabled');
    }
});

// One account as a card: every field the account object carries except the hidden
// ones, one line per field, the field's own name as the label and its value after it.
// A field holding a nested object or a list is written out as JSON, so nothing the
// backend sends is ever printed as "[object Object]".
function accountCard(account) {
    const card = document.createElement('p');

    if (account === null || typeof account !== 'object') {
        card.textContent = account === null || account === undefined ? '' : String(account);
        return card;
    }

    for (const [key, value] of Object.entries(account)) {
        if (hiddenAccountField(key)) continue;

        card.append(accountField(key, value));
    }

    return card;
}

// True for a field the query keeps off the page. The compare is done on the
// lower-cased, space-trimmed name so "Password" or " password " cannot slip past the
// one entry in ACCOUNT_HIDDEN_FIELDS.
function hiddenAccountField(key) {
    return ACCOUNT_HIDDEN_FIELDS.includes(String(key).trim().toLowerCase());
}

// One "Field: value" line inside an account card.
function accountField(key, value) {
    const line = document.createElement('span');
    line.className = 'results__field';

    const label = document.createElement('span');
    label.className = 'results__field-label';
    label.textContent = `${accountFieldLabel(key)}: `;

    line.append(label, document.createTextNode(accountFieldValue(value)));

    return line;
}

// A field's name as a person reads it: underscores and hyphens opened out into
// spaces and the first letter capitalised, so "initialbalance" reads as
// "Initialbalance" and a later "opening_balance" as "Opening balance", without a
// table of names to keep in step with the backend.
function accountFieldLabel(key) {
    const words = String(key).replace(/[_-]+/g, ' ').trim();

    return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Field';
}

// A field's value as text. Text, numbers and booleans are written as themselves, a
// missing value as nothing at all, and anything structured as JSON — the only honest
// way to show it on one line.
function accountFieldValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// Replace the previous results with a single message — the same one-paragraph shape
// showLoginMessage, showHomeMessage and showReasonMessage write into their own blocks,
// so an error is the red variant of the same card.
function showAccountMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// Add admin page ----------------------------------------------------------------
// add_admin.html's form creates another admin login — the admin signup. POST /add-admin
// is live and asks for exactly the two fields this form has, admin_name and password
// (checked against https://api.rongrongwu.com/openapi.json), so the request below
// carries those two and nothing else: retype_password is this page's own safety check
// and is dropped from the body. The route answers 401 {"detail": "Not logged in"} until
// an admin has signed in, because the session lives in the backend's cookie and not in
// the page — which is why the request sends credentials: "include", and why a refused
// signup is said out loud under the form instead of only being logged.
const ADD_ADMIN_URL = `${API_ORIGIN}/add-admin`;

const adminForm = document.getElementById('addadminform');

adminForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    const results = document.getElementById('addadminresults');

    // Validate that the two password fields match before sending anything. The line
    // under the form says the same thing as the alert, so the reason survives after the
    // alert is dismissed.
    const password = adminForm.elements.namedItem('password')?.value;
    const retypePassword = adminForm.elements.namedItem('retype_password')?.value;

    if (password !== retypePassword) {
        showAccountMessage(results, 'Error: the two passwords do not match — no admin was created.', true);
        alert('Error: Passwords do not match.');
        return;
    }

    const formData = new FormData(adminForm);
    const adminName = formData.get('admin_name');

    // retype_password is only used for validation, the server only needs password
    formData.delete('retype_password');

    const submitButton = adminForm.querySelector('button[type="submit"]');

    // One signup at a time: the submit button goes grey and unclickable for the round
    // trip, the way the landing card's sign-in does, so a second press cannot post the
    // same admin twice.
    submitButton?.setAttribute('aria-disabled', 'true');
    showAccountMessage(results, `Asking the backend to create ${adminName}…`, false);

    try {
        const response = await fetch(ADD_ADMIN_URL, {
            method: 'POST',
            credentials: "include", // Send the admin session cookie, else 401 "Not logged in"
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Success:', result);

            // The admin exists now, and login_admin.html is where that login is used, so
            // the sentence is read and then the home page takes over — the same finish
            // the add account page gives a flow that has just succeeded.
            showAccountMessage(results, `Admin ${adminName} created — taking you to the home page…`, false);
            alert('Form submitted successfully!');

            // Deliberately not re-enabled on this path: the admin exists now, so a second
            // press while the home page is on its way must not post the same one again.
            redirectHomeAfter(REDIRECT_DELAY_MS);
        } else {
            const error = await response.json();

            // The one refusal this page causes on its own: no admin is signed in, so
            // there is nobody allowed to make another admin. Said in words on the page,
            // with the same wording the add account page uses, rather than left in the
            // console where the admin who just pressed Submit cannot see it.
            if (error.detail === 'Not logged in') {
                showAccountMessage(results, 'Log into an admin account before adding an admin.', true);
                alert('log into admin account before adding admin');
            } else {
                showAccountMessage(results, `The backend said no: ${describeError(error)}`, true);
            }

            console.error('Validation error:', error);
            submitButton?.removeAttribute('aria-disabled');   // nothing was made: let them try again
        }
    } catch (error) {
        showAccountMessage(results, 'The backend could not be reached — nothing was created.', true);
        console.error('Network Error:', error);
        submitButton?.removeAttribute('aria-disabled');
    }
});

// Admin login -> POST the form to the API login endpoint.
// POST /login is live and takes admin_name + password (see
// https://api.rongrongwu.com/openapi.json). /adduser and /add-admin answer
// 401 {"detail": "Not logged in"} until this login has stored the session
// cookie, which is why every API call sends credentials: "include".
const LOGIN_URL = `${API_ORIGIN}/login`;

// Where a finished flow goes: the home page, home.html — the buttons, and behind them
// the doors to every other page, the student balances table among them. It is *not*
// index.html: that one is only the front door, the sign-in card, so sending a login or
// a finished transaction there would bounce the admin back to the form they just filled
// in. The admin session lives in the backend's cookie, not in the page, so the home
// page picks it up on its own as it opens — it reads the signed-in admin for its
// greeting, and students.html asks the same route for its table.
const HOME_URL = '/home.html';

// How long a "logged in…" / "recorded…" status line stays up before the home page
// replaces it. Long enough to read the sentence, short enough to feel like a step
// forward rather than a wait.
const REDIRECT_DELAY_MS = 900;

// Sends the browser to the home page once the status line has had its moment, so
// the sentence that says what just happened is not wiped out before it is read.
function redirectHomeAfter(delayMs) {
    window.setTimeout(function () {
        window.location.href = HOME_URL;
    }, delayMs);
}

const loginForm = document.getElementById('loginadminform');

loginForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const results = document.getElementById('loginresults');

    try {
        const response = await fetch(LOGIN_URL, {
            method: 'POST',
            credentials: "include",
            body: formData

        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json();

        if (response.ok) {
            console.log('Success:', result);
            showLoginMessage(results, `Logged in as ${formData.get('admin_name')} — taking you to the home page…`, false);

            // A successful login is the session the home page reads, so the admin
            // lands there instead of staying on the login form.
            redirectHomeAfter(REDIRECT_DELAY_MS);
        } else {
            console.error('Login error:', result);
            showLoginMessage(results, `Login failed (${response.status}): ${describeError(result)}`, true);
        }
    } catch (error) {
        console.error('Network Error:', error);
        showLoginMessage(results, 'Network error — the login API could not be reached.', true);
    }
});

// Replace the previous status line with a single message
function showLoginMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// FastAPI errors: {"detail": "..."} or {"detail": [{"msg": "...", ...}]}
function describeError(result) {
    if (typeof result?.detail === 'string') {
        return result.detail;
    }

    if (Array.isArray(result?.detail)) {
        return result.detail.map((item) => item.msg).join('; ');
    }

    return 'the server rejected the credentials.';
}

// Landing page ------------------------------------------------------------------
// index.html is the card the app opens on: a username, a password and the two doors
// under them. The admin door *is* the admin login — the very same POST /login, with
// the same admin_name + password fields, that login_admin.html sends; entered here it
// is simply asked for on the card the admin is already looking at. Nothing is
// redirected once it succeeds, because the session lives in the backend's cookie and
// not in a page; the line under the buttons says who is signed in and carries the way
// on to the home page, which the admin can take whenever they are ready. The student
// door beside it is the student's own login — POST /student-login, entered with the
// same two boxes read as the student's username and password — and it carries the way
// on to the student's own hub, student-home.html, where that student's balance and
// their own transaction history are.
const signInForm = document.getElementById('signinform');

signInForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    const formData = new FormData(signInForm);
    const results = document.getElementById('signinresults');

    // One sign-in at a time: the submit button goes grey and unclickable for the round
    // trip, using the .btn[aria-disabled="true"] state styles.css already styles — the
    // same as the add-admin form and the sign-out door do.
    const submitButton = signInForm.querySelector('button[type="submit"]');
    submitButton?.setAttribute('aria-disabled', 'true');
    showLoginMessage(results, 'Asking the backend to sign this admin in…', false);

    try {
        const response = await fetch(LOGIN_URL, {
            method: 'POST',
            credentials: "include", // keep the session cookie the login answers with
            body: formData
        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json();

        if (response.ok) {
            console.log('Success:', result);
            showLoginMessage(results, `Signed in as ${formData.get('admin_name')}.`, false);

            // The card holds nothing but the sign-in, so the sentence that names the
            // admin carries the way on to the home page, where the buttons are.
            results?.querySelector('p')?.append(' ', homePageLink());
        } else {
            console.error('Login error:', result);
            showLoginMessage(results, `Sign in failed (${response.status}): ${describeError(result)}`, true);
        }
    } catch (error) {
        console.error('Network Error:', error);
        showLoginMessage(results, 'Network error — the login API could not be reached.', true);
    } finally {
        submitButton?.removeAttribute('aria-disabled');
    }
});

// The student door: the student's own login, POST /student-login, entered with the two
// boxes the card already holds — the username box is that student's username, the way
// it is the admin's name in the admin login above. It is a plain button rather than the
// form's submit, so Enter inside a box still means the admin login; the boxes are
// therefore put past the browser's own check here, because a button does not ask the
// browser to run it the way a submit does.
const STUDENT_LOGIN_URL = `${API_ORIGIN}/student-login`;

// Where the student's own pages are, and whose they are. The username the student sign
// in went through with is kept in sessionStorage under this key, and the student's hub
// (student-home.html, studenthome.js) and the student's own history page
// (transaction-view-student.html, transactionview.js) read it back — one key in three
// files, kept in sync by hand, the way STUDENT_USERNAME_KEY is kept with
// transactionview.js and sessionstorage.js. It is deliberately not that key: an admin
// can confirm one student for a transaction and another student can still sign in on
// the same browser, and the two names must not overwrite each other.
const SIGNED_IN_STUDENT_KEY = 'student_login';
const STUDENT_HOME_URL = '/student-home.html';

// Fields a POST /student-login reply may name the student in, most likely first — the
// route is untyped, openapi.json promises nothing about the body, so the name is looked
// for the way the admin name is looked for elsewhere (ADMIN_NAME_KEYS), with the
// student's own field first. Named apart from STUDENT_NAME_KEYS below, which is the read
// of an account object rather than of a login reply.
const STUDENT_LOGIN_NAME_KEYS = ['student_name', 'name', 'student', 'username'];

function studentName(result) {
    if (result === null || typeof result !== 'object') {
        return null;
    }

    for (const key of STUDENT_LOGIN_NAME_KEYS) {
        const value = result[key];

        if (value !== undefined && value !== null && value !== '') {
            return String(value).trim();
        }
    }

    return null;
}

const studentSignInButton = document.getElementById('studentsignin');

studentSignInButton?.addEventListener('click', async function () {
    // The card's own two boxes, named the way the student route names them: what the
    // admin login reads as admin_name is this student's own username.
    const usernameField = signInForm.elements.namedItem('admin_name');
    const passwordField = signInForm.elements.namedItem('password');
    const results = document.getElementById('signinresults');

    // The check the admin door gets for free by being the form's submit: an empty box is
    // pointed out by the browser's own bubble and nothing is sent.
    if (!signInForm.reportValidity()) {
        return;
    }

    const student = usernameField.value.trim();
    const body = new FormData();
    body.set('student_name', student);
    body.set('password', passwordField.value);

    // One sign-in at a time, the same .btn[aria-disabled="true"] state the admin door
    // and the forms take for the round trip.
    studentSignInButton.setAttribute('aria-disabled', 'true');
    showLoginMessage(results, 'Asking the backend to sign this student in…', false);

    try {
        const response = await fetch(STUDENT_LOGIN_URL, {
            method: 'POST',
            credentials: 'include', // keep the session cookie the login answers with
            body
        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Student login error:', result);
            showLoginMessage(results, `Student sign in failed (${response.status}): ${describeError(result)}`, true);
            return;
        }

        // Who the student's own pages are about: the name the backend answered with when
        // it named one, and the username that was typed when it did not.
        const name = studentName(result) ?? student;
        sessionStorage.setItem(SIGNED_IN_STUDENT_KEY, name);

        console.log('Student sign in:', result);
        showLoginMessage(results, `Signed in as ${name}.`, false);

        // The card holds nothing but the sign-in, so the sentence that names the student
        // carries the way on to the page behind the door.
        results?.querySelector('p')?.append(' ', studentHomePageLink());
    } catch (error) {
        console.error('Network Error:', error);
        showLoginMessage(results, 'Network error — the student login API could not be reached.', true);
    } finally {
        studentSignInButton.removeAttribute('aria-disabled');
    }
});

// The way on from the student door: the same link the admin's line carries, worded for
// the page behind this one.
function studentHomePageLink() {
    const link = document.createElement('a');
    link.href = STUDENT_HOME_URL;
    link.textContent = 'Continue to the student home page \u2192';
    return link;
}

// The way on from the front door: the sign-in line under the card's buttons carries
// this, because index.html itself is only the card — the buttons, and the doors behind
// them, are on the home page.
function homePageLink() {
    const link = document.createElement('a');
    link.href = HOME_URL;
    link.textContent = 'Continue to the home page \u2192';
    return link;
}

// Home page ------------------------------------------------------------------
// home.html is the card behind the front door: a greeting that names the admin this
// browser is signed in as, the eight doors on it, and Sign out. Almost
// everything on it starts from the same live route, GET /current-admin (listed in
// https://api.rongrongwu.com/openapi.json): it takes the session cookie and answers
// 401 {"detail": "Not logged in"} without one — checked live with curl, exactly like
// the other protected routes. So the requests send credentials: "include", the same
// as the login and add-admin forms above.
const CURRENT_ADMIN_URL = `${API_ORIGIN}/current-admin`;

// The front door, index.html — the sign-in card. That is where the browser belongs
// once the session has been given up, or once it turns out there is none; HOME_URL
// above is the same road the other way round.
const SIGN_IN_URL = '/index.html';

// The status line under the doors, where the hub says everything it has to say: a
// greeting that could name nobody, a Sign out that did not go through.
const homeStatus = document.getElementById('homestatus');

// Fields the reply may carry the admin name in, most likely first — the route is
// untyped, openapi.json only promises an object whose values are strings.
const ADMIN_NAME_KEYS = ['admin_name', 'name', 'admin', 'username'];

// The greeting the card opens on, "Hi <admin name>". The name comes from the same
// route students.html starts from, and it is asked once as the page opens — the dots
// in the page stand in until that answer arrives. A read that names nobody, a session
// the backend refuses and a backend that cannot be reached are all said on the status
// line under the doors, because a greeting stuck on dots would be the only thing the
// admin saw.
const homeAdminName = document.getElementById('homeadminname');

async function refreshHomeGreeting() {
    if (!homeAdminName) return; // every other page loads app.js for its own form

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // send the admin session cookie
        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json().catch(() => null);

        if (response.ok) {
            const admin = currentAdminNameIn(result);

            if (admin) {
                homeAdminName.textContent = admin;
                return;
            }

            // The session was accepted, but the reply carries no name to greet: the
            // reply itself is what the status line describes.
            console.error('Home greeting: the backend named no admin.', response.status, result);
            showHomeMessage(homeStatus, describeCurrentAdmin(result), true);
            return;
        }

        console.error('Home greeting error:', result);
        showHomeMessage(
            homeStatus,
            `No admin session (${response.status}): ${describeError(result)} — sign in on the front door and this greeting names the admin by itself.`,
            true
        );
        homeStatus?.querySelector('p')?.append(' ', signInPageLink());
    } catch (error) {
        console.error('Network Error:', error);
        showHomeMessage(homeStatus, 'Network error — the current-admin API could not be reached, so the greeting cannot name anybody yet.', true);
    }
}

// The greeting is the home page's own read, so the home page starts it; every other
// page loads app.js for its own form and starts nothing.
if (homeAdminName) {
    refreshHomeGreeting();
}

// The way back to the front door, for the hub's status line — the mirror of
// homePageLink() above, which carries the way on the other way.
function signInPageLink() {
    const link = document.createElement('a');
    link.href = SIGN_IN_URL;
    link.textContent = 'Go to the sign-in card \u2192';
    return link;
}

// Replace the previous status line under the doors with a single message — the same
// one-paragraph shape showLoginMessage and showAccountMessage write into their own
// blocks.
function showHomeMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// The 200 body is an object of strings whose fields openapi.json does not name,
// so the answer is read defensively:
//   {"admin_name": "alice"}                     -> "Signed in as alice."
//   {"name": "alice"} / {"admin": …} / {"username": …}  -> the same
//   {"admin_name": "alice", "bank": "Bonura's"} -> the name, then the extra fields
//   "alice"                                     -> "Signed in as alice."
//   [{"admin_name": "alice"}]                   -> one sentence per entry
//   {} / null / a bare number                   -> the session was accepted, but
//                                                  the reply names nobody
function describeCurrentAdmin(payload) {
    if (Array.isArray(payload)) {
        return payload.length
            ? payload.map((entry) => describeCurrentAdmin(entry)).join(' ')
            : 'The backend accepted the session, but the reply names no admin.';
    }

    if (typeof payload === 'string') {
        return payload ? `Signed in as ${payload}.` : 'The backend accepted the session, but the reply names no admin.';
    }

    if (payload === null || typeof payload !== 'object') {
        return 'The backend accepted the session, but the reply names no admin.';
    }

    const adminName = firstField(payload, ADMIN_NAME_KEYS);
    const details = Object.keys(payload)
        .filter((key) => String(payload[key]) !== String(adminName))
        .map((key) => `${key}: ${payload[key]}`)
        .join(', ');

    if (adminName === null) {
        return details
            ? `The backend accepted the session, but the reply names no admin — it says ${details}.`
            : 'The backend accepted the session, but the reply names no admin.';
    }

    return details
        ? `Signed in as ${adminName} (${details}).`
        : `Signed in as ${adminName}.`;
}

// students.html, the page behind the home page's "View students" door, lists one row
// per student of the admin behind the session cookie: the student's name, the balance on
// their account, the job they have been given and the salary that job pays — the four
// columns the sketch draws, and nothing below the last row, so the table is not added up.
// The rows are ranked by that balance and not by the name: the smallest balance stands
// first and the largest last, so the table reads as a ladder from the student who owes
// the most down to nothing and up to the student who holds the most, and a name only
// decides between two students the backend priced the same (see rankRosterRows).
// Four live routes stand behind it, all of them taking the session cookie:
//   GET /current-admin                -> which admin this browser is signed in as;
//                                        401 {"detail": "Not logged in"} with no
//                                        session, like every other protected route
//   GET /getuser?supervisor=<admin>   -> that admin's students — the exact filter the
//                                        transaction flow uses, so only this admin's
//                                        rows come back. The route is untyped, and the
//                                        job a student has been given travels on that
//                                        student's own account in it (that is the table
//                                        POST /set-jobs writes to), so the job column is
//                                        read off this one reply rather than asked for
//                                        by a route of its own; an account carrying no
//                                        job is drawn as a dash
//   GET /get-balance?student=<name>   -> {"user": "Rongrong Wu", "balance": 235},
//                                        checked live; an unknown student answers 0
//                                        rather than 404, which is why only names
//                                        /getuser has listed are ever asked about
//   GET /reasons/job-salaries         -> {"Attendance Monitor": 65, "Board Manager": 50,
//                                        …}: the same /reasons/{slug} route and shape
//                                        the reason pages read, with the reason column's
//                                        job as the key and its amount as the value,
//                                        which is the figure the job-salary column pairs
//                                        a job with. Asked only when a job was read, so a
//                                        table of students with no jobs costs no request
const STUDENTS_URL = `${API_ORIGIN}/getuser`;
const BALANCE_URL = `${API_ORIGIN}/get-balance`;

// The `type` column value a job's salary is filed under, in the table's own spelling —
// the same value the reason pages carry in data-reason-type, and the one the slug for the
// route above is built out of (reasonSlugFromType) rather than spelled by hand.
const JOB_SALARIES_TYPE = 'JOB SALARIES';

// What a cell is drawn as when the backend has nothing for it: the job an account carries
// none of, or the salary of a job the salaries list does not price. A dash is not a figure
// and cannot be misread as one, while a blank cell reads like a mistake and a 0 like a
// real figure.
const ROSTER_EMPTY_CELL = '\u2014';

// Fields an account object may carry its name, its supervisor and its job in, most
// likely first — the same order the other pages read them in, the route being untyped.
const STUDENT_NAME_KEYS = ['name', 'username', 'account', 'id'];
const STUDENT_SUPERVISOR_KEYS = ['supervisor', 'owner', 'manager'];
const STUDENT_JOB_KEYS = ['job', 'job_name', 'jobname', 'job-name', 'position'];

// A job's own figure, for the account that carries one: the salary is the salaries list's
// to give, and a figure sent with the account is taken over it, being the row's own.
const STUDENT_JOB_SALARY_KEYS = ['job-salary', 'job_salary', 'jobSalary', 'salary'];

// The table app.js fills and the line above it. students.html is the only page that
// carries these elements — every other page loads app.js for its own form — so a read
// only ever starts where there is a table to put an answer in.
const rosterFrame = document.getElementById('rosterframe');
const rosterRows = document.getElementById('rosterrows');
const rosterStatus = document.getElementById('rosterstatus');
const rosterStamp = document.getElementById('rosterstamp');
const rosterRefreshButton = document.getElementById('rosterrefresh');

// One read at a time: a Refresh pressed while a slow answer is still on its way must
// not pile a second read up behind the first.
let rosterReadRunning = false;

// Which admin is signed in, then that admin's students, then their balances — and the
// rows. Anything that is not a table is spelled out on the status line above it, and
// the rows of the read before are dropped rather than left standing as if they were
// current.
async function refreshRoster() {
    if (!rosterRows) return; // every other page loads app.js for its own form
    if (rosterReadRunning) return;

    rosterReadRunning = true;
    rosterRefreshButton?.setAttribute('aria-disabled', 'true'); // one read at a time
    showRosterMessage(rosterStatus, 'Asking the backend which admin is signed in…', false);

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include'
        });
        const result = await response.json().catch(() => null);
        const admin = response.ok ? currentAdminNameIn(result) : '';

        if (!admin) {
            console.error('Student table: the backend named no admin.', response.status, result);
            clearRosterTable();
            showRosterMessage(rosterStatus, 'No admin session — the backend named no admin for this browser, and the table only lists the students of the admin that is signed in. Log into the admin account; the table reads again with the page.', true);
            return;
        }

        showRosterMessage(rosterStatus, `Reading the students of “${admin}”, their balances, their jobs and the salaries those jobs pay…`, false);

        const students = await adminStudents(admin);

        if (!students.length) {
            clearRosterTable();
            showRosterMessage(rosterStatus, `The backend lists no student with “${admin}” as their supervisor, so there is nothing to show.`, true);
            return;
        }

        // One request per student, all at once. A balance that cannot be read takes
        // that student's row off the table rather than being written as a zero, and the
        // status line says how many fell out, so the table never shows a figure nobody
        // read. A job that is missing does not take the row off — the student is the
        // backend's either way — so it is the cell that says so, not the table.
        const rows = await Promise.all(students.map(async (account) => ({
            name: account.name,
            job: account.job,
            salary: account.salary,
            balance: await studentBalance(account.name).catch((error) => {
                console.error(`Balance of "${account.name}" could not be read:`, error);
                return null;
            })
        })));
        const drawn = rows.filter((row) => row.balance !== null);

        if (!drawn.length) {
            clearRosterTable();
            showRosterMessage(rosterStatus, 'No balance could be read for these students, so there is nothing to show.', true);
            return;
        }

        // Ranked by the balance, the smallest first. `rows` arrives alphabetically
        // (adminStudents) and sorting is stable, so two students the backend priced the
        // same keep their name order rather than being shuffled about by whichever
        // balance the backend happened to answer first. A student whose balance could not
        // be read is not ranked at all — that row is off the table (see `drawn` above).
        rankRosterRows(drawn);

        // The salaries list is asked for only when a job was read that the account
        // carried no figure for itself: with no jobs there is nothing to price, and a
        // job the account has already priced needs no second opinion. Two students of the
        // same job are priced off the same entry, so the column cannot disagree with
        // itself. A list that cannot be read is not the end of the table either — every
        // row the backend did answer is still drawn, and the status line says which
        // column is left as a dash.
        let salaries = {};
        let salariesRead = true;

        if (drawn.some((row) => row.job && row.salary === null)) {
            try {
                salaries = await jobSalaries();
            } catch (error) {
                console.error('Job salaries could not be read:', error);
                salariesRead = false;
            }
        }

        for (const row of drawn) {
            const figure = row.job ? salaries[row.job] : null;

            if (row.salary === null && typeof figure === 'number' && Number.isFinite(figure)) {
                row.salary = figure;
            }
        }

        drawRosterTable(drawn);

        const missing = rows.length - drawn.length;
        const noJob = drawn.filter((row) => !row.job).length;
        const unpriced = drawn.filter((row) => row.job && row.salary === null).length;
        const tied = drawn.filter((row, index) => index > 0 && row.balance === drawn[index - 1].balance).length;

        showRosterMessage(
            rosterStatus,
            `${drawn.length} student${drawn.length === 1 ? '' : 's'} of the admin “${admin}”, ranked by balance, the smallest first — the balance on each account, the job that student has been given and the salary that job pays.`
            + (tied
                ? ` ${tied} of them share${tied === 1 ? 's' : ''} a balance with the student above, so ${tied === 1 ? 'that pair keeps' : 'those students keep'} their name order.`
                : '')
            + (missing
                ? ` ${missing} balance${missing === 1 ? '' : 's'} could not be read, so ${missing === 1 ? 'that student is' : 'those students are'} not in the table.`
                : '')
            + (noJob
                ? ` ${noJob} account${noJob === 1 ? '' : 's'} carr${noJob === 1 ? 'ies' : 'y'} no job, so ${noJob === 1 ? 'that job and its salary are' : 'those jobs and their salaries are'} left as a dash.`
                : '')
            + (!salariesRead
                ? ' The job salaries could not be read from the backend, so every job-salary cell is left as a dash.'
                : unpriced
                    ? ` ${unpriced} job${unpriced === 1 ? '' : 's'} the backend's salaries list does not price, so ${unpriced === 1 ? 'that job-salary cell is' : 'those job-salary cells are'} left as a dash.`
                    : ''),
            false
        );
    } catch (error) {
        console.error('Student table error:', error);
        clearRosterTable();
        showRosterMessage(rosterStatus, 'Network error — the students, their balances, their jobs and the salaries those jobs pay could not be read from the API. Press Refresh to read them again.', true);
    } finally {
        rosterReadRunning = false;
        rosterRefreshButton?.removeAttribute('aria-disabled');
        stampRoster();
    }
}

// The table's ranking: by the balance on the account, from the smallest to the largest —
// a student who is overdrawn stands above a student who is level, who stands above the
// biggest holder on the page. The comparison is the figure itself and not its text, so
// -10 is ranked below 9 rather than after it, which is what comparing the two as strings
// would say (the '-' sorts before the digits); that is the same reading a balance is
// given in its own cell (drawRosterTable). The sort is stable, so the name order the rows
// arrive in — adminStudents sorts by name — is what decides between two students holding
// the same balance: the account ranks the row, and the name only ever breaks its rank.
// The rows handed in are the ones a balance was read for, so no row is ever ranked on a
// figure nobody read.
function rankRosterRows(rows) {
    rows.sort((a, b) => a.balance - b.balance);
    return rows;
}

// Fills the table: one row per student — the name, the balance, the job that student has
// been given and the salary that job pays, in the four columns the sketch draws. Every
// cell is built as a node rather than with innerHTML, because the names come from the
// backend.
function drawRosterTable(rows) {
    const body = document.createDocumentFragment();

    for (const row of rows) {
        const line = document.createElement('tr');
        line.className = 'roster__row';

        const name = document.createElement('td');
        name.className = 'roster__name';
        name.textContent = row.name;

        // A balance below zero is the one red figure in the table; the figure itself
        // carries its own minus sign, so nothing else has to say which way the account
        // went.
        const amount = document.createElement('td');
        amount.className = row.balance < 0
            ? 'roster__amount roster__amount--negative'
            : 'roster__amount';
        amount.textContent = String(row.balance);

        // The job and the salary that job pays, each a dash when the backend had nothing
        // to put there (see ROSTER_EMPTY_CELL): the two cells say what is missing on the
        // row it is missing from, rather than the row being left out of the table.
        const job = document.createElement('td');
        job.className = 'roster__job';
        job.textContent = row.job || ROSTER_EMPTY_CELL;

        const salary = document.createElement('td');
        salary.className = 'roster__salary';
        salary.textContent = row.salary === null ? ROSTER_EMPTY_CELL : String(row.salary);

        line.append(name, amount, job, salary);
        body.append(line);
    }

    rosterRows.replaceChildren(body);

    if (rosterFrame) {
        rosterFrame.hidden = false;
    }

    console.log(`Listed ${rows.length} student(s), their balances, jobs and job salaries.`, rows);
}

// Drops the rows and hides the frame they stand in. A read that failed or came back empty
// must not leave the table of the read before standing as if it were current.
function clearRosterTable() {
    if (rosterFrame) {
        rosterFrame.hidden = true;
    }

    rosterRows?.replaceChildren();
}

// The line beside the Refresh button, outside the live region, so a clock written there
// every read is not read out to a screen reader.
function stampRoster() {
    if (!rosterStamp) return;

    rosterStamp.textContent = `Last read at ${new Date().toLocaleTimeString()}.`;
}

// Replace the previous status line above the table with a single message — the same
// one-paragraph shape showHomeMessage, showAccountMessage and showReasonMessage write
// into their own blocks, so an error is the red variant of the same panel.
function showRosterMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// The page starts itself: the first read happens as students.html opens, Refresh reads
// again on demand, and a read started in another tab — or a balance changed there —
// turns up here when this tab comes back to the front. Every other page loads app.js for
// its own form, has no table to fill, and starts nothing.
if (rosterRows) {
    refreshRoster();

    rosterRefreshButton?.addEventListener('click', refreshRoster);

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            refreshRoster();
        }
    });
}

// Remove student page -------------------------------------------------------------
// remove.html, the page behind the hub's "Remove student" door: a box for the student's
// name, a remove button under it, and, in between, the one question in the app that cannot
// be undone. The question is the app's own dialog (askConfirmation, below), asked with Yes
// and No, with Yes drawn in the red the app draws a refusal in.
// Yes is the only answer that reaches the backend: it sends the name to POST /remove-student,
// the one route that takes a student away, and the sentence under the form says what came of
// it. No, and an answered Yes that the backend took nothing away for, leave the account
// where it is.
const removeForm = document.getElementById('removeform');
const removeNameField = document.getElementById('removestudentname');
const removeButton = document.getElementById('removebutton');
const removeResults = document.getElementById('removeresults');

// The heading of that question: "confirm ..., yes/no" is the shape the approving pages'
// question is written in, so the two read as the same question about different things.
const REMOVE_QUESTION = 'confirm remove student, yes/no';

// What the question says under its heading: the student as typed, and what each answer does,
// the way the transaction question says what Y and N do to the row it names. The name is the
// whole of what a removal would be aimed at, so it is read back exactly as it was typed —
// trimmed of the space around it and nothing else — for the admin to read once more.
function describeRemoval(student) {
    const head = `“${student}” will be gone forever after this, and it cannot be undone.`;
    return `${head} Yes removes the student, No leaves them alone.`;
}

// The removal itself: POST /remove-student, the route that takes a student away, listed in
// https://api.rongrongwu.com/openapi.json and checked live with curl. It is asked for with
// JSON — the body's one field is `student`, {"student": "Rongrong Wu"} and nothing else —
// and, unlike /adduser, it names no session cookie of its own in openapi.json: a request
// without one is answered 200 (checked live: {"message": "student not found", "student":
// "___no_such_student___", "deleted": 0}). The admin gate on this page is therefore the
// page's own rule rather than the route's — the cookie still travels with the request, the
// way it does everywhere else, but the route would take a name from anyone who sent one.
// What its answers are read for is the count of accounts that went, not the status: a name
// the backend does not know is answered 200 as well, so a sentence may only say "removed"
// once `deleted` is a number above zero. A body without `student` is refused with
// 422 {"detail": [{"type": "missing", "loc": ["body", "student"], "msg": "Field required"}]}.
const REMOVE_STUDENT_URL = `${API_ORIGIN}/remove-student`;

// The body the route is written with: exactly the one field it asks for, the name as it was
// typed (trimmed by the submit handler), and nothing else — the same "only what the route
// declares" shape transactionBody() keeps to on the transaction pages.
function removalBody(student) {
    return { student };
}

// How many accounts the answer says were taken away, or null when it does not say with a
// number. Only this count may turn an answer into a removal: 200 on its own means no such
// thing here, since a name that is on no account is answered 200 too.
function removedCountIn(result) {
    const deleted = result?.deleted;

    return typeof deleted === 'number' ? deleted : null;
}

// What answering Yes is met with once the backend has taken the student away. The count is
// read back as well, because a name is not a key: an account that was made twice is taken
// away twice by the one request, and a removal that said "one" while it took two would be a
// half-honest sentence.
function removedMessage(student, count) {
    if (count === 1) {
        return `Removed — “${student}” is gone. The account was deleted from the backend.`;
    }

    return `Removed — ${count} accounts named “${student}” were deleted from the backend.`;
}

// What answering Yes is met with when the backend answered 200 but took nothing away: no
// account carries that name, so the removal was a no-op and every list is as it was. Said as
// an error, because the admin asked for something that did not happen — but nothing is wrong
// with the backend, so the name is left in the box to be looked at again, and the dropdown
// under it is the way to a spelling the backend does know.
function removalNotFoundMessage(student) {
    return `Nothing was removed — the backend knows no student named “${student}”, so nothing was deleted. Check the spelling, or pick the account from the dropdown.`;
}

// The write itself, in the shape sendTransaction() and the sign-out use: the one name as
// JSON, the session cookie travelling with it, and one answer either way — { ok: true, count }
// once the backend has taken the account away, { ok: false, text } with the sentence to show
// when it took nothing away, refused, or could not be reached.
async function sendRemoval(student) {
    const body = removalBody(student);
    console.log('Removing:', body);

    try {
        const response = await fetch(REMOVE_STUDENT_URL, {
            method: 'POST',
            credentials: 'include', // carry the admin session cookie along
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // A refusal can answer with something that is not JSON, so the body is read once
        // and never trusted to parse.
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Remove student error:', result);
            return {
                ok: false,
                text: `Nothing was removed — the backend refused the request (${response.status}): ${describeError(result)}`
            };
        }

        const count = removedCountIn(result);

        // A 200 that does not say how many accounts went says nothing about this one, and
        // nothing may be claimed about it on the strength of the status alone.
        if (count === null) {
            console.error('Remove student error:', result);
            return {
                ok: false,
                text: `Nothing was removed — the backend answered ${response.status} without saying how many accounts it took away, so there is nothing to report about the account.`
            };
        }

        if (count === 0) {
            console.log('Remove student:', result);
            return { ok: false, text: removalNotFoundMessage(student) };
        }

        console.log('Student removed:', result);
        return { ok: true, count };
    } catch (error) {
        console.error('Network Error:', error);
        return {
            ok: false,
            text: 'Network error — the removal could not reach the API, so nothing was removed.'
        };
    }
}

// Replace the previous status line with a single message — the same one-paragraph shape
// showHomeMessage, showReasonMessage and showOtherMessage write into their own blocks.
function showRemoveMessage(text, isError) {
    if (!removeResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    removeResults.replaceChildren(paragraph);
}

// Sets the remove button's greyed-out state, the same attribute styles.css styles for
// .btn — the state the two Next buttons wear while the backend is being asked.
function setRemoveEnabled(enabled) {
    if (!removeButton) return;

    if (enabled) {
        removeButton.removeAttribute('aria-disabled');
    } else {
        removeButton.setAttribute('aria-disabled', 'true');
    }
}

// Opening remove.html: ask the backend whether this browser still holds an admin session,
// with the one probe every other protected flow asks — POST /adduser with an empty body,
// the request ADMIN_CHECK_URL below is read for, which answers 401 "Not logged in" with no
// session. A removal is only ever aimed at the students of the admin that is signed in, so
// nothing is removed, and the question is not even put up, while the session has not been
// confirmed: the button is grey and unclickable until it has been, and the status line
// under the form says what the backend answered.
async function openRemovePage() {
    if (!removeForm) return; // every other page loads app.js for its own form only

    setRemoveEnabled(false);

    const check = await checkAdminPermission();
    setRemoveEnabled(check.granted);

    // Whose students may be removed is not asked here: the box wears the typing dropdown,
    // and that list only ever holds the signed-in admin's own accounts. The invitation to
    // type a name is added once the session was accepted — there is nothing to type for
    // while it has not been.
    const nextStep = check.granted
        ? ' Type the name of the student to remove, then press remove.'
        : '';

    showRemoveMessage(`${check.text}${nextStep}`, check.isError);
}

removeForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    const student = (removeNameField?.value ?? '').trim();

    // The name is the whole of the request, so a page whose box is empty has nothing to ask
    // the question about: it points the box out instead.
    if (!student) {
        showRemoveMessage('Type the name of the student to remove, then press remove.', true);
        removeNameField?.focus();
        return;
    }

    // The backend is asked for admin powers once more here, because the page may have been
    // open since the first check and an admin session can expire in between — the same
    // re-ask the approving pages make before they write, and what stops a name typed into a
    // page whose button was left grey being carried any further by pressing Enter. Both the
    // question below and the removal behind it are guarded by it: the name is only sent once
    // the question has been answered with Yes.
    setRemoveEnabled(false);
    const check = await checkAdminPermission();

    if (!check.granted) {
        showRemoveMessage(check.text, true);
        return;
    }

    setRemoveEnabled(true);

    // The question stands between the name and the removal, and one removal runs at a time:
    // while it is up, a second press could only put the same question up again.
    const confirmed = await askConfirmation(REMOVE_QUESTION, describeRemoval(student), {
        yesLabel: 'Yes',
        noLabel: 'No',
        danger: true,
        returnFocus: removeButton
    });

    if (!confirmed) {
        showRemoveMessage(`Nothing was removed — “${student}” was not confirmed with Yes.`, true);
        return;
    }

    // Yes is what sends the name, and it is sent with the button grey for the round trip, so
    // no second press can be a second removal of the same student.
    setRemoveEnabled(false);
    showRemoveMessage(`Removing “${student}”…`, false);

    const sent = await sendRemoval(student);

    // What came of it, in one line: the removal and its count, or the reason nothing was
    // removed, drawn as an error. The home page's balance doors are where a removal shows, so
    // a second press is left possible here rather than the admin being sent away — students
    // may leave more than one at a time.
    showRemoveMessage(sent.ok ? removedMessage(student, sent.count) : sent.text, !sent.ok);

    // A removal that went through leaves the box empty and ready for the next student. The
    // dropdown is shut with it — a list still standing open would be offering a name that is
    // no longer on the backend — by giving the field the same `input` event typing into it
    // would have given it, and the accounts behind it are read again, because studentpicker.js
    // fetched them once as the page opened and still counts the student just removed.
    // That one line reaches into the picker's own start-up — the bare loadStudentAccounts()
    // its last line runs — and is written with ?. because eight of the nine pages that load
    // app.js have no picker and no such function. The caret is left in the box, and the
    // button is put back.
    if (sent.ok && removeNameField) {
        removeNameField.value = '';
        removeNameField.dispatchEvent(new Event('input', { bubbles: true }));
        window.loadStudentAccounts?.();
        removeNameField.focus();
    }

    setRemoveEnabled(true);
});

// The home page's foot -----------------------------------------------------------

// Sign out: POST /logout is the live route for it (listed in
// https://api.rongrongwu.com/openapi.json). Checked live with curl: it answers 200
// {"message": "Admin logged out"} and a set-cookie that empties session_id with
// Max-Age=0, so the session every other page leans on is gone by the time the answer
// arrives — which is why the browser is handed back to the front door, where the
// sign-in card is, once the sentence has been read.
const LOGOUT_URL = `${API_ORIGIN}/logout`;

const signOutButton = document.getElementById('signout');

signOutButton?.addEventListener('click', async function () {
    // One sign-out at a time: the button goes grey and unclickable for the round trip,
    // the same as the forms on the other pages do.
    signOutButton.setAttribute('aria-disabled', 'true');
    showHomeMessage(homeStatus, 'Signing this admin out…', false);

    try {
        const response = await fetch(LOGOUT_URL, {
            method: 'POST',
            credentials: 'include' // carry the session cookie out with it
        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json().catch(() => null);

        if (response.ok) {
            console.log('Logged out:', result);
            showHomeMessage(homeStatus, 'Signed out — taking you back to the sign-in card…', false);

            // Deliberately not re-enabled on this path: the session is gone, so a second
            // press while the front door is on its way would only sign out nobody.
            window.setTimeout(function () {
                window.location.href = SIGN_IN_URL;
            }, REDIRECT_DELAY_MS);
            return;
        }

        console.error('Logout error:', result);
        showHomeMessage(homeStatus, `Sign out failed (${response.status}): ${describeError(result)} — the session is still open.`, true);
        signOutButton.removeAttribute('aria-disabled');   // nothing was given up: let them try again
    } catch (error) {
        console.error('Network Error:', error);
        showHomeMessage(homeStatus, 'Network error — the sign-out API could not be reached, so this admin is still signed in.', true);
        signOutButton.removeAttribute('aria-disabled');
    }
});

// The admin name inside a GET /current-admin reply (an object of strings), or '' when
// the reply names nobody. The students table needs the name itself, not the sentence
// describeCurrentAdmin() builds for the status line above it.
function currentAdminNameIn(payload) {
    if (typeof payload === 'string') {
        return payload.trim();
    }

    if (payload === null || typeof payload !== 'object') {
        return '';
    }

    for (const key of ADMIN_NAME_KEYS) {
        const value = payload[key];

        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

// Query accounts page: the Supervisor field's default.
// getusers.html's Supervisor field carries the admin an account belongs to —
// GET /getuser compares ?supervisor= with each row's own supervisor field — and the
// name it wants is the one GET /current-admin answers for whoever holds the session
// cookie. That filter is an exact, case-sensitive compare, so the field is filled
// with the backend's own spelling of the signed-in admin rather than with anything
// typed by hand or kept in the page: the query page opens on this admin's own
// accounts, and the whole table is still one Clear away. Without a session the route
// answers 401 {"detail": "Not logged in"}, which is not an error here — there is
// simply no admin to fill in — so the field is left as the page left it.
const getUsersSupervisorField = getUsersForm?.elements.namedItem('supervisor') ?? null;

async function prefillSupervisorWithCurrentAdmin() {
    if (!getUsersSupervisorField) return; // every other page loads app.js for its own form

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // send the admin session cookie
        });

        if (!response.ok) {
            console.log(`No admin session (${response.status}), so the Supervisor field is left blank.`);
            return;
        }

        const admin = currentAdminNameIn(await response.json());

        if (!admin) {
            console.log('The backend named no admin, so the Supervisor field is left blank.');
            return;
        }

        // Only while the field is still empty: an admin who has already started
        // typing a name of their own must not have it replaced under their hands by
        // a slower reply.
        if (getUsersSupervisorField.value.trim()) {
            console.log('The Supervisor field was already filled in, so it was left as typed.');
            return;
        }

        getUsersSupervisorField.value = admin;
        console.log(`Filled the Supervisor field with the admin behind the session: ${admin}`);
    } catch (error) {
        console.error('Current admin error:', error);
    }
}

// Asked as the page opens, and only once: the answer cannot change without a login.
// Nothing on the page waits for it — the search runs the same whether the field was
// filled in or left blank.
prefillSupervisorWithCurrentAdmin();



// The accounts GET /getuser lists for `admin`, sorted by name and de-duplicated, each one
// as { name, job, salary }: the name the row is drawn under, the job that student has been
// given ('' when the account carries none, which is every account until a job is rotated
// onto it), and the job's own figure when the account sent one (null otherwise, which is
// the salaries list's to fill in). The ?supervisor= filter is exact — checked live:
// ?supervisor=teacher answers that admin's own account while ?supervisor=lagoon answers []
// — and each row's own supervisor field is read again here, so only this admin's students
// can reach the table on students.html, the same rule the transaction flow follows.
// The alphabetical order arranged here is the table's tie-break as well as this list's
// own order: students.html ranks its rows by the balance it reads from /get-balance, and
// a balance two students share is decided by the name order this sort puts them in
// (rankRosterRows). The sort has to stay here for that to hold — rows are ranked after
// the balances come back, so the name order is already in hand by then, not re-decided.
async function adminStudents(admin) {
    const response = await fetch(`${STUDENTS_URL}?${new URLSearchParams({ supervisor: admin })}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    // Keyed by name, so a student the backend lists twice is one row — the first of them
    // the one drawn.
    const accounts = new Map();

    for (const row of studentRows(await response.json())) {
        if (row.name && row.supervisor === admin && !accounts.has(row.name)) {
            accounts.set(row.name, { name: row.name, job: row.job, salary: row.salary });
        }
    }

    return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// Every account a GET /getuser payload carries, as { name, supervisor, job, salary } with
// the surrounding space trimmed off. The route is untyped, so the shapes accepted mirror
// the readers in studentpicker.js and sessionstorage.js:
//   [{"name": "X", "supervisor": "Y"}]                         -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}   -> the inner list
//   {"name": "X", "supervisor": "Y"} / "X"                     -> wrapped in an array
//   null / undefined / ""                                      -> []
// The job travels on the student's own account — it is what POST /set-jobs writes there —
// so it is read off the same row the name is: a job the account does not carry is '' rather
// than a guess, and a figure sent with the account is taken as that job's salary. A bare
// string names an account with no supervisor and no job, so it can belong to no admin and
// is dropped by the supervisor check above.
function studentRows(payload) {
    return studentEntries(payload).map((entry) => {
        const sent = firstField(entry, STUDENT_JOB_SALARY_KEYS);
        const figure = typeof sent === 'string' ? Number(sent.trim()) : sent;

        return {
            name: String(firstField(entry, STUDENT_NAME_KEYS) ?? entry ?? '').trim(),
            supervisor: String(firstField(entry, STUDENT_SUPERVISOR_KEYS) ?? '').trim(),
            job: String(firstField(entry, STUDENT_JOB_KEYS) ?? '').trim(),
            salary: typeof figure === 'number' && Number.isFinite(figure) ? figure : null
        };
    });
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

// The balance GET /get-balance reports for one student, as a number. The reply is
// {"user": "Rongrong Wu", "balance": 235} — checked live — and untyped beyond that,
// so a numeric string is accepted too. Anything else is thrown rather than written as a
// zero, because a zero is a real balance and a misread one is not.
async function studentBalance(name) {
    const response = await fetch(`${BALANCE_URL}?${new URLSearchParams({ student: name })}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /get-balance answered ${response.status}`);
    }

    const payload = await response.json();
    const value = payload?.balance ?? payload?.amount;
    const balance = typeof value === 'string' ? Number(value.trim()) : value;

    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
        throw new Error(`GET /get-balance sent no usable balance for "${name}"`);
    }

    return balance;
}

// The job -> salary list GET /reasons/job-salaries answers — checked live:
//   {"Attendance Monitor": 65, "Board Manager": 50, "Calendar Helper": 45, …}
// the same /reasons/{slug} route and shape the reason pages read: a plain map of the
// reason column to its amount. The slug is built out of the "JOB SALARIES" type value by
// reasonSlugFromType() rather than spelled by hand, the way the reason pages build theirs,
// so the request can only ever ask for the type column's own list and no hand-written slug
// can drift away from it.
//
// Answers a plain object of job -> figure, which is what the job-salary column prices the
// jobs /getuser listed with. A route that cannot be read, or one whose answer carries
// nothing with both a name and a figure, throws: the caller says so on the status line and
// leaves that column as a dash, rather than pricing a job out of nothing.
async function jobSalaries() {
    const slug = reasonSlugFromType(JOB_SALARIES_TYPE);
    const response = await fetch(`${REASONS_URL}/${slug}`, {
        method: 'GET',
        credentials: 'include' // the salaries are admin data, like the job list
    });

    if (!response.ok) {
        throw new Error(`GET /reasons/${slug} answered ${response.status}`);
    }

    const salaries = {};

    for (const entry of reasonList(await response.json())) {
        const priced = reasonEntry(entry);

        if (priced && typeof priced.points === 'number') {
            salaries[priced.value] = priced.points;
        }
    }

    return salaries;
}

// Reason pages --------------------------------------------------------------
// transaction_bonus.html, transaction_fines.html and transaction_spending.html each
// show one dropdown of reasons that comes from the backend. Every /reasons/{slug}
// route answers with the same shape - a plain map
// of reason -> amount, negatives included:
//   {"Bathroom expectation violation": -10, "Being rude / disrespectful": -15, ...}
// Those keys are the `reason` column of the table, and they double as the value each
// <option> reports, so the reason that leaves this page is the column's own text.
// A page says which list it wants with data-reason-type on its <select>, and that
// attribute carries the `type` column value exactly as the table spells it - the
// full "JOB SALARIES", not a nickname:
//   data-reason-type="JOB SALARIES"    ->    GET /reasons/job-salaries
// The slug is built out of that value by reasonSlugFromType() and out of nothing
// else, so the request can only ever ask for the type column's own list, and the
// built-in options a page ships with stay in place whenever the request fails or
// comes back with nothing usable.
// A page whose rows are to be filed under a plainer word than that list says so with
// data-transaction-type beside it, and the two are read apart: the list a page asks
// for and the sign a figure is recorded with come from data-reason-type alone, while
// the row's own `type` column is what data-transaction-type holds - so "Bonura bonus",
// "expense" and "fine" can be the words on the rows without being routes on the API.
const REASONS_URL = `${API_ORIGIN}/reasons`;

// The slug the API names a `type` column value by: everything lower case, every run
// of anything that is not a letter or a digit turned into one hyphen.
//   "JOB SALARIES"                -> "job-salaries"
//   "BONUS BUCKS"                 -> "bonus-bucks"
//   "BONURA BANK FINES"           -> "bonura-bank-fines"
//   "WAYS TO SPEND BONURA BUCKS"  -> "ways-to-spend-bonura-bucks"
// All four are routes openapi.json lists, and the raw type value is not one of them:
// /reasons/JOB%20SALARIES answers 404 {"detail": "Unknown reason type: JOB SALARIES"}.
function reasonSlugFromType(type) {
    return String(type)
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
}

// Where an approved transaction is written: POST /transaction-record, with the five
// fields a row of the table carries and nothing else - user, amount, type, date, memo.
// Both approving pages build their transaction in those terms and transactionBody()
// below cuts it down to them, so the reason pages and the Other page cannot drift apart.
// The route writes one row per call, so a pick of several students is written by one call
// per student: sendTransaction() below walks the picked students in a for loop, and every
// call carries the same five fields with `user` naming the student that turn of the loop is
// for.
//
//   user    the student the row belongs to: one of the students transaction1.html had the
//           backend confirm, whose names are what every other student route is asked with
//   amount  the figure, signed by the type on the reason pages and by the box the
//           admin typed in on the Other page, null for a reason carrying no figure
//   type    what the row is filed under: on a reason page the word that page files
//           its rows under - data-transaction-type, which all three reason cards
//           carry ("Bonura bonus", "expense", "fine"), falling back to the table's
//           type value where a card carries none ("BONUS BUCKS") - and on the Other
//           page, which has no list to take one from, the broad reason the admin
//           typed with the figure that goes with it ("Lost library book (-25 pts)")
//   date    the day and the time the date box holds, in the shape the history column
//           heads: YYYY/MM/DD HH:mm
//   memo    the row's own memo as the two pages fill it: a reason page's detailed
//           reason and its figure ("Exceptional effort (10 pts)"), the Other page's
//           memo box exactly as typed, null when that box was left empty
//
// Checked live: the route takes these five fields now. openapi.json declares
// Body_transaction_record_transaction_record_post with `user` and `amount` required and
// `type` (default ""), `date` and `memo` optional, and a body of these five answers 200 -
// fetched straight back out of GET /transaction-student-history?student=..., the row
// carries the type and the memo exactly as they were sent. The older TransactionRecord the
// route used to declare (student, type, slug, reason) is still in the schema, unread.
// Nothing of this browser's session is what authorizes the write: the same body answered
// 200 with no cookie at all, so the five fields below are the whole of what this page has
// to get right.
const RECORD_URL = `${API_ORIGIN}/transaction-record`;

// The clock, in the shape a row's `date` carries, so a row this app writes reads like a row
// the backend writes: YYYY/MM/DD HH:mm, as in 2026/09/29 16:17 — the shape the history column
// names, read the way a pattern is written, where MM is the month and mm the minute and the
// space holds the date and the time apart. It is the clock the four transaction-type pages'
// date boxes start at — spelled the way the browser's own control reads a value (boxStamp) —
// and the clock a box nobody has picked a day in is set to once more when the transaction is
// built, so the reason pages and the Other page cannot drift into two shapes or two moments.
//
// The route takes `date` as a plain string and keeps no stamp of its own, so the shape
// is this app's to choose, and choosing the history column's own shape keeps the row the
// app wrote and the rows the backend wrote reading alike — transactionview.js re-cuts
// both into that one shape, and reads back a stamp written this way unchanged.
//
// The parts are read off the local clock by hand rather than through toISOString(), which
// works in UTC and would date an evening transaction tomorrow on this side of the world.
// As a box's default this is the moment the page was opened, and because the box is filled
// once more when the transaction is built (transactionDate), a row left to that default is
// still stamped with the moment the admin approved it — the moment the Y/N question named —
// even if the answer is given a minute later.
function transactionStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');

    return `${now.getFullYear()}/${month}/${day} ${hour}:${minute}`;
}

// The date box ----------------------------------------------------------------
// The four transaction-type pages - the three reason lists and the Other page - carry one box
// for the row's date, so a transaction can be filed under the day and time it happened rather
// than under the moment it was typed in. The box is the browser's own day-and-clock control,
// type="datetime-local": a date input - the control addaccount.html's birthday box is - with a
// clock reading beside the day. It is picked over a text box for the reasons that birthday box
// gives: the browser hands the value over in one shape of its own, so nothing here has to parse
// what was typed, and the calendar behind it is what offers the day. Every day of every month is
// on it, January 1st through December 31st, and the months and the years around them are walked
// by the control itself. What a date input alone could not carry is the time of day, and a row's
// date is a stamp rather than a day - the history column heads it YYYY/MM/DD HH:mm - so the box
// is the one that keeps a clock as well as a calendar. The id below is the one all four pages
// give it. The box is filled from the clock as the page loads, so it starts at now, and whatever
// it holds at approval is what the row is written with: the day it names, at the time beside it,
// or at 00:00 when it names a day with no time on it, the time of day being the one part of the
// stamp a box is allowed to leave off (readStamp).
const dateField = document.getElementById('transactiondate');

// One clock reading in the shape that control reads and writes, which is not the shape the row
// carries: the day in three parts split by hyphens in place of the slashes, a T in place of the
// space, then the clock in two. Both shapes come off the one reading, so a box's default and the
// row it is written into can never name two different minutes.
function boxStamp() {
    const [day, time] = transactionStamp().split(' ');

    return `${day.replace(/\//g, '-')}T${time}`;
}

if (dateField) {
    dateField.value = boxStamp();
}

// True once the admin has set the box themselves, by picking a day from its calendar or by
// typing one into its parts. Until then the box means "now", and the clock is read into it once
// more when the transaction is built, so a page left open for an hour still writes the minute it
// happened - the rule the stamp kept before the box existed. A day the admin picked is theirs,
// and is never written over.
let dateChosen = false;

dateField?.addEventListener('input', function () {
    dateChosen = true;
});

// The shape a datetime-local box holds: the day in three parts, a T, then the clock in two. The
// clock is the one part that may be missing - a box left holding a day with no time beside it
// names a day all the same - so the T and the clock are read as a single optional part. The
// seconds are not here because the box carries none - the control's own step is a minute - and
// the shape a row is written in carries none either.
const BOX_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

// What the box holds, in the shape the row is written with, or null when it holds no whole day.
// A day with no clock reading beside it is filed at 00:00: the time of day is the part a box is
// allowed to leave off, and midnight is the reading this app gives a row that names a day and no
// time - so a box holding 2026-03-04 and a box holding 2026-03-04T00:00 write the same row. The
// shape is the whole test, the way it is for the birthday box, and for the same reason: the
// browser answers with a day it could name and a clock reading it could make sense of, and leaves
// the box empty when it could not - February the 30th is not a day any calendar offers, so the
// control keeps no such value - which means a box that answers at all answers with a real day,
// and with a real time whenever it carries one. What is left to refuse is a box holding no whole
// day at all: cleared, or a day cut off half way.
function readStamp(value) {
    const parts = BOX_STAMP.exec(String(value).trim());

    if (!parts) {
        return null;
    }

    return `${parts[1]}/${parts[2]}/${parts[3]} ${parts[4] || '00'}:${parts[5] || '00'}`;
}

// The date the row is written with, or null when the box holds no whole day - each page says so on
// its own status line, the way the Other page does with the amount. A day with no time on it is
// not a refusal: readStamp files it at 00:00. A page carrying no such box at all (none of the four
// that approve a transaction is without one) writes the row with the clock, so a page added
// without a box records the minute it happened instead of refusing.
function transactionDate() {
    if (!dateField) {
        return transactionStamp();
    }

    if (!dateChosen) {
        dateField.value = boxStamp();
    }

    return readStamp(dateField.value);
}

// What the four pages' status line says when the date box holds no whole day at all. One sentence
// for all of them, so the four cannot word the same refusal two ways. A time of day is not asked
// for: a box left holding only a day is filed at 00:00, and the sentence says so, so the admin who
// reads it knows what leaving the time off will do before they have to find out.
const DATE_PROMPT = 'The date box has to hold a day — pick one from its calendar, or type one in, before the row can be written; a day left with no time on it is filed at 00:00.';

// Protected route used to ask the backend whether this browser still holds an
// admin session. GET /current-admin answers the same question (the home page
// lookup above uses it), but this check stays on the trick sessionstorage.js also
// uses, because it keeps one request: POST /adduser with an empty body answers
// "Not logged in" (401) before it ever looks at the body.
//   401 {"detail": "Not logged in"} -> no admin session
//   422 (or 2xx)                    -> only the empty body was rejected, so the
//                                      session cookie was accepted. An empty body
//                                      can never create a user, so the check
//                                      changes nothing.
const ADMIN_CHECK_URL = `${API_ORIGIN}/adduser`;

// The student this transaction is for, stored by transaction1.html: the first of the students
// that page's box picked, so it is the one name these pages had before the box could pick
// several. Kept in sync with STUDENT_USERNAME_KEY in sessionstorage.js.
const STUDENT_KEY = 'student_username';

// The whole pick the same box made - every picked student's name, in the order they were
// picked, which is the order the box was clicked in - kept in sync with SELECTED_STUDENTS_KEY
// in sessionstorage.js. The four pages that approve a transaction load app.js and not that
// file, so the reader below is kept here by hand, the way the key itself is, and both read the
// one key the box wrote.
const SELECTED_STUDENTS_KEY = 'selected_students';

// The students the stored pick names, in the order they were named; [] when nothing is stored,
// or when what is stored cannot be read back as a list of names. The same reading of the same
// key sessionstorage.js's storedStudentSelection() makes, so half a JSON object, or a key
// somebody else wrote, can only ever come back as no pick at all rather than as a student to
// write a row for.
function storedStudentSelection() {
    const stored = sessionStorage.getItem(SELECTED_STUDENTS_KEY);

    if (!stored) {
        return [];
    }

    try {
        const names = JSON.parse(stored);

        return Array.isArray(names)
            ? names.filter((name) => typeof name === 'string' && name.trim() !== '')
            : [];
    } catch (error) {
        console.error('Stored student selection could not be read:', error);
        return [];
    }
}

// The students an approved transaction names, which is who it is written for: every student of
// the pick, in the order the box was clicked in, because the one transaction typed on these pages
// is recorded for each of them rather than for the first of them alone. This is read once, as the
// approving page builds the transaction - the very object the Y/N question is asked about - so
// what is written is what the admin agreed to. A page whose storage holds no pick at all falls
// to the one username STUDENT_KEY carries, which is all these pages had before the box could
// pick several; when neither is there the list is empty, and the approval writes nothing rather
// than a row for a student nobody named.
function selectedStudents() {
    const pick = storedStudentSelection();

    if (pick.length) {
        return pick;
    }

    const stored = sessionStorage.getItem(STUDENT_KEY);

    return stored && stored.trim() !== '' ? [stored] : [];
}

// The names of a pick as a sentence names them: "A", "A and B", "A, B and C". Every line that
// says who a transaction was written for goes through here, so the one-student case reads
// exactly as it always has and a longer pick does not run its names together with commas alone.
function nameList(names) {
    if (names.length <= 1) {
        return names[0] ?? '';
    }

    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Where the approved-but-unsent rows wait for the step that will POST them: the list of row
// bodies sendTransaction() is about to write, parked before the first of them leaves.
const PENDING_KEY = 'pending_transaction';

const reasonSelect = document.getElementById('reason');
const reasonResults = document.getElementById('reasonresults');
const reasonNext = document.getElementById('reasonnext');

// Which reason list this page wants: the type comes from the page itself in the
// table's own spelling, and the slug is read out of it right here, so no page has to
// know a URL and no hand-written slug can drift away from the type column.
const reasonType = reasonSelect?.dataset.reasonType?.trim() ?? '';
const reasonSlug = reasonSlugFromType(reasonType);

// What the row this page writes is filed under, which is not always what its list is
// named: data-transaction-type on the <select>, when the page carries one, is the word
// the row's own type column reads ("Bonura bonus", "expense", "fine"), and a page
// without it files its rows under the table's type value, exactly as every reason page
// did before the three cards wanted a plainer word. Read once, like the two above, and
// read apart from them: neither the /reasons list this page asks for nor the sign its
// figures are recorded with is taken from here.
const reasonRowType = reasonSelect?.dataset.transactionType?.trim() || reasonType;

// Fields a reason object may use to carry its display name and its points,
// most likely first.
const REASON_NAME_KEYS = ['name', 'title', 'label', 'id'];
const REASON_POINTS_KEYS = ['points', 'amount', 'value', 'score'];

// First field that actually carries something, or null when none of them does.
// Empty strings count as missing, so they never turn into blank options.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// The points a reason is worth as a number, or null when it has no usable one.
// Negatives survive: the fine list comes back as -10, -15, and so on.
function reasonPoints(entry) {
    const field = firstField(entry, REASON_POINTS_KEYS);

    if (field === null) {
        return null;
    }

    const points = Number(field);

    return Number.isFinite(points) ? points : null;
}

// Accepts every shape the API has answered with so far:
//   ["X"] / [{"name": "X", "points": 10}]                    -> used as is
//   {"bonuses": []} / {"bonus": []} / {"data": []} / {"items": []}
//                                                            -> the inner list
//   {"Birthday Bonus": 100}                                   -> one entry per key
//   {"name": "X", "points": 10} / "X"                         -> wrapped in an array
//   null / undefined / ""                                     -> []
function reasonList(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload === null || typeof payload !== 'object') {
        return payload ? [payload] : [];
    }

    for (const key of ['bonuses', 'bonus', 'data', 'items']) {
        const nested = payload[key];

        if (Array.isArray(nested)) {
            return nested;
        }

        if (nested && typeof nested === 'object') {
            return reasonList(nested); // {"bonuses": {"Birthday Bonus": 100}}
        }
    }

    // {"name": "X", "points": 10} - a single reason object
    if (firstField(payload, REASON_NAME_KEYS) !== null) {
        return [payload];
    }

    // {"Birthday Bonus": 100} - the live shape: a reason -> amount map. Object.keys
    // keeps the backend's order, and the key is the reason column value itself, which
    // reasonEntry() hands to the <option> as its value.
    return Object.keys(payload).map((name) => ({ name, points: payload[name] }));
}

// One element of the list -> the { label, value } pair an <option> needs:
//   "Teacher Assistant"                          -> both the same
//   {name: "Teacher Assistant", points: 65}       -> the label adds the amount
// The value is always the reason itself - the reason column value the backend sent -
// never a separate id, so the choice the page carries on with is exactly the text
// the column holds. Answers null when the entry carries nothing worth showing, so
// fillReasonOptions can skip it instead of printing "undefined" into the dropdown.
// Transaction types that take money out of an account. The reason lists carry the
// spending figures as what a student pays (2 up to 200) and the fines as negatives
// already (-5, -10, -15), but a transaction of either kind moves the balance the
// other way, so its amount is recorded negative either way. Salaries and bonuses add
// to the balance and keep their sign.
// These are the type values the reason lists are named by - data-reason-type, which is
// what fills the dropdown and what the sign is decided from - not the words the rows are
// filed under (data-transaction-type: "expense", "fine"): a row's own type is never read
// here, so a plainer word on the row cannot turn a charge into a payment.
const DEBIT_TYPES = ['WAYS TO SPEND BONURA BUCKS', 'BONURA BANK FINES'];

// One element of the list -> { label, value, points }, where label is the reason
// column's own text and points is the figure the backend sent with it (null when it
// sent none, which is what the page's built-in fallback list does):
//   "Teacher Assistant"                       -> label and value "Teacher Assistant",
//   {name: "Teacher Assistant", points: 65}     points 65
// The figure is signed later, by type, in fillReasonOptions().
function reasonEntry(entry) {
    if (entry === null || typeof entry !== 'object') {
        if (entry === undefined || entry === null || entry === '') {
            return null;
        }

        return { label: String(entry), value: String(entry), points: null };
    }

    const name = firstField(entry, REASON_NAME_KEYS);

    if (name === null) {
        return null;
    }

    return { label: String(name), value: String(name), points: reasonPoints(entry) };
}

// The amount to record for a reason, signed by its type: negative for the types that
// spend money, positive for the ones that add it. null when the reason carries no
// figure at all — nothing is invented for it, and null is what the route's schema
// allows.
function signedAmount(points, type) {
    if (typeof points !== 'number' || !Number.isFinite(points)) {
        return null;
    }

    return DEBIT_TYPES.includes(type) ? -Math.abs(points) : Math.abs(points);
}

// "Teacher Assistant (65 pts)" / "Pen pass (-5 pts)": the reason and the amount that
// will be recorded for it, spelled with the sign it will be recorded with, so the
// dropdown cannot promise one thing while the transaction carries another.
function amountLabel(reason, amount) {
    if (amount === null) {
        return reason;
    }

    // Math.abs so a single point reads "(-1 pt)", not "(-1 pts)".
    return `${reason} (${amount} ${Math.abs(amount) === 1 ? 'pt' : 'pts'})`;
}

// The amount an <option> carries, as a number, or null when it carries none — which is
// what the built-in list a page ships with looks like, its reasons having no figures to
// go with them.
function optionAmount(option) {
    const value = option?.dataset?.amount;

    if (value === undefined || value === '') {
        return null;
    }

    const amount = Number(value);

    return Number.isFinite(amount) ? amount : null;
}

// One <option>. The amount, when the reason came with one, is kept on the option so
// that approving it ships exactly the figure the label shows.
function makeOption(value, label, selected, amount) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;

    if (amount !== null && amount !== undefined) {
        option.dataset.amount = String(amount);
    }

    if (selected) {
        option.selected = true;
    }

    return option;
}

// Replaces the built-in options with the backend ones, keeping the placeholder
// "choose one" entry at the top. Entries without a name are skipped, and when
// nothing usable comes back the built-in list is left exactly as it is.
// Accepts a raw payload too, and reports how many reasons it filled in.
function fillReasonOptions(reasons) {
    if (!reasonSelect) return 0;

    const list = Array.isArray(reasons) ? reasons : reasonList(reasons);
    const placeholder = reasonSelect.options?.length ? reasonSelect.options[0].textContent : 'Choose one…';
    const options = [makeOption('', placeholder, true)];

    for (const entry of list) {
        const reason = reasonEntry(entry);

        if (reason) {
            // The figure is signed here, where the page's own type is known: spending
            // and fines come out negative, salaries and bonuses stay positive.
            const amount = signedAmount(reason.points, reasonType);
            options.push(makeOption(reason.value, amountLabel(reason.label, amount), false, amount));
        }
    }

    if (options.length === 1) {
        return 0; // placeholder only, so keep the built-in options
    }

    reasonSelect.replaceChildren(...options);

    return options.length - 1;
}

// Sets the dropdown's greyed-out state, the attribute styles.css styles for
// .panel select.
function setReasonEnabled(enabled) {
    if (!reasonSelect) return;

    if (enabled) {
        reasonSelect.removeAttribute('aria-disabled');
    } else {
        reasonSelect.setAttribute('aria-disabled', 'true');
    }
}

// Sets the Next button's greyed-out state, the same attribute styles.css styles
// for .btn (transaction1.html's Next link uses it too).
function setApproveEnabled(enabled) {
    if (!reasonNext) return;

    if (enabled) {
        reasonNext.removeAttribute('aria-disabled');
    } else {
        reasonNext.setAttribute('aria-disabled', 'true');
    }
}

function showReasonMessage(text, isError) {
    if (!reasonResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    reasonResults.replaceChildren(paragraph);
}

// ------------------------------------------------------- the Y/N question ----
// Approving a reason writes a transaction, and this app has no undo, so the choice
// is put in front of the admin one last time: "confirm transaction, Y/N", answered
// with two buttons. window.confirm() would answer OK/Cancel, which is not what the
// flow asks for, so the question is a small dialog of its own, built on first use
// and hidden again until it is needed. Nothing is sent while it is up, and the
// object it names is exactly the object the request will carry, because both are
// built from the same `transaction`.
//
// remove.html asks the same overlay about a student instead of a transaction, so
// everything the two questions do not have in common is handed in by the caller: the
// heading, the sentence under it, the two labels, the treatment the yes answer gets and
// the button the keyboard goes back to. The approving pages ask with "Y"/"N" and the
// name of the transaction; the remove page asks with "Yes"/"No", colours Yes as the red a
// refusal is drawn in (.btn--danger) and names the student who would be gone for good.
const CONFIRM_QUESTION = 'confirm transaction, Y/N';

let confirmDialog = null;   // the overlay, built the first time anything is approved
let confirmHeading = null;  // the h2 inside it: what is being asked
let confirmText = null;     // the sentence inside it: what is about to be written
let confirmYes = null;      // the yes button, where the focus lands
let confirmNo = null;       // the no button beside it
let confirmBack = null;     // where the keyboard goes once the question is answered
let confirmPending = null;  // { promise, resolve } of the question on screen

// One of the two answers. Both are ordinary .btn buttons, so they look and behave
// like every other button on the page.
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

    confirmYes = confirmButton('Y', 'btn--primary', true);
    confirmNo = confirmButton('N', 'btn--ghost', false);
    actions.append(confirmYes, confirmNo);

    panel.append(question, text, actions);
    dialog.append(panel);
    document.body.append(dialog);

    // The two answers work as keys too — the question says so — and Escape is the same
    // answer as the quieter one, so the question can always be dismissed without a mouse.
    // Each key is read off the label that is on the panel at the time, so a question
    // answered with "Yes"/"No" is answered by y and n exactly as the approving pages'
    // "Y"/"N" is. The listener lives on the document because the buttons are the only
    // things inside the overlay and the keyboard may be anywhere.
    document.addEventListener('keydown', function (event) {
        if (dialog.hidden) return;

        const key = event.key.toLowerCase();

        if (key === confirmYes.textContent.slice(0, 1).toLowerCase()) {
            answerConfirmation(true);
        } else if (key === confirmNo.textContent.slice(0, 1).toLowerCase() || key === 'escape') {
            answerConfirmation(false);
        }
    });

    confirmDialog = dialog;
    confirmHeading = question;
    confirmText = text;
}

// What the dialog says: the same facts the status line names after a recording, so
// the admin sees the students, the reason, the amount and - when it says more than the
// reason already has - the memo the row will be written with. The students are all of them,
// and the last sentence says how many accounts the Y answer really writes to, so a pick of
// several is never confirmed as if it were one student.
function describeTransaction(transaction) {
    const forStudent = transaction.students.length ? ` for ${nameList(transaction.students)}` : '';
    const amount = transaction.amount === null || transaction.amount === undefined
        ? 'no amount'
        : `amount ${transaction.amount}`;
    // The head is the type and, in quotes, the label the form showed - unless the type
    // already opens with that label, which is the Other page's case alone: its type is the
    // broad reason itself with the figure after it ("Lost library book (-25 pts)"), where a
    // reason page's type is the word its page files its rows under ("Bonura bonus",
    // "expense", "fine") and names nothing about the reason. There the question would be
    // saying the label twice.
    const head = transaction.label && !String(transaction.type).startsWith(transaction.label)
        ? `${transaction.type} — "${transaction.label}"`
        : transaction.type;
    // Named with the page's own word for the box, so the question reads like the form
    // that asked it. A reason page's memo is the label itself - the reason and the figure
    // the dropdown spelled ("Exceptional effort (10 pts)") - so the line is dropped when
    // there is nothing in it the question has not just said, and only the Other page's
    // note (the memo box, which the broad reason does not lead) gains one.
    const memo = transaction.memo && transaction.memo !== transaction.label
        ? ` Memo: "${transaction.memo}".`
        : '';
    // One row is written per student, so the question says so as soon as there is more than one
    // name above: the admin is agreeing to every one of those accounts, not to the first.
    const tail = transaction.students.length > 1
        ? ` Y writes it to each of those ${transaction.students.length} accounts, N drops it.`
        : ' Y writes it to the account, N drops it.';

    return `${head}${forStudent}, ${amount}.${memo}${tail}`;
}

// Puts the question on screen and answers true for the yes button, false for the other.
// The heading, the sentence under it, the two labels, the treatment Yes gets and the button
// the keyboard returns to are the caller's, because the two questions this app asks are not
// the same question: the approving pages put a transaction in front of the admin and answer
// it with Y and N, while remove.html puts a student there and answers it with Yes and No.
// The labels default to the approving pages' pair, which is what they ask with. A question
// already up is the question that has to be answered, so a second call shares it instead of
// stacking another one on top.
function askConfirmation(question, text, options = {}) {
    if (confirmPending) {
        return confirmPending.promise;
    }

    if (!confirmDialog) {
        buildConfirmDialog();
    }

    // The dialog is built once and asked many times, so every word on the panel is written
    // over the last question: the heading, the sentence, both labels and the yes button's
    // colour — red when the answer destroys something that cannot be brought back.
    confirmHeading.textContent = question;
    confirmText.textContent = text;
    confirmYes.textContent = options.yesLabel ?? 'Y';
    confirmYes.className = `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`;
    confirmNo.textContent = options.noLabel ?? 'N';

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

// Answers the question and takes it off the screen. The first answer is the answer:
// once it is gone there is nothing left to resolve, so a second click or key cannot
// change what was decided.
function answerConfirmation(answer) {
    const pending = confirmPending;

    if (!pending) {
        return;
    }

    confirmPending = null;
    confirmDialog.hidden = true;

    // The keyboard goes back to the button the question was asked from — the reason pages'
    // Next, the Other page's, or the remove page's — rather than being dropped on the body,
    // so the admin can carry on without reaching for the mouse.
    confirmBack?.focus();

    pending.resolve(answer);
}

// Fetches /reasons/{slug} for this page, swaps the built-in options for the
// backend ones, and hands back the sentence the page should show plus how many
// reasons ended up in the dropdown. It does not write that message itself: the
// page opener and the Next button share the one status line.
async function loadReasons() {
    if (!reasonSelect) return { count: 0, text: '', isError: false }; // pages without the dropdown

    setReasonEnabled(false);

    try {
        const response = await fetch(`${REASONS_URL}/${reasonSlug}`, {
            method: "GET",
            credentials: 'include' // the reason lists are admin data
        });

        if (!response.ok) {
            // 404 = wrong slug or no such route, so the built-in list the page
            // ships with stays in the dropdown.
            console.error('Reason list error:', response.status, await response.text());
            setReasonEnabled(true);
            return {
                count: 0,
                text: `The backend could not list /reasons/${reasonSlug} (${response.status}) — using the built-in list.`,
                isError: true
            };
        }

        const reason_json = await response.json()
        console.log("response json: ", reason_json)
        const reasons = reasonList(reason_json);
        console.log(reasons)

        const count = fillReasonOptions(reasons);
        setReasonEnabled(true);

        // count === 0 means nothing usable came back, and fillReasonOptions has
        // already left the built-in options in place.
        if (count === 0) {
            return {
                count: 0,
                text: `The backend returned no reasons from /reasons/${reasonSlug} — using the built-in list.`,
                isError: true
            };
        }

        return {
            count,
            text: `Loaded ${count} reason${count === 1 ? '' : 's'} from /reasons/${reasonSlug}.`,
            isError: false
        };
    } catch (error) {
        console.error('Network Error:', error);
        setReasonEnabled(true);
        return {
            count: 0,
            text: 'Network error — the reason list could not be loaded, using the built-in list.',
            isError: true
        };
    }
}

// 'unknown' while the backend is being asked, then 'granted' or 'denied'.
let permissionState = 'unknown';

// Asks the backend whether this browser still holds an admin session. Answers
// with the verdict and with the sentence the page should show for it.
async function checkAdminPermission() {
    try {
        const response = await fetch(ADMIN_CHECK_URL, {
            method: 'POST',
            credentials: 'include', // send the admin session cookie
            body: new FormData()    // empty body: cannot add an account
        });

        // 422 means /adduser only complained about the empty body, so the session
        // cookie was accepted: the admin is logged in.
        if (response.ok || response.status === 422) {
            permissionState = 'granted';
            return { granted: true, text: 'Admin login confirmed by the backend.', isError: false };
        }

        if (response.status === 401) {
            permissionState = 'denied';
            console.error('Admin check: the backend refused the request — not logged in.');
            return {
                granted: false,
                text: 'Not logged in — the backend refused the request. Log into the admin account first.',
                isError: true
            };
        }

        console.error('Admin check error:', response.status, await response.text());
        permissionState = 'denied';
        return {
            granted: false,
            text: `Unexpected reply from the API (${response.status}) — cannot confirm your login.`,
            isError: true
        };
    } catch (error) {
        console.error('Network Error:', error);
        permissionState = 'denied';
        return {
            granted: false,
            text: 'Network error — the login check could not reach the API.',
            isError: true
        };
    }
}

// Opening a reason page: ask for admin powers first, then fill the dropdown.
// The one status line is shared, so both facts are put on it: whether the backend
// accepted the session and what the dropdown ended up with. The line is styled as
// an error if either half went wrong.
async function openReasonPage() {
    if (!reasonSelect) return; // every other page loads app.js for its own form only

    // A transaction is only ever for a student confirmed on transaction1.html, so
    // without one the dropdown and the Next button stay switched off and the status
    // line says where to go. This is what stops a type being opened straight from
    // the URL with nobody behind it.
    if (!sessionStorage.getItem(STUDENT_KEY)) {
        setApproveEnabled(false);
        setReasonEnabled(false);
        showReasonMessage('No student was confirmed by the backend — go back to the transaction page and enter a username that exists.', true);
        return;
    }

    if (!reasonSlug) {
        setApproveEnabled(false);
        setReasonEnabled(false);
        showReasonMessage(`Unknown reason type "${reasonType}" — data-reason-type on the <select> must be the table's type column value, e.g. "JOB SALARIES".`, true);
        return;
    }

    setApproveEnabled(false);

    const check = await checkAdminPermission();
    setApproveEnabled(check.granted);

    const list = await loadReasons();

    showReasonMessage(`${check.text} ${list.text}`, check.isError || list.isError);
}

// Next: approving the transaction. The backend is asked for admin powers one more
// time here, because the page may have been open since the first check and an
// admin session can expire in between.
//
// One approval runs at a time: while the Y/N question is up, a second click would
// only put the same question up again, and one click is one answer.
let approvalRunning = false;

async function approveReason() {
    if (!reasonSelect) return;
    if (approvalRunning) return;

    approvalRunning = true;

    try {
        await runApproval();
    } finally {
        approvalRunning = false;
    }
}

// The approval itself, split out so the one-at-a-time flag above covers every way
// out of it — recorded, refused, unanswered or off the network.
async function runApproval() {
    if (!reasonSelect.value) {
        showReasonMessage('Choose a reason before approving.', true);
        return;
    }

    // The row's date is checked before the backend is asked for anything, like the Other
    // page's amount: a box holding no whole day is a reason to stop and say so, not something to
    // send and find out about afterwards. A day left without a time is not: the row is stamped
    // 00:00 rather than refused.
    const date = transactionDate();

    if (date === null) {
        showReasonMessage(DATE_PROMPT, true);
        dateField?.focus();
        return;
    }

    setApproveEnabled(false);
    const check = await checkAdminPermission();

    if (!check.granted) {
        showReasonMessage(check.text, true);
        return;
    }

    setApproveEnabled(true);

    const option = reasonSelect.selectedOptions?.[0];

    // The row the route is written with. type is what this page files its rows under:
    // data-transaction-type where the card carries one (the bonus card's "Bonura bonus",
    // the expense card's "expense", the fine card's "fine"), and the page's
    // data-reason-type otherwise - the type column value as the table spells it, "BONUS
    // BUCKS" - never the URL slug the reason list was fetched by ("bonus-bucks"), which
    // names the list and nothing else.
    // memo is the table's memo column: the reason and the figure that goes with it,
    // spelled the way the dropdown spelled them ("Exceptional effort (10 pts)"), so the
    // row says what the reason was worth without the reader doing the sum.
    // amount is the figure that goes with that reason, negative for the two types that
    // spend money, null when the reason carries no figure at all (the built-in fallback
    // list of a page, which carries its reason texts and no figures). date is what the date
    // box holds, re-cut into the history column's own shape: the clock, while the box is
    // still the page's own, and the admin's own day and time once they have picked one. label
    // is only what the eye saw, and is not sent: the question and the status
    // line name the transaction with it, and the memo is written from it.
    const label = option ? option.textContent : reasonSelect.value;
    const transaction = {
        students: selectedStudents(),
        type: reasonRowType,
        amount: optionAmount(option),
        date: date,
        memo: label,
        label: label
    };

    // The approved choice is parked next to the student username transaction1.html
    // stored, and it is parked before anything is sent: the bodies kept in
    // sessionStorage are the ones the requests carry, so a send that fails loses
    // nothing.
    const forStudent = transaction.students.length ? ` for ${nameList(transaction.students)}` : '';

    // The Y/N question stands between the choice and the write: "confirm transaction,
    // Y/N". It is asked about the very object the request will carry, and nothing is
    // parked or posted until it is answered with Y, so a wrong student or a wrong
    // reason cannot leave this page. N (the N button, the N key or Escape) drops the
    // whole thing, and Next stays live so the same click can be tried again.
    const confirmed = await askConfirmation(CONFIRM_QUESTION, describeTransaction(transaction), {
        returnFocus: reasonNext
    });

    if (!confirmed) {
        showReasonMessage(`Nothing was recorded — the "${transaction.label}" transaction${forStudent} was not confirmed with Y.`, true);
        return;
    }

    // POST /transaction-record writes it, through the one function both approving
    // pages send with, so the reason pages and the Other page cannot drift apart.
    const sent = await sendTransaction(transaction);

    if (sent.ok) {
        // Recorded once is recorded: Next goes grey until another reason is
        // chosen, so a second click cannot write the same transaction twice.
        setApproveEnabled(false);
        showReasonMessage(recordedMessage(transaction), false);

        // The transaction is done with this account, and the home page is where the
        // balance it just changed is drawn, so the flow hands the admin back to it
        // instead of leaving them on a form with nothing left to do.
        redirectHomeAfter(REDIRECT_DELAY_MS);
        return;
    }

    showReasonMessage(sent.text, true);

    // A send that did not go through leaves Next live, so the same choice can be
    // tried again.
    setApproveEnabled(true);
}

// The body one row is written with: exactly the five fields a row of the table carries
// - user, amount, type, date, memo - and nothing else. What the pages keep in their own
// transaction object is more than this (the label the question reads, the reasons the
// memo is built from), and none of that goes over the wire: `user` is the student that
// turn of sendTransaction()'s loop is writing for, `type` is what the row is filed under,
// and the reason it was written for is in the memo - except on the Other page, which has
// no list to take a type from, where the reason the admin typed is the type and the memo
// is whatever went in the memo box. The five fields are the same for every student of the
// pick, which is why the loop below builds one body per student and changes nothing but
// `user`.
function transactionBody(transaction, student) {
    return {
        user: student,
        amount: transaction.amount,
        type: transaction.type,
        date: transaction.date,
        memo: transaction.memo
    };
}

// The write itself, shared by the reason pages and the Other page and made for the whole pick:
// the students the box stored are read once, the body each of their rows is written with is
// built once - the same five fields for every one of them, only `user` differing - and then, in
// a for loop over those bodies, one row is POSTed per student, as JSON, with the admin session
// cookie travelling with the request. One transaction typed once is therefore recorded for every
// picked student, one row each, rather than for the first of them alone.
//
// The bodies are parked in sessionStorage as the list of them before the first request leaves,
// so a send that fails loses nothing. The loop stops at the first row the backend refuses or
// that never reaches it: the rest of the pick would be asked for with the same session and
// answered the same way, and every one of them would sit out the network's own timeout again,
// once per student, while the admin is the one who has to read what happened and decide about
// the rest.
//
// Answers { ok: true, count } once the backend has written every row, and { ok: false, text }
// with the sentence to show when it refused, when the network was gone, or when there is no
// student to write for.
async function sendTransaction(transaction) {
    // The rows are only written for an admin, and the backend is the only thing that can say who
    // is one: the empty-body POST /adduser probe is asked here, once for the whole approval
    // rather than once per student, at the last moment before the rows leave. The approving
    // pages have already asked it once — before the Y/N question — but an answer given there is
    // not an answer given here, and a session that ran out in between is precisely what this
    // check is for. A refusal writes nothing, so nothing is parked either: these rows were never
    // on their way.
    const check = await checkAdminPermission();

    if (!check.granted) {
        return { ok: false, text: `Nothing was recorded — ${check.text}` };
    }

    // Who the rows are for is the pick the Y/N question was asked about - the students the
    // approving page read out of sessionStorage as it built this transaction - so what is written
    // is what the admin agreed to, name for name. A transaction naming nobody is refused rather
    // than sent as a row for an empty username: the approving pages sit behind transaction1.html's
    // confirmed pick, so this is a page whose storage was emptied while it was open, and the
    // sentence says where to pick a student instead.
    const students = transaction.students;

    if (!students.length) {
        return {
            ok: false,
            text: 'Nothing was recorded — this transaction names no student, so there is no account to write the rows to. Go back to the transaction page, pick the students it is for, and press continue.'
        };
    }

    const bodies = students.map((student) => transactionBody(transaction, student));

    sessionStorage.setItem(PENDING_KEY, JSON.stringify(bodies));
    console.log('Approved:', bodies);

    const written = [];
    let refusal = null;

    for (const body of bodies) {
        const answer = await writeTransaction(body);

        if (!answer.ok) {
            refusal = { student: body.user, text: answer.text };
            break;
        }

        written.push(body.user);
    }

    if (!refusal) {
        return { ok: true, count: written.length };
    }

    // The students of the pick the loop never reached are named with the ones it did: a
    // half-written approval is the one thing the admin must not have to work out for themselves.
    return {
        ok: false,
        count: written.length,
        text: stoppedMessage(transaction, written, refusal, students.slice(written.length + 1))
    };
}

// The one write: the body above, as JSON, with the admin session cookie travelling with the
// request. Answers { ok: true, result } once the backend has written the row, and
// { ok: false, text } with the reason alone when it refused or the network was gone, because the
// sentence the admin reads is the caller's, and that one has to name the student this row was for.
async function writeTransaction(body) {
    try {
        const response = await fetch(RECORD_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // A refusal can answer with something that is not JSON, so the body is read
        // once and never trusted to parse.
        const result = await response.json().catch(() => null);

        if (response.ok) {
            console.log('Transaction recorded:', result);
            return { ok: true, result };
        }

        console.error('Transaction record error:', result);
        return {
            ok: false,
            text: `the backend refused the row (${response.status}): ${describeError(result)}`
        };
    } catch (error) {
        console.error('Network Error:', error);
        return { ok: false, text: 'the row never reached the API (network error)' };
    }
}

// The sentence both approving pages show once the backend has written every row.
function recordedMessage(transaction) {
    const students = transaction.students;
    const forStudent = students.length ? ` for ${nameList(students)}` : '';
    // What the row was filed under is named - unless the type opens with the label that
    // was just quoted, which is the Other page's case alone: there the row's type is the
    // broad reason itself with its points, so naming it again says the same words twice.
    const under = String(transaction.type).startsWith(transaction.label ?? '')
        ? 'the backend wrote the transaction'
        : `the backend wrote the ${transaction.type} transaction`;
    // One row was written per student, which the sentence says outright as soon as there was
    // more than one: the admin should not have to count a list of names to know that the whole
    // pick was written for.
    const each = students.length > 1 ? ', one for each of them' : '';

    return `Recorded "${transaction.label}"${forStudent} — ${under}${each}. Taking you to the home page…`;
}

// What the admin reads when the loop stopped partway: which students the transaction was written
// for, which student it stopped at, and which students of the pick never got their row. The last
// sentence is only written when something has already been written, because pressing Next again
// asks for the whole pick rather than for the rest of it, and the admin has to know that before
// they do it.
function stoppedMessage(transaction, written, refusal, unwritten) {
    const rest = unwritten.length
        ? ` Nothing was written for ${nameList(unwritten)}.`
        : '';
    const again = written.length
        ? ` Pressing Next again writes the whole pick, ${nameList(written)} included.`
        : '';

    if (!written.length) {
        return `Nothing was recorded — ${refusal.text}, and ${refusal.student} was the first of the pick.${rest}`;
    }

    return `Recorded the "${transaction.label}" transaction for ${nameList(written)}, and nothing for the rest of the pick — ${refusal.text}, at ${refusal.student}.${rest}${again}`;
}

// Choosing another reason is a different transaction, so it brings back the Next
// button that a recorded or refused one left grey.
reasonSelect?.addEventListener('change', function () {
    if (reasonSelect.value) {
        setApproveEnabled(true);
    }
});

// So is another day: the box is part of the row that gets written, so setting it — picking a
// day in its calendar, or typing one in — brings Next back the way choosing another reason
// does, but with a reason in the dropdown, since the box on its own has nothing to file. (The
// Other page needs no line here: its date box is inside its form, whose own input listener
// already covers every box in it.)
dateField?.addEventListener('input', function () {
    if (reasonSelect?.value) {
        setApproveEnabled(true);
    }
});

reasonNext?.addEventListener('click', approveReason);

// The page starts itself: ask the backend for admin powers, fill the dropdown,
// then say on the one status line what happened.
openReasonPage();

// Other transaction page -------------------------------------------------------
// transaction-other.html is the type that is not one of the lists: the admin types the
// amount, the broad reason and the memo themselves, because the thing being
// recorded has no row in the reasons table. It took the salary page's place, and that
// list is still paid out in one go by jobrotation.js through /pay-salaries. Nothing is
// fetched to fill this form - there is no list to fetch, and the boxes are the whole of
// it.
//
// The row it writes is the same five fields the reason pages write, with both free-text
// boxes typed in instead of picked. The broad reason is the row's type, the way "Bonura
// bonus" is the type of a bonus row: there is no list here to take a broad type from, so
// what the reason is filed under is the reason and its points
// ("Lost library book (-25 pts)"). The memo box is the row's memo, whole and as typed -
// the note the history page draws under its "Memo" head, with no reason in front of it,
// the reason being the row's type already.
// Nothing about the amount is signed here, unlike the reason pages: the admin's sign is
// their own, so a minus in the box takes points away and a plain number gives them.
const otherForm = document.getElementById('otherform');
const otherAmount = document.getElementById('otheramount');
const otherReason = document.getElementById('otherreason');
const otherMemo = document.getElementById('othermemo');
const otherNext = document.getElementById('othernext');
const otherResults = document.getElementById('otherresults');

// The Other page keeps no type value of its own: the row's type is the broad reason and
// its points, built where the transaction is built (runOtherApproval), so there is no
// second spelling of it to keep in step - the type a reason page writes comes from its
// card (data-transaction-type, or data-reason-type where it carries none), and this
// page's is its own text.

// True once the backend has confirmed the session and a student is being transacted
// for. The greyed-out attribute is what the eye and the mouse see; this flag is what
// the keyboard is checked against, because Enter inside a box submits the form whether
// or not the button looks live.
let otherEnabled = false;

// Sets the Other page's Next button greyed-out or live - the same attribute styles.css
// styles for .btn on the reason pages - and remembers the answer for that check.
function setOtherEnabled(enabled) {
    otherEnabled = Boolean(enabled);

    if (!otherNext) return;

    if (otherEnabled) {
        otherNext.removeAttribute('aria-disabled');
    } else {
        otherNext.setAttribute('aria-disabled', 'true');
    }
}

function showOtherMessage(text, isError) {
    if (!otherResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    otherResults.replaceChildren(paragraph);
}

// The row's memo as it should be sent: the text of the memo box, which the page, the
// column and the route all call memo - the whole of the row's memo, since the broad
// reason it belongs to is the row's type instead. Null when it was left empty: the route
// takes a null memo, and an empty box is not a note.
function otherMemoValue() {
    const memo = otherMemo?.value?.trim() ?? '';

    return memo === '' ? null : memo;
}

// Opening the Other page: the same two checks the reason pages make as they load - a
// student has to have been confirmed on transaction1.html, and the backend has to still
// recognise this browser as an admin.
async function openOtherPage() {
    if (!otherAmount) return; // every other page loads app.js for its own form only

    // A transaction is only ever for a student confirmed on transaction1.html, so
    // without one the boxes and the Next button stay switched off and the status line
    // says where to go. This is what stops this type being opened straight from the URL
    // with nobody behind it.
    if (!sessionStorage.getItem(STUDENT_KEY)) {
        setOtherEnabled(false);
        showOtherMessage('No student was confirmed by the backend — go back to the transaction page and enter a username that exists.', true);
        return;
    }

    setOtherEnabled(false);

    const check = await checkAdminPermission();
    setOtherEnabled(check.granted);

    // Who the transaction is for is the one thing neither box can say, so the line
    // names the students transaction1.html confirmed along with the invitation - all of
    // them, because the row is written for every student of the pick.
    const students = selectedStudents();
    const forStudents = students.length ? ` for ${nameList(students)}` : '';
    const each = students.length > 1 ? ` — one row each` : '';
    const nextStep = check.granted
        ? ` Type the amount, the broad reason and, if it is worth remembering, a memo${forStudents}${each}, then press Next.`
        : '';

    showOtherMessage(`${check.text}${nextStep}`, check.isError);
}

// Next: approving the Other transaction. The same shape as the reason pages' approval -
// the backend is asked for admin powers once more, the Y/N question stands between the
// choice and the write, and one approval runs at a time.
async function approveOther() {
    if (!otherAmount || !otherEnabled || approvalRunning) return;

    approvalRunning = true;

    try {
        await runOtherApproval();
    } finally {
        approvalRunning = false;
    }
}

// The approval itself, split out so the one-at-a-time flag above covers every way out
// of it - recorded, refused, unanswered or off the network.
async function runOtherApproval() {
    const reason = otherReason?.value?.trim() ?? '';
    const amountText = otherAmount?.value?.trim() ?? '';
    const amount = Number(amountText);

    if (!reason) {
        showOtherMessage('Type the broad reason before approving — it is what the row is filed under, with its points after it.', true);
        otherReason?.focus();
        return;
    }

    // The schema's amount is an integer, so half a point is refused here rather than
    // rounded somewhere the admin cannot see it.
    if (amountText === '' || !Number.isInteger(amount)) {
        showOtherMessage('The amount has to be a whole number of points — 25 to give them, -25 to take them away.', true);
        otherAmount?.focus();
        return;
    }

    // The same check the reason pages make of their date box, said on this page's status
    // line: the row cannot be written without a day, so the box is asked about before
    // anything is sent - a day with no time on it being a day all the same, stamped 00:00.
    const date = transactionDate();

    if (date === null) {
        showOtherMessage(DATE_PROMPT, true);
        dateField?.focus();
        return;
    }

    setOtherEnabled(false);
    const check = await checkAdminPermission();

    if (!check.granted) {
        showOtherMessage(check.text, true);
        return;
    }

    setOtherEnabled(true);

    // The row itself, the same five fields a reason page's row carries: type is the broad
    // reason with the figure the row is written with ("Lost library book (-25 pts)"), that
    // being what this page has to file the row under, amount is what the first box holds
    // with the admin's own sign, and memo is the text of the memo box or null when it was
    // left empty. date is what the date box holds, re-cut into the history column's own shape
    // — the same box, read through the same function, so the two approving pages cannot date a
    // row two ways. label is only what the eye saw: the question and the status line name the
    // transaction with it, and it is not sent.
    const transaction = {
        students: selectedStudents(),
        type: amountLabel(reason, amount),
        amount: amount,
        date: date,
        memo: otherMemoValue(),
        label: reason
    };

    const confirmed = await askConfirmation(CONFIRM_QUESTION, describeTransaction(transaction), {
        returnFocus: otherNext
    });

    if (!confirmed) {
        const forStudent = transaction.students.length ? ` for ${nameList(transaction.students)}` : '';
        showOtherMessage(`Nothing was recorded — the "${transaction.label}" transaction${forStudent} was not confirmed with Y.`, true);
        return;
    }

    const sent = await sendTransaction(transaction);

    if (sent.ok) {
        // Recorded once is recorded: Next goes grey until a box changes, so a second
        // Enter or click cannot write the same transaction twice.
        setOtherEnabled(false);
        showOtherMessage(recordedMessage(transaction), false);
        redirectHomeAfter(REDIRECT_DELAY_MS);
        return;
    }

    showOtherMessage(sent.text, true);

    // A send that did not go through leaves Next live, so the same choice can be tried
    // again.
    setOtherEnabled(true);
}

// Editing the boxes is a different transaction, so it brings back the Next button that
// a recorded or refused one left grey - the same rule as choosing another reason. Both
// boxes have to hold something for that, because neither half alone can be written.
otherForm?.addEventListener('input', function () {
    if (otherAmount?.value.trim() && otherReason?.value.trim()) {
        setOtherEnabled(true);
    }
});

// Next is a submit button so that Enter inside a box works too, and a form that asks to
// be submitted is answered here: nothing may leave this page as a query string.
otherForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    approveOther();
});

// The page starts itself: ask the backend for admin powers, then say on the status line
// what it answered.
openOtherPage();

// remove.html starts itself the same way, and its one line is down here rather than at the
// foot of its own section above because the check it starts with is the one shared
// checkAdminPermission and the ADMIN_CHECK_URL it reads is declared this far down: a const
// cannot be read before the line that declares it, and the whole file is read before
// anything is asked. The boot calls above find none of their own elements on remove.html
// and start nothing, so this last line is the only one with work to do there.
openRemovePage();

