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

// Today as every date in this project is written: YYYY-MM-DD, the one shape an
// <input type="date"> reports and a date column reads. The parts are read off the
// local calendar by hand rather than with toISOString(), which works in UTC and
// would name tomorrow for a few evening hours on this side of the world.
function todayISO() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

// The add account page's birthday check. A date input answers with YYYY-MM-DD, or
// with an empty string when it could not make sense of what was typed, so the shape
// is tested first and the day is then compared with today. Both sides are the same
// shape, so a plain string compare settles it and no second Date has to be built;
// the pattern is what keeps the compare honest if the field is ever typed by hand.
// A birthday that has not happened yet is a typo, not a birthday, and is what the
// empty string case covers too.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPastOrToday(value, today) {
    return ISO_DATE.test(value) && value <= today;
}

// The birthday field, on the one page that has it (app.js is loaded by every page).
// The date input is handed the same newest day the check below uses, as its max
// attribute, so the calendar the browser opens has the coming days greyed out and the
// browser's own validation explains them. The check still decides on submit, in case
// a browser ignores the attribute or the page is driven by script instead of a click.
const birthdayField = form?.elements.namedItem('birthday');

if (birthdayField) {
    birthdayField.max = todayISO(); // a birthday cannot lie in the future
}

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

  // The birthday is checked here too, before anything is sent: it has to be a real
  // day that has already arrived. The field points itself out on the way back, the
  // way the browser would have, so the admin is not left hunting for the box.
  if (birthdayField && !isPastOrToday(birthdayField.value, todayISO())) {
      alert('Error: The birthday has to be a real date that is not in the future — the account was not created.');
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
    // 4. Send the request to your server
    const response = await fetch('https://api.rongrongwu.com/adduser', {
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
const GET_USERS_URL = 'https://api.rongrongwu.com/getuser';

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
const ADD_ADMIN_URL = 'https://api.rongrongwu.com/add-admin';

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
const LOGIN_URL = 'https://api.rongrongwu.com/login';

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
// door has no route behind it yet, so it says that rather than pretending to sign
// anyone in.
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

// The student door: no student sign-in exists yet, so pressing it says so instead of
// leaving a button that looks broken.
const studentSignInButton = document.getElementById('studentsignin');

studentSignInButton?.addEventListener('click', function () {
    showLoginMessage(
        document.getElementById('signinresults'),
        'Student sign in is not ready yet — the student side has no login route. Use “Admin sign in” for the admin login.',
        false
    );
});

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
// browser is signed in as, the six doors on it, and Sign out. Almost
// everything on it starts from the same live route, GET /current-admin (listed in
// https://api.rongrongwu.com/openapi.json): it takes the session cookie and answers
// 401 {"detail": "Not logged in"} without one — checked live with curl, exactly like
// the other protected routes. So the requests send credentials: "include", the same
// as the login and add-admin forms above.
const CURRENT_ADMIN_URL = 'https://api.rongrongwu.com/current-admin';

// The front door, index.html — the sign-in card. That is where the browser belongs
// once the session has been given up, or once it turns out there is none; HOME_URL
// above is the same road the other way round.
const SIGN_IN_URL = '/index.html';

// The status line under the doors, where the hub says everything it has to say: a
// greeting that could name nobody, Remove student with no route behind it, a Sign out
// that did not go through.
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
// per student of the admin behind the session cookie: the student's name on the left and
// the balance on their account on the right, and nothing below the last row — the table
// is not added up. Three live routes stand behind it, all of them taking the session
// cookie:
//   GET /current-admin                -> which admin this browser is signed in as;
//                                        401 {"detail": "Not logged in"} with no
//                                        session, like every other protected route
//   GET /getuser?supervisor=<admin>   -> that admin's students — the exact filter the
//                                        transaction flow uses, so only this admin's
//                                        rows come back
//   GET /get-balance?student=<name>   -> {"user": "Rongrong Wu", "balance": 235},
//                                        checked live; an unknown student answers 0
//                                        rather than 404, which is why only names
//                                        /getuser has listed are ever asked about
const STUDENTS_URL = 'https://api.rongrongwu.com/getuser';
const BALANCE_URL = 'https://api.rongrongwu.com/get-balance';

// Fields an account object may carry its name and its supervisor in, most likely
// first — the same order the other pages read them in, the route being untyped.
const STUDENT_NAME_KEYS = ['name', 'username', 'account', 'id'];
const STUDENT_SUPERVISOR_KEYS = ['supervisor', 'owner', 'manager'];

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

        showRosterMessage(rosterStatus, `Reading the students of “${admin}” and their balances…`, false);

        const students = await adminStudents(admin);

        if (!students.length) {
            clearRosterTable();
            showRosterMessage(rosterStatus, `The backend lists no student with “${admin}” as their supervisor, so there is nothing to show.`, true);
            return;
        }

        // One request per student, all at once. A balance that cannot be read takes
        // that student's row off the table rather than being written as a zero, and the
        // status line says how many fell out, so the table never shows a figure nobody
        // read.
        const rows = await Promise.all(students.map(async (name) => ({
            name,
            balance: await studentBalance(name).catch((error) => {
                console.error(`Balance of "${name}" could not be read:`, error);
                return null;
            })
        })));
        const drawn = rows.filter((row) => row.balance !== null);

        if (!drawn.length) {
            clearRosterTable();
            showRosterMessage(rosterStatus, 'No balance could be read for these students, so there is nothing to show.', true);
            return;
        }

        drawRosterTable(drawn);

        const missing = rows.length - drawn.length;
        showRosterMessage(
            rosterStatus,
            `${drawn.length} student${drawn.length === 1 ? '' : 's'} of the admin “${admin}”, alphabetically — the balance on each account.`
            + (missing
                ? ` ${missing} balance${missing === 1 ? '' : 's'} could not be read, so ${missing === 1 ? 'that student is' : 'those students are'} not in the table.`
                : ''),
            false
        );
    } catch (error) {
        console.error('Student table error:', error);
        clearRosterTable();
        showRosterMessage(rosterStatus, 'Network error — the students and their balances could not be read from the API. Press Refresh to read them again.', true);
    } finally {
        rosterReadRunning = false;
        rosterRefreshButton?.removeAttribute('aria-disabled');
        stampRoster();
    }
}

// Fills the table: one row per student, the name in the left column and the balance in
// the right. Every cell is built as a node rather than with innerHTML, because the names
// come from the backend.
function drawRosterTable(rows) {
    const body = document.createDocumentFragment();

    for (const row of rows) {
        const line = document.createElement('tr');
        line.className = 'roster__row';

        const name = document.createElement('td');
        name.className = 'roster__name';
        name.textContent = row.name;

        // A balance below zero is the one red in the table; the figure itself carries
        // its own minus sign, so nothing else has to say which way the account went.
        const amount = document.createElement('td');
        amount.className = row.balance < 0
            ? 'roster__amount roster__amount--negative'
            : 'roster__amount';
        amount.textContent = String(row.balance);

        line.append(name, amount);
        body.append(line);
    }

    rosterRows.replaceChildren(body);

    if (rosterFrame) {
        rosterFrame.hidden = false;
    }

    console.log(`Listed ${rows.length} student(s) and their balances.`, rows);
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

// The home page's other two doors ------------------------------------------------
// "Remove student" has nothing behind it: https://api.rongrongwu.com/openapi.json
// lists two student routes and neither of them takes a student away — POST /adduser
// makes one and GET /getuser lists them, and there is no delete route at all. So the
// door says that rather than looking broken, the way index.html's student door does.
const removeStudentButton = document.getElementById('removestudent');

removeStudentButton?.addEventListener('click', function () {
    showHomeMessage(
        homeStatus,
        'Removing a student has no route on the backend yet — nothing was removed. The students of the admin who is signed in are behind “View students”.',
        false
    );
});

// Sign out: POST /logout is the live route for it (listed in
// https://api.rongrongwu.com/openapi.json). Checked live with curl: it answers 200
// {"message": "Admin logged out"} and a set-cookie that empties session_id with
// Max-Age=0, so the session every other page leans on is gone by the time the answer
// arrives — which is why the browser is handed back to the front door, where the
// sign-in card is, once the sentence has been read.
const LOGOUT_URL = 'https://api.rongrongwu.com/logout';

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



// The usernames GET /getuser lists for `admin`, sorted and de-duplicated. The
// ?supervisor= filter is exact — checked live: ?supervisor=test-account answers that
// admin's three accounts while ?supervisor=nonsense answers [] — and each row's own
// supervisor field is read again here, so only this admin's students can reach the
// table on students.html, the same rule the transaction flow follows.
async function adminStudents(admin) {
    const response = await fetch(`${STUDENTS_URL}?${new URLSearchParams({ supervisor: admin })}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    const names = new Set();

    for (const row of studentRows(await response.json())) {
        if (row.name && row.supervisor === admin) {
            names.add(row.name);
        }
    }

    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// Every account a GET /getuser payload carries, as { name, supervisor } with the
// surrounding space trimmed off. The route is untyped, so the shapes accepted mirror
// the readers in studentpicker.js and sessionstorage.js:
//   [{"name": "X", "supervisor": "Y"}]                         -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}   -> the inner list
//   {"name": "X", "supervisor": "Y"} / "X"                     -> wrapped in an array
//   null / undefined / ""                                      -> []
// A bare string names an account with no supervisor, so it can belong to no admin and
// is dropped by the supervisor check above.
function studentRows(payload) {
    return studentEntries(payload).map((entry) => ({
        name: String(firstField(entry, STUDENT_NAME_KEYS) ?? entry ?? '').trim(),
        supervisor: String(firstField(entry, STUDENT_SUPERVISOR_KEYS) ?? '').trim()
    }));
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
const REASONS_URL = 'https://api.rongrongwu.com/reasons';

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

// Where an approved transaction is written: POST /transaction-record takes the whole
// object as JSON (openapi.json: TransactionRecord wants student, type, slug and
// reason, and accepts amount, date and memo as well).
const RECORD_URL = 'https://api.rongrongwu.com/transaction-record';

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
const ADMIN_CHECK_URL = 'https://api.rongrongwu.com/adduser';

// The student this transaction is for, stored by transaction1.html. Kept in sync
// with STUDENT_USERNAME_KEY in sessionstorage.js.
const STUDENT_KEY = 'student_username';

// Where an approved-but-unsent transaction waits for the step that will POST it.
const PENDING_KEY = 'pending_transaction';

const reasonSelect = document.getElementById('reason');
const reasonResults = document.getElementById('reasonresults');
const reasonNext = document.getElementById('reasonnext');

// Which reason list this page wants: the type comes from the page itself in the
// table's own spelling, and the slug is read out of it right here, so no page has to
// know a URL and no hand-written slug can drift away from the type column.
const reasonType = reasonSelect?.dataset.reasonType?.trim() ?? '';
const reasonSlug = reasonSlugFromType(reasonType);

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
const CONFIRM_QUESTION = 'confirm transaction, Y/N';

let confirmDialog = null;   // the overlay, built the first time anything is approved
let confirmText = null;     // the sentence inside it: what is about to be written
let confirmYes = null;      // the Y button, where the focus lands
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
    question.textContent = CONFIRM_QUESTION;

    const text = document.createElement('p');
    text.className = 'confirm__text';
    text.id = 'confirmtext';

    const actions = document.createElement('div');
    actions.className = 'confirm__actions';

    confirmYes = confirmButton('Y', 'btn--primary', true);
    actions.append(confirmYes, confirmButton('N', 'btn--ghost', false));

    panel.append(question, text, actions);
    dialog.append(panel);
    document.body.append(dialog);

    // Y and N work as keys too — the question says so — and Escape is the same
    // answer as N, so the question can always be dismissed without a mouse. The
    // listener lives on the document because the buttons are the only things inside
    // the overlay and the keyboard may be anywhere.
    document.addEventListener('keydown', function (event) {
        if (dialog.hidden) return;

        const key = event.key.toLowerCase();

        if (key === 'y') {
            answerConfirmation(true);
        } else if (key === 'n' || key === 'escape') {
            answerConfirmation(false);
        }
    });

    confirmDialog = dialog;
    confirmText = text;
}

// What the dialog says: the same facts the status line names after a recording, so
// the admin sees the student, the reason, the amount and - when there is one, which
// is the Other page's memo - their own note before answering.
function describeTransaction(transaction) {
    const forStudent = transaction.student ? ` for ${transaction.student}` : '';
    const amount = transaction.amount === null || transaction.amount === undefined
        ? 'no amount'
        : `amount ${transaction.amount}`;
    const memo = transaction.memo ? ` Memo: "${transaction.memo}".` : '';

    return `${transaction.type} — "${transaction.label}"${forStudent}, ${amount}.${memo} Y writes it to the account, N drops it.`;
}

// Puts the question on screen and answers true for Y, false for N. A question
// already up is the question that has to be answered, so a second call shares it
// instead of stacking another one on top.
function askConfirmation(transaction) {
    if (confirmPending) {
        return confirmPending.promise;
    }

    if (!confirmDialog) {
        buildConfirmDialog();
    }

    confirmText.textContent = describeTransaction(transaction);
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

    // The keyboard goes back to the flow's own button — the reason pages' Next or the
    // Other page's — rather than being dropped on the body, so the admin can carry on
    // without reaching for the mouse.
    (reasonNext ?? otherNext)?.focus();

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

    setApproveEnabled(false);
    const check = await checkAdminPermission();

    if (!check.granted) {
        showReasonMessage(check.text, true);
        return;
    }

    setApproveEnabled(true);

    const option = reasonSelect.selectedOptions?.[0];

    // The table columns, spelled the way the table spells them: type is the page's
    // data-reason-type (the type column value), slug is that same value as a URL, and
    // reason is the option's value, which is the reason column text the backend sent.
    // amount is the figure that goes with that reason, negative for the two types that
    // spend money, null when the reason carries no figure at all (the built-in fallback
    // list of a page). label is only what the eye saw.
    const transaction = {
        student: sessionStorage.getItem(STUDENT_KEY) || '',
        type: reasonType,
        slug: reasonSlug,
        reason: reasonSelect.value,
        amount: optionAmount(option),
        label: option ? option.textContent : reasonSelect.value
    };

    // The approved choice is parked next to the student username transaction1.html
    // stored, and it is parked before anything is sent: the object kept in
    // sessionStorage is the same one the request carries, so a send that fails loses
    // nothing.
    const forStudent = transaction.student ? ` for ${transaction.student}` : '';

    // The Y/N question stands between the choice and the write: "confirm transaction,
    // Y/N". It is asked about the very object the request will carry, and nothing is
    // parked or posted until it is answered with Y, so a wrong student or a wrong
    // reason cannot leave this page. N (the N button, the N key or Escape) drops the
    // whole thing, and Next stays live so the same click can be tried again.
    const confirmed = await askConfirmation(transaction);

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

// The write itself, shared by the reason pages and the Other page: the approved
// object is parked in sessionStorage next to the student username transaction1.html
// stored - parked before anything is sent, so a send that fails loses nothing - and
// then POSTed as a whole, as JSON, with the table columns (type, reason) in the
// backend's own spelling and the admin session cookie travelling with the request.
// Answers { ok: true } once the backend has written it, and { ok: false, text } with
// the sentence to show when it refused or the network was gone.
async function sendTransaction(transaction) {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(transaction));
    console.log('Approved:', transaction);

    try {
        const response = await fetch(RECORD_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
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
            text: `Nothing was recorded — the backend refused the transaction (${response.status}): ${describeError(result)}`
        };
    } catch (error) {
        console.error('Network Error:', error);
        return {
            ok: false,
            text: 'Network error — the transaction could not reach the API, so nothing was recorded.'
        };
    }
}

// The sentence both approving pages show once the backend has written it.
function recordedMessage(transaction) {
    const forStudent = transaction.student ? ` for ${transaction.student}` : '';

    return `Recorded "${transaction.label}"${forStudent} — the backend wrote the ${transaction.type} transaction. Taking you to the home page…`;
}

// Choosing another reason is a different transaction, so it brings back the Next
// button that a recorded or refused one left grey.
reasonSelect?.addEventListener('change', function () {
    if (reasonSelect.value) {
        setApproveEnabled(true);
    }
});

reasonNext?.addEventListener('click', approveReason);

// The page starts itself: ask the backend for admin powers, fill the dropdown,
// then say on the one status line what happened.
openReasonPage();

// Other transaction page -------------------------------------------------------
// transaction-other.html is the type that is not one of the lists: the admin types the
// amount, the broad reason and the memo themselves, because the thing being recorded
// has no row in the reasons table. It took the salary page's place, and that list is
// still paid out in one go by jobrotation.js through /pay-salaries. Nothing is fetched
// to fill this form - there is no list to fetch, and the boxes are the whole of it.
//
// The object it writes is the one the reason pages write, with the two free-text fields
// the route accepts as well (openapi.json: TransactionRecord asks for student, type,
// slug and reason, and takes amount, date and memo on top of them). Nothing about the
// amount is signed here, unlike the reason pages: the admin's sign is their own, so a
// minus in the box takes points away and a plain number gives them.
const otherForm = document.getElementById('otherform');
const otherAmount = document.getElementById('otheramount');
const otherReason = document.getElementById('otherreason');
const otherMemo = document.getElementById('othermemo');
const otherNext = document.getElementById('othernext');
const otherResults = document.getElementById('otherresults');

// The type column value this page records under, and the slug the reason pages would
// have built out of it: "OTHERS" -> "others". The route takes the type as it comes -
// checked live, POST /transaction-record with type "OTHERS" answered
// {"message": "Transaction saved"} - so this page owns its own value, and the two lines
// below are all that has to change if the sheet ever spells the type differently.
const OTHER_TYPE = 'OTHERS';
const OTHER_SLUG = reasonSlugFromType(OTHER_TYPE);

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

// The memo as it should be sent: the box's own text, or null when it was left empty.
// The route takes a null memo, and an empty box is not a note.
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
    // names the student transaction1.html confirmed along with the invitation.
    const student = sessionStorage.getItem(STUDENT_KEY) || '';
    const nextStep = check.granted
        ? ` Type the amount, the broad reason and, if it is worth remembering, a memo for ${student}, then press Next.`
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
        showOtherMessage('Type the broad reason before approving — it is the reason column the transaction is written under.', true);
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

    setOtherEnabled(false);
    const check = await checkAdminPermission();

    if (!check.granted) {
        showOtherMessage(check.text, true);
        return;
    }

    setOtherEnabled(true);

    // The same columns the reason pages write, with the reason and the memo typed in
    // instead of picked: type is this page's own value, slug is that value as a URL,
    // reason is the broad reason, and amount and memo are what the two boxes hold.
    // label is only what the eye saw, so the question and the status line name the
    // transaction exactly as it is about to be written.
    const transaction = {
        student: sessionStorage.getItem(STUDENT_KEY) || '',
        type: OTHER_TYPE,
        slug: OTHER_SLUG,
        reason: reason,
        amount: amount,
        memo: otherMemoValue(),
        label: reason
    };

    const confirmed = await askConfirmation(transaction);

    if (!confirmed) {
        const forStudent = transaction.student ? ` for ${transaction.student}` : '';
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

