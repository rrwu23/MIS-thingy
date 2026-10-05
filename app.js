console.log(document.getElementById("getusersform"));
console.log("loaded")

// 1. Select the form
const form = document.getElementById('adduserform');

// Input: first, second — the two usernames as typed on the add account page (addaccount.html),
//   where the second box asks for the first one back.
// Output: true when the two name the same account, false otherwise.
// Action: trims the space around both and compares them lower-cased — an exact compare apart
//   from space, which is how an account's name is looked up.
// Role: the add account page's safety check, read by the form handler below: the account is
//   only created when both fields agree, so a slip of the finger cannot quietly make an
//   account nobody can find. The comparison is the same one the transaction flow makes between
//   a typed username and the listed ones (matchingStudentName in sessionstorage.js).
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
//
// The month is 01 through 12 and the day 01 through 31, each of them two digits with its
// leading zero, so a value that is only date-shaped — month 00 or 13, day 00 or 32 — is
// refused instead of stored. What the two ranges cannot catch is a day the month does not
// have: 2026-02-30 or 2026-04-31 still read as a date here, the pattern being a bound on
// the shape of a value and not a calendar.
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Input: value — the text a date field holds, as typed or as the browser's own date control
//   answered it (addaccount.html's birthday box).
// Output: true for a value in ISO_DATE's shape — YYYY-MM-DD, month 01-12, day 01-31 — and
//   false for anything else, a date-shaped value with a month or a day out of range included.
// Action: tests the value against the ISO_DATE pattern and does nothing else; the pattern is a
//   bound on the shape of a value and not a calendar, so 2026-02-30 still reads as a date.
// Role: the birthday check of the add account flow below, and the one reader of ISO_DATE, so
//   the bounds that pattern carries are applied in a single place.
function isISODate(value) {
    return ISO_DATE.test(value);
}

// The birthday field, on the one page that has it (app.js is loaded by every page). It is
// left as the page writes it — required, type="date", no newest day — and the check below
// still decides on submit, in case the page is driven by script instead of by a click.
const birthdayField = form?.elements.namedItem('birthday');

// Input: the submit event of the add account form (addaccount.html), fired by its button or by
//   Enter in one of its boxes; the fields themselves are read off `form`.
// Output: none — an alert and the console say what happened, and once the account exists the
//   browser is sent to the home page (redirectHomeAfter).
// Action: stops the browser's own submit, checks the retyped username (sameUsername) and the
//   birthday (isISODate) before anything leaves, then POSTs name, birthday, initialbalance and
//   password to /adduser with the admin session cookie.
// Role: the add account flow — the one place a student's account is created in this project;
//   every later page reads what it wrote (the students table behind "View students" among
//   them), and its refusals are said the way this first form has always said them.
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

// Input: the submit event of the query accounts form (getusers.html), fired by its Search
//   button; the two filter boxes (name, supervisor) are read off the form.
// Output: none — one account card per matching account is drawn in the results block, or a
//   single sentence saying what happened.
// Action: stops the browser's submit, greys the button for the round trip, GETs
//   /getuser?name=&supervisor= with the session cookie (a blank field travelling as "no
//   filter"), and hands every account it was answered with to accountCard().
// Role: the query accounts flow — the read half of the account pages, asking the same route the
//   students table and the picker read, and printing every field of every row but the password.
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

// Input: account — one row of a GET /getuser reply as the backend sent it: an object of
//   account fields, or, where the route answered with something else, any value at all.
// Output: a <p> element holding one "Field: value" line per field the account carries, in the
//   backend's own order — or the bare value where the answer was not an object.
// Action: walks the account's own keys, skips the ones hiddenAccountField() keeps off the page,
//   and appends accountField() for each of the rest.
// Role: how the query accounts page (getusers.html) draws each account its search was answered
//   with, inside the results block that handler fills. No field is named here by hand, so a
//   field the backend starts sending later is listed too — the password being the one
//   deliberate exception (ACCOUNT_HIDDEN_FIELDS).
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

// Input: key — one field name of an account object, as the backend spelled it.
// Output: true for a field the query keeps off the page, false for every other name.
// Action: lower-cases and trims the name, then asks whether ACCOUNT_HIDDEN_FIELDS holds it, so
//   "Password" or " password " cannot slip past the one entry.
// Role: the one gate between a GET /getuser answer and the page — it is what keeps a student's
//   real login secret out of a public reply (see ACCOUNT_HIDDEN_FIELDS above), and it is read
//   by accountCard() alone.
function hiddenAccountField(key) {
    return ACCOUNT_HIDDEN_FIELDS.includes(String(key).trim().toLowerCase());
}

// Input: key and value — one field of an account object, as the backend sent them.
// Output: a <span class="results__field"> holding the label, its colon and the value as text.
// Action: builds the label with accountFieldLabel(), the value with accountFieldValue(), and
//   puts them in one node — no innerHTML anywhere, because the words are the backend's.
// Role: one line of the card accountCard() draws on the query accounts page, kept apart so the
//   label and the value can each have a rule of their own in styles.css.
function accountField(key, value) {
    const line = document.createElement('span');
    line.className = 'results__field';

    const label = document.createElement('span');
    label.className = 'results__field-label';
    label.textContent = `${accountFieldLabel(key)}: `;

    line.append(label, document.createTextNode(accountFieldValue(value)));

    return line;
}

// Input: key — a field name as the backend spelled it ("initialbalance", "opening_balance").
// Output: the same name as a person reads it — "Initialbalance", "Opening balance" — or
//   "Field" when nothing readable is left of it.
// Action: turns every run of underscores and hyphens into a space, trims what is left, and
//   capitalises its first letter.
// Role: the label half of one account-card line on the query accounts page. It reads the
//   backend's own spelling rather than a table of names kept here by hand, so a field the
//   backend renames or adds still reads as words.
function accountFieldLabel(key) {
    const words = String(key).replace(/[_-]+/g, ' ').trim();

    return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Field';
}

// Input: value — one field of an account object, whatever the backend put there.
// Output: the value as text: text, numbers and booleans as themselves, '' for null and
//   undefined, and JSON for anything structured.
// Action: returns early for a missing value and JSON.stringify()s whatever is an object — the
//   only honest way to show a nested object or a list on one line.
// Role: the value half of one account-card line on the query accounts page, so nothing the
//   backend sends there is ever printed as "[object Object]".
function accountFieldValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// Input: results — the block to write into (each page's own, e.g. #results on getusers.html);
//   text, the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a block that is not on the page is left alone.
// Role: the status line of the account pages (add account, add admin, query accounts) — the same
//   one-paragraph card showLoginMessage, showHomeMessage and showReasonMessage write into their
//   own blocks, so an error is the red variant of the same card wherever it is shown.
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

// Input: the submit event of the add admin form (add_admin.html), fired by its button or by
//   Enter in one of its boxes; admin_name, password and retype_password are read off the form.
// Output: none — a sentence under the form (and an alert) says what came of it, and a created
//   admin sends the browser on to the home page.
// Action: stops the browser's submit, refuses the request itself when the two passwords differ,
//   drops retype_password, greys the button, POSTs admin_name + password to /add-admin with the
//   session cookie, and puts the button back on every path that created nothing.
// Role: the admin signup behind the home page's "Add admin" door — the second half of the login
//   story, whose answers the admin login above then uses.
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

// Input: delayMs — how long the sentence just written should stay up (the flows pass
//   REDIRECT_DELAY_MS); url — where the browser belongs once it is up, HOME_URL unless the caller
//   says otherwise (the student flow passes FLOW_HOME_URL, which is the student's own hub there).
// Output: none — the browser is sent to url once the delay is up.
// Action: sets a timer that assigns window.location.href = url.
// Role: the shared last step of every flow that finishes on a hub — add account, add admin, both
//   sign-ins, a written or submitted transaction and a sign-out: the sentence that says what just
//   happened is given its moment before the page it stands on is left behind.
function redirectHomeAfter(delayMs, url = HOME_URL) {
    // Input: none — the timer fires delayMs after the sentence was written.
    // Output: none — the browser is sent to the url the caller named.
    // Action: assigns window.location.href = url.
    // Role: the delay redirectHomeAfter() exists for — the sentence that says what just happened
    //   is read before the page it stands on is left behind.
    window.setTimeout(function () {
        window.location.href = url;
    }, delayMs);
}

const loginForm = document.getElementById('loginadminform');

// Input: the submit event of the admin login form (login_admin.html), fired by its button or by
//   Enter in one of its two boxes; admin_name and password are the form's whole body.
// Output: none — the status line under the form says what the backend answered, and a session
//   won sends the browser on to the home page.
// Action: stops the browser's submit, POSTs the form as it stands to /login with the session
//   cookie, and hands the reply to showLoginMessage() and describeError().
// Role: the admin login behind login_admin.html — the same POST /login the landing card's admin
//   door makes; it is this request that stores the session cookie every other page leans on.
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

// Input: results — the block to write into (each sign-in page's own, e.g. #loginresults);
//   text, the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a block that is not on the page is left alone.
// Role: the status line of the three sign-ins in this file (the admin login, the landing card's
//   admin door and its student door), the same one-paragraph shape the other show*Message
//   writers use, so a refusal and a welcome look alike wherever they are said.
function showLoginMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// Input: result — the parsed body of a failed API answer, as FastAPI writes it: {"detail":
//   "..."} or {"detail": [{"msg": "...", ...}]} — or anything else at all, a refusal never being
//   trusted to parse.
// Output: the backend's own words for the refusal: its detail string, the msg of each entry of a
//   detail list joined with "; ", or the fallback sentence when the body carries neither.
// Action: reads result.detail, preferring the string form and falling back to the messages of a
//   list.
// Role: the one place an API refusal is turned into words — every status line and log line in
//   this file reads it, so a 401, a 404 and a 422 are all reported in the backend's spelling
//   rather than in a wording invented here.
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

// Input: the submit event of the landing card's sign-in form (index.html), fired by its button
//   or by Enter in one of the two boxes; the boxes are read as the admin's name and password.
// Output: none — the line under the card names the admin who was signed in and carries the way
//   on to the home page; a refusal is said on the same line.
// Action: stops the browser's submit, greys the button for the round trip, POSTs the form to
//   /login with the session cookie, and puts the answer on the status line — homePageLink()
//   appended to it when the sign-in went through.
// Role: the admin door of the front door — the very same POST /login login_admin.html asks,
//   entered on the card the admin is already looking at. Nothing is redirected, because the
//   session lives in the backend's cookie and not in a page.
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

// Input: result — the parsed body of a POST /student-login answer, whatever shape it arrived
//   in: an object of strings, a bare string, a list, or nothing at all.
// Output: the student's name, trimmed, or null when the reply names nobody.
// Action: asks STUDENT_LOGIN_NAME_KEYS in turn and answers with the first field that holds
//   anything, written as a string.
// Role: the read of the student's own login reply — what the student's hub and their history
//   page are keyed by once the sign-in above stores it. It is the student's counterpart of the
//   admin name reads (currentAdminNameIn, describeCurrentAdmin), and is kept apart from
//   STUDENT_NAME_KEYS below, which reads an account object rather than a login reply.
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

// Input: the click on the landing card's student door (#studentsignin); the card's two boxes
//   are read off signInForm and sent as the student's own username and password.
// Output: none — the line under the card names the student who was signed in and carries the
//   way on to that student's hub; a refusal is said on the same line.
// Action: has the browser check the two boxes first (a plain button is not a submit), POSTs
//   student_name + password to /student-login with the session cookie, keeps the name the
//   backend answered with (or the one that was typed) in sessionStorage under
//   SIGNED_IN_STUDENT_KEY, and appends studentHomePageLink() to the status line.
// Role: the student door of the front door — the student's own login beside the admin's on the
//   one card; what it stores is what the student's own pages then read.
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

// Input: none.
// Output: an <a> to STUDENT_HOME_URL worded as the way on ("Continue to the student home page
//   →").
// Action: builds the link node; nothing is fetched and nothing is written.
// Role: the way on from the student door of the landing card, appended to the status line by
//   the student sign-in above — the student's mirror of homePageLink() below.
function studentHomePageLink() {
    const link = document.createElement('a');
    link.href = STUDENT_HOME_URL;
    link.textContent = 'Continue to the student home page \u2192';
    return link;
}

// Input: none.
// Output: an <a> to HOME_URL worded as the way on ("Continue to the home page →").
// Action: builds the link node; nothing is fetched and nothing is written.
// Role: the way on from the front door — the sign-in lines under both of the card's doors append
//   it, because index.html itself is only the card: the buttons, and the doors behind them, are
//   on the home page.
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

// Input: none — it reads the page's own #homeadminname element and the session cookie.
// Output: none — the greeting element is filled with the admin's name, or the status line under
//   the doors says why it could not be.
// Action: GETs /current-admin with the session cookie, writes into the greeting the name
//   currentAdminNameIn() reads out of the reply, and otherwise reports the answer on the status
//   line — a reply naming nobody, a refused session, or an unreachable API — appending
//   signInPageLink() when the missing session is the trouble.
// Role: the home page's own read, started by the boot at the foot of this section: it is what
//   turns the greeting's dots into the name of the admin this browser is signed in as.
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

// Input: none.
// Output: an <a> to SIGN_IN_URL worded as the way back ("Go to the sign-in card →").
// Action: builds the link node; nothing is fetched and nothing is written.
// Role: the way back to the front door for the hub's status line — the mirror of homePageLink()
//   above, which carries the way the other way, and of studentHomePageLink() before it.
function signInPageLink() {
    const link = document.createElement('a');
    link.href = SIGN_IN_URL;
    link.textContent = 'Go to the sign-in card \u2192';
    return link;
}

// Input: results — the block to write into (the hub's #homestatus); text, the sentence to show;
//   isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a block that is not on the page is left alone.
// Role: the status line under the home page's doors — the same one-paragraph shape
//   showLoginMessage and showAccountMessage write into their own blocks — where a greeting that
//   could name nobody and a Sign out that did not go through are both said.
function showHomeMessage(results, text, isError) {
    if (!results) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    results.replaceChildren(paragraph);
}

// Input: payload — the parsed body of a GET /current-admin answer: an object of strings whose
//   fields openapi.json does not name, or anything else the route answered with.
// Output: one sentence for the status line, naming the admin whenever the reply carried a name
//   — "Signed in as alice." — and saying "the reply names no admin" when it did not.
// Action: reads the name through ADMIN_NAME_KEYS and, when the reply holds other fields beside
//   it, names those too; a bare string is a name, a list is one sentence per entry, and {}
//   / null / a number all say the session was accepted but nobody was named. The shapes the
//   route has answered with so far:
//   {"admin_name": "alice"}                     -> "Signed in as alice."
//   {"name": "alice"} / {"admin": …} / {"username": …}  -> the same
//   {"admin_name": "alice", "bank": "Bonura's"} -> the name, then the extra fields
//   "alice"                                     -> "Signed in as alice."
//   [{"admin_name": "alice"}]                   -> one sentence per entry
//   {} / null / a bare number                   -> the session was accepted, but
//                                                  the reply names nobody
// Role: what the hub says when the session was accepted but no name could be written into the
//   greeting itself (refreshHomeGreeting) — the sentence half of that read, where
//   currentAdminNameIn() below is the name half.
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

// Input: none — it reads the page's own table elements (rosterRows, rosterStatus, rosterStamp)
//   and the session cookie.
// Output: none — the table is drawn (or hidden), and the status line above it and the clock
//   beside Refresh say what came back.
// Action: GETs /current-admin for the signed-in admin, then that admin's students
//   (adminStudents), then every student's balance (one request each, all at once) and the
//   job-salaries list when a job still needs pricing; ranks the rows, draws them, and says in
//   words how many there are, how many share a balance, and what could not be read. One read at
//   a time: rosterReadRunning turns a second one away while the first is still on its way.
// Role: the students page's own read (students.html, behind the hub's "View students" door) —
//   the four live routes listed at the head of this section are all asked from here, and
//   anything that is not a table is spelled out on the status line rather than thrown.
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

// Input: rows — the table's rows as adminStudents() and the balance reads left them, each
//   { name, job, salary, balance } with a real balance on it.
// Output: the same array, ranked from the smallest balance to the largest.
// Action: sorts by the balance as a figure, not as text, so -10 is ranked below 9 rather than
//   after it, which is what comparing the two as strings would say (the '-' sorts before the
//   digits) — the same reading the figure is given in its own cell (drawRosterTable).
// Role: the ranking of the students table, the ladder from the student who owes the most down
//   to nothing and up to the biggest holder on the page. The sort is stable and the rows arrive
//   in name order (adminStudents sorts by name), so a name only ever breaks a balance two
//   students share; the rows handed in are the ones a balance was read for, so nothing is ever
//   ranked on a figure nobody read.
function rankRosterRows(rows) {
    rows.sort((a, b) => a.balance - b.balance);
    return rows;
}

// Input: rows — the ranked rows of refreshRoster(), each { name, job, salary, balance }.
// Output: none — #rosterrows is emptied and given one <tr> per row, the frame around them is
//   shown, and the count is logged for the record.
// Action: builds the four cells of every row as nodes — the balance in the red it wears when it
//   is below zero, and a dash (ROSTER_EMPTY_CELL) for a job or a salary the backend had nothing
//   for — then swaps them in with replaceChildren() and unhides the frame.
// Role: how the students table draws what refreshRoster() read: one row per student in the four
//   columns the sketch names — the name, the balance, the job and the salary that job pays.
//   Every cell is built as a node rather than with innerHTML, because the words are the
//   backend's.
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

// Input: none.
// Output: none — the table's rows are dropped and the frame they stand in is hidden.
// Action: hides #rosterframe and empties #rosterrows; a page without them is left alone.
// Role: what every failed or empty read of the students table does before it says so on the
//   status line: a read that failed or came back empty must not leave the table of the read
//   before standing as if it were current.
function clearRosterTable() {
    if (rosterFrame) {
        rosterFrame.hidden = true;
    }

    rosterRows?.replaceChildren();
}

// Input: none.
// Output: none — #rosterstamp is given the clock reading of the read that has just finished.
// Action: writes "Last read at <local time>" into the element; a page without it is left alone.
// Role: the small print beside the students table's Refresh button, saying how fresh the table
//   is. It stands outside the live region, so a clock written there on every read is not read
//   out to a screen reader.
function stampRoster() {
    if (!rosterStamp) return;

    rosterStamp.textContent = `Last read at ${new Date().toLocaleTimeString()}.`;
}

// Input: results — the block to write into (the students page's #rosterstatus); text, the
//   sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a block that is not on the page is left alone.
// Role: the line above the students table, where every count, every figure that could not be
//   read and every refusal of that read is said — the same one-paragraph shape the other
//   show*Message writers use, so an error is the red variant of the same panel.
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

// Input: the visibilitychange event of the document — this tab coming back to the front.
// Output: none.
// Action: reads the students again whenever the tab stops being hidden.
// Role: the third way the students table reads itself, beside the first read as the page opens
//   and the Refresh button — a balance changed in another tab turns up here when this tab comes
//   back to the front.
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

// Input: student — the name as typed in remove.html's box (already trimmed by the submit
//   handler).
// Output: the sentence the Y/N question shows under its heading, naming the student and what
//   each answer does.
// Action: builds that one sentence; nothing is read and nothing is sent.
// Role: the body of the removal question — the shape the transaction question is written in,
//   with a student in place of a row. The name is the whole of what a removal is aimed at, so
//   it is read back exactly as it was typed, for the admin to read once more.
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

// Input: student — the name as typed in remove.html's box (already trimmed).
// Output: the request body { student } — the one field POST /remove-student declares.
// Action: wraps the name in an object and nothing more.
// Role: the body half of a removal, kept apart so the shape the route is written with is stated
//   in one place — the same "only what the route declares" rule transactionBody() keeps to on
//   the transaction pages.
function removalBody(student) {
    return { student };
}

// Input: result — the parsed body of a POST /remove-student answer, whatever it carried.
// Output: the number of accounts the backend says it took away, or null when its answer does
//   not say with a number.
// Action: reads result.deleted and answers it only when it is a number.
// Role: the one figure a removal is judged by (sendRemoval): 200 on its own means no such thing
//   here, because a name that is on no account is answered 200 too, so no sentence may claim a
//   removal on the strength of the status alone.
function removedCountIn(result) {
    const deleted = result?.deleted;

    return typeof deleted === 'number' ? deleted : null;
}

// Input: student — the name that was sent; count — the number of accounts the backend answered
//   that it took away (one or more).
// Output: the sentence remove.html shows once the removal went through.
// Action: picks between the one-account sentence and the many-accounts one, naming the count in
//   the latter.
// Role: what answering Yes is met with on the remove page. The count is read back as well as
//   the name, because a name is not a key: an account that was made twice is taken away twice
//   by the one request, and a removal that said "one" while it took two would be a half-honest
//   sentence.
function removedMessage(student, count) {
    if (count === 1) {
        return `Removed — “${student}” is gone. The account was deleted from the backend.`;
    }

    return `Removed — ${count} accounts named “${student}” were deleted from the backend.`;
}

// Input: student — the name that was sent and matched no account.
// Output: the sentence remove.html shows for that answer.
// Action: builds that one sentence; it asks the backend for nothing.
// Role: the other half of the Yes answer — the backend said 200 but took nothing away, so the
//   removal was a no-op and every list is as it was. It is shown as an error, the admin having
//   asked for something that did not happen, but nothing is wrong with the backend: the name is
//   left in the box to be looked at again, and the dropdown under it is the way to a spelling
//   the backend does know.
function removalNotFoundMessage(student) {
    return `Nothing was removed — the backend knows no student named “${student}”, so nothing was deleted. Check the spelling, or pick the account from the dropdown.`;
}

// Input: student — the name to take away, as typed and trimmed, confirmed with Yes.
// Output: one answer either way: { ok: true, count } once the backend has taken the account
//   away, { ok: false, text } with the sentence to show when it took nothing away, refused, or
//   could not be reached.
// Action: POSTs removalBody(student) as JSON to /remove-student with the admin session cookie,
//   reads the body once (a refusal is never trusted to parse), and judges the answer by
//   removedCountIn() rather than by the status.
// Role: the write half of the remove flow — the same shape sendTransaction() and the sign-out
//   use, and the only call to the one route that takes a student away.
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

// Input: text — the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a page without the block is left alone.
// Role: the status line of the remove page (remove.html), the one place a removal's outcome, a
//   missing session and a missing name are all said — the same one-paragraph shape
//   showHomeMessage, showReasonMessage and showOtherMessage write into their own blocks.
function showRemoveMessage(text, isError) {
    if (!removeResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    removeResults.replaceChildren(paragraph);
}

// Input: enabled — true to make the remove button live, false to grey it out.
// Output: none — the button's aria-disabled attribute is set or cleared.
// Action: adds or removes that one attribute; a page without the button is left alone.
// Role: the remove button's own switch, thrown by the page opener, the submit handler and the
//   session re-check — the same attribute styles.css styles for .btn, the state the reasons'
//   Next buttons and the Other page's wear while the backend is being asked.
function setRemoveEnabled(enabled) {
    if (!removeButton) return;

    if (enabled) {
        removeButton.removeAttribute('aria-disabled');
    } else {
        removeButton.setAttribute('aria-disabled', 'true');
    }
}

// Input: none — it reads remove.html's own form, name box and button, and the session cookie.
// Output: none — the remove button is left live or grey, and the status line under the form
//   says what the probe answered, with the invitation to type a name when it was accepted.
// Action: greys the button, asks checkAdminPermission() — the empty-body POST /adduser probe
//   ADMIN_CHECK_URL is read for — and un-greys it only on a granted session.
// Role: the remove page's boot, which the last line of this file's shared startup calls (see
//   the note at that call): a removal is only ever aimed at the students of the admin that is
//   signed in, so nothing is removed, and the question is not even put up, while that session
//   has not been confirmed.
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

// Input: the submit event of the remove form (remove.html), fired by its button or by Enter in
//   the name box; the name itself is read off #removestudentname.
// Output: none — the sentence under the form says what came of it (nothing sent, nothing
//   confirmed, nothing removed, or removed), and after a removal the box is emptied and
//   refocused for the next student.
// Action: stops the browser's submit, refuses an empty box by pointing it out, re-asks the
//   backend for admin powers (a session can expire while the page stands), puts the Y/N
//   question up (describeRemoval, answered with Yes/No), and only on Yes sends the name
//   (sendRemoval); the picker's own account list is re-read when a student has gone.
// Role: the remove flow — the one question in the app that cannot be undone, behind the hub's
//   "Remove student" door, and the only caller of sendRemoval().
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

// Input: the click on the hub's Sign out door; nothing else is read.
// Output: none — the status line under the doors says what came of it, and a sign-out that went
//   through hands the browser back to the sign-in card.
// Action: greys the button for the round trip, POSTs /logout with the session cookie, and on a
//   200 sends the browser to SIGN_IN_URL once the sentence has had its moment; a refusal or a
//   dead network puts the button back and says so.
// Role: the last door of the home page — the end of the session every other page leans on
//   (POST /logout empties session_id with Max-Age=0), which is why the browser is handed back
//   to the front door rather than left on a page that has just lost its session.
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
            // Input: none — the timer fires REDIRECT_DELAY_MS after the sign-out was answered.
            // Output: none — the browser is sent back to the sign-in card.
            // Action: assigns window.location.href = SIGN_IN_URL.
            // Role: the delay that lets the "Signed out…" sentence be read before the front door
            //   replaces the page it stands on.
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

// Input: payload — the parsed body of a GET /current-admin answer: an object of strings, a
//   bare string, or anything else.
// Output: the admin's name as text, trimmed, or '' when the reply names nobody.
// Action: answers a plain string as itself and otherwise asks ADMIN_NAME_KEYS in turn, taking
//   the first field that is a non-empty string; anything else is ''.
// Role: the name half of the current-admin read — the students table, the hub's greeting and
//   the query page's supervisor prefill need the name itself, where describeCurrentAdmin() above
//   builds the sentence the status lines show.
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

// Input: none — it reads the query page's own Supervisor field (getUsersSupervisorField) and
//   the session cookie.
// Output: none — the field is filled with the signed-in admin's own name, or left as it was.
// Action: GETs /current-admin and, when the answer names an admin and the field is still empty,
//   writes that name into it; a 401, a nameless reply and a dead network all leave the field
//   alone, said only in the console.
// Role: a convenience of the query accounts page — GET /getuser compares ?supervisor= exactly
//   and case-sensitively, so the page opens on this admin's own accounts in the backend's own
//   spelling. Nothing on the page waits for it: the search runs the same whether the field was
//   filled in or left blank, and the whole table is still one Clear away.
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



// Input: admin — the supervisor name to list students for (the signed-in admin, as
//   currentAdminNameIn() read it).
// Output: an array of { name, job, salary }, sorted by name and de-duplicated by name.
// Action: GETs /getuser?supervisor=<admin> with the session cookie and walks the reply
//   (studentRows): each row keeps its own name, the job the account carries ('' when it carries
//   none, which is every account until a job is rotated onto it) and the figure sent with the
//   account (null otherwise, which is the salaries list's to fill in). Each row's own supervisor
//   field is read again here, so only students of this admin are kept, and the first row of a
//   name the backend lists twice is the one that stands.
// Role: the read of the students page's list — the exact, case-sensitive ?supervisor= filter the
//   transaction flow also uses (checked live: ?supervisor=teacher answers that admin's own
//   account while ?supervisor=lagoon answers []). The name order arranged here is also the
//   table's tie-break, so the sort has to stay here for it to hold: rankRosterRows() ranks by
//   balance afterwards and its own sort is stable.
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

// Input: payload — the parsed body of a GET /getuser answer, in any of the shapes that route
//   has been answered with.
// Output: an array of { name, supervisor, job, salary }, every string trimmed and the salary a
//   number or null.
// Action: has studentEntries() find the list, then reads each row through the STUDENT_*_KEYS
//   field names, taking the job and its figure off the same row the name comes from.
// Role: the shape-normalising read under the students table and the student picker. The route is
//   untyped, so the shapes accepted mirror the readers in studentpicker.js and sessionstorage.js:
//   [{"name": "X", "supervisor": "Y"}]                         -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}   -> the inner list
//   {"name": "X", "supervisor": "Y"} / "X"                     -> wrapped in an array
//   null / undefined / ""                                      -> []
//   The job travels on the student's own account — it is what POST /set-jobs writes there — so a
//   job the account does not carry is '' rather than a guess, and a figure sent with the account
//   is taken as that job's salary. A bare string names an account with no supervisor and no job,
//   so it can belong to no admin and is dropped by adminStudents()' supervisor check.
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

// Input: payload — a GET /getuser answer in any shape, or anything nested inside one.
// Output: the array of account entries the answer holds, or [] when it holds none.
// Action: answers an array as itself, wraps a bare value in an array, and otherwise walks the
//   wrapper keys (users, accounts, data, items) — descending into an object wrapper, and
//   answering the whole payload as a one-row list when none of the keys holds a list.
// Role: the shape-finding half of studentRows(), and the reader studentpicker.js and
//   sessionstorage.js mirror by hand: it is what makes an untyped route's answer drawable
//   whichever of its shapes the backend chooses.
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

// Input: name — one student's name, as GET /getuser listed it (a name no list carries is never
//   asked about, since an unknown student answers 0 rather than 404).
// Output: the balance as a number, or a thrown Error when the route answered with no usable
//   balance at all.
// Action: GETs /get-balance?student=<name> with the session cookie, reads `balance` (or
//   `amount`) off the reply and accepts a numeric string as well as a number; anything else is
//   thrown.
// Role: one cell of the students table and the figure its rows are ranked by. It is thrown on
//   rather than written as a zero, because a zero is a real balance and a misread one is not —
//   a row whose balance could not be read is dropped by refreshRoster() instead of being drawn
//   as 0.
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

// Input: none — the list it asks for is fixed: the "JOB SALARIES" type value, its slug built by
//   reasonSlugFromType() rather than spelled by hand.
// Output: a plain object of job -> figure, as { "Attendance Monitor": 65, … }, or a thrown Error
//   when the route could not be read or carried nothing with both a name and a figure.
// Action: GETs /reasons/{slug} with the session cookie — the same route and shape the reason
//   pages read, so the column is priced from the table's own list — and keeps the entries
//   reasonEntry() can price.
// Role: the salaries the students table's job-salary column is priced from, asked only when a
//   job was read that the account carried no figure for. A failure is thrown rather than guessed
//   at, so refreshRoster() can leave that column a dash instead of pricing a job out of nothing.
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

// Student transaction flow -------------------------------------------------------
// The student's own way into the transaction flow: transaction_student_middle.html, the type
// menu transaction-middle.html draws, and behind its four doors the same four pages —
// transaction_student_bonus.html, transaction_student_fines.html, transaction_student_spending.html
// and transaction_student_other.html. Each of those is its admin twin to the letter: the same
// form, the same markup, the same script (this file), the same dropdown, date box, Y/N question
// and row. Two things are a student's own, and they are the whole of the difference:
//
//   who the row is for. On the admin's pages it is the pick transaction1.html had the backend
//     confirm and left in sessionStorage. Nothing of that is on a student's page — no name is
//     typed, picked or stored — because it is the account the session cookie belongs to, and
//     only the backend can name it:
//         GET /current-student  ->  {"student_name": "Rongrong Wu", …}   (checked live: the
//                                   route is untyped, an object of strings, and answers
//                                   401 {"detail": "Not logged in"} without a session, like
//                                   every other protected route)
//     and it is asked twice: once as the page opens (currentStudent, through flowPermission),
//     and once more at the last moment before the row leaves (sendTransaction), so a session
//     that ran out while the page stood is still caught.
//
//   where the row is written. The admin's pages record a transaction there and then, with
//     POST /transaction-record; a student's own page hands the very same five fields to
//     POST /add-transaction-submit, which is the route the backend has yet to answer: it is
//     not in https://api.rongrongwu.com/openapi.json and the API answers
//     404 {"detail": "Not Found"} to it (checked live). So what a student's page writes is a
//     submission — what the approvals page (approve_transactions.html) then lists — and the 404
//     is said in the API's own words with the route named, the way that page reads its own
//     GET /getsubmittransaction, rather than dressed up as something the page did wrong.
//
// Which flow a page is on, the page says about itself, the way the two history pages say
// data-history: a student's own page carries data-flow="student" on its <body> and the admin's
// pages carry nothing at all, so the word is read once and every difference above hangs off it.
// Read that way round on purpose: a page that says nothing at all — one not written yet, one
// whose word is misspelled, a copy of a student's page saved under another name — is read as the
// admin's flow, where the student is the pick sessionStorage already holds and the write is the
// admin's own route. A student's browser holds no such pick, so the worst a page nobody vouched
// for can do is refuse to write rather than write for the wrong account.
const STUDENT_FLOW = document.body?.dataset.flow === 'student';

// The two routes of the student flow: where the account behind the session cookie is named, and
// where that account's own transactions are handed over. Both are asked with the session cookie,
// and no page of the admin's flow asks either of them.
const CURRENT_STUDENT_URL = `${API_ORIGIN}/current-student`;
const SUBMIT_URL = `${API_ORIGIN}/add-transaction-submit`;

// The hub the student flow hands the browser back to when a page is done with it: the student's
// own hub, never the admin's, which is what HOME_URL is on every other page of this file.
const FLOW_HOME_URL = STUDENT_FLOW ? STUDENT_HOME_URL : HOME_URL;

// What the flow calls its own write, so that no sentence has to say "recorded" about a row nothing
// recorded. An admin's pages record a transaction — the row is in the transaction table the moment
// the backend answers (POST /transaction-record) — while a student's own page submits one
// (POST /add-transaction-submit) for an admin to approve, which is what the approvals page lists.
const WRITE_VERB = STUDENT_FLOW ? 'Submitted' : 'Recorded';  // opens the sentence
const WRITE_WORD = STUDENT_FLOW ? 'submitted' : 'recorded';  // after "Nothing was …"
const WRITE_NOUN = STUDENT_FLOW ? 'submission' : 'row';      // "the backend refused the …"

// The student GET /current-student named for this browser, or '' while none has been read. It is
// the whole of who a student flow's row is for (selectedStudents), and what the type menu's line
// is written with. Nothing of it is in sessionStorage, and nothing of it is the pick the admin's
// pages read there, so the two flows can never be mistaken for one another.
let studentFlowName = '';

// Input: none — it sends the browser's own session cookie.
// Output: { granted, name, text, isError } — whether a student session is behind this browser, the
//   account's name when the backend named one ('' when it did not), and the sentence the page
//   should show for the answer.
// Action: GETs CURRENT_STUDENT_URL with the cookie and reads the reply through studentName() — the
//   same untyped-object reader the student sign-in's own reply goes through — turning a 401 into
//   "log into the student account", a 200 that names nobody into a sentence saying so, and anything
//   else, network included, into a sentence naming what the backend answered. A name that is read
//   is kept in studentFlowName.
// Role: the one student gate of the student flow, and that flow's answer to every question the
//   admin's flow asks with checkAdminPermission(). It is asked as a type page opens
//   (openReasonPage, openOtherPage) and again at the last moment before the row leaves
//   (sendTransaction) — the same two moments the admin probe is asked at. It probes no other route,
//   because this one already answers what these pages need: who the row is for.
async function currentStudent() {
    try {
        const response = await fetch(CURRENT_STUDENT_URL, {
            method: 'GET',
            credentials: 'include' // send the student session cookie
        });

        if (response.status === 401) {
            studentFlowName = '';
            console.error('Current student check: the backend refused the request — not logged in.');
            return {
                granted: false,
                name: '',
                text: 'Not logged in — the backend refused the request. Log into the student account first, then reload this page.',
                isError: true
            };
        }

        if (!response.ok) {
            studentFlowName = '';
            console.error('Current student check error:', response.status, await response.text());
            return {
                granted: false,
                name: '',
                text: `Unexpected reply from the API (${response.status}) — the student behind this browser could not be named.`,
                isError: true
            };
        }

        const name = studentName(await response.json());

        if (!name) {
            studentFlowName = '';
            console.error('Current student check: the backend named no student.');
            return {
                granted: false,
                name: '',
                text: 'The backend named no student for this browser — GET /current-student answered without a name, so there is no account to write a transaction for.',
                isError: true
            };
        }

        studentFlowName = name;
        return {
            granted: true,
            name,
            text: `The backend confirmed this browser is signed in as ${name}.`,
            isError: false
        };
    } catch (error) {
        studentFlowName = '';
        console.error('Network Error:', error);
        return {
            granted: false,
            name: '',
            text: 'Network error — GET /current-student could not reach the API, so the student behind this browser could not be named.',
            isError: true
        };
    }
}

// Input: none — it sends the browser's own session cookie.
// Output: { granted, text, isError } — the verdict and the sentence for it, in the one shape both
//   gates answer in (currentStudent() hands the name back beside them as well).
// Action: answers currentStudent() on a student's own page and checkAdminPermission() on every other
//   page.
// Role: the gate the transaction-type pages ask, whichever flow they belong to — the two boots, the
//   two approvals and the write all ask it rather than either gate by name, so which session a page
//   needs is decided in one place and nowhere else.
async function flowPermission() {
    return STUDENT_FLOW ? currentStudent() : checkAdminPermission();
}

// transaction_student_middle.html's own line above its four doors — the only element of its kind on
// a page that loads this file (transaction-middle.html, the admin's menu, loads sessionstorage.js
// instead, which writes that same id from the pick), so a read only ever starts where there is a
// line to write an answer into.
const transactionStudentLine = document.getElementById('transactionstudent');

// Input: none — it sends the browser's own session cookie and reads the page's own line.
// Output: none — the line above the four doors names the student, or says why it cannot.
// Action: calls currentStudent() once as the page loads, writes the name it answered into the line,
//   and, with no student behind the browser, writes that sentence instead and locks the four doors.
// Role: the boot of transaction_student_middle.html, the type menu of the student flow — the
//   student's half of the question transaction-middle.html's line is written from the pick for.
//   Where the admin's menu waits for a student the flow has already had confirmed, this one waits
//   for the backend to name the account behind the session cookie, so no type can be opened by a
//   browser with nobody behind it. A page that carries the line but does not say data-flow is left
//   alone: it is not a page of this flow, and its line is sessionstorage.js's to write.
async function openStudentTypeMenu() {
    if (!transactionStudentLine || !STUDENT_FLOW) return; // every other page loads this file for its own form

    const student = await currentStudent();

    if (!student.granted) {
        console.error('Student type menu: no student behind this browser.');
        transactionStudentLine.textContent = student.text;
        lockStudentTypeDoors();
        return;
    }

    transactionStudentLine.textContent = student.name;
    console.log(`The type menu is open for ${student.name}.`);
}

// Input: none — it reads the page's own doors.
// Output: none — every type door is switched off.
// Action: walks the links of the .actions nav and gives each of them aria-disabled, no href and no
//   tab stop.
// Role: what the student's menu does with no account behind it — the same treatment
//   sessionstorage.js gives the admin menu's four doors (lockTransactionTypes), written out here
//   because this page loads this file and not that one. The footnote's way out is deliberately left
//   alone: it is the way out of this state.
function lockStudentTypeDoors() {
    document.querySelectorAll('.actions .btn').forEach(function (link) {
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
        link.setAttribute('tabindex', '-1');
    });
}

// Input: none — the boot runs as this file is read on the student's type menu.
// Output: none — openStudentTypeMenu() does everything, on the page's own line.
// Action: calls openStudentTypeMenu() once, as the page loads.
// Role: the boot of transaction_student_middle.html; every other page loads this file for its own
//   form, and the call returns at once there, there being no menu line to write.
openStudentTypeMenu();

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
//
// The same three cards exist as the student flow's own pages — transaction_student_bonus.html,
// transaction_student_fines.html and transaction_student_spending.html — and every line above
// holds for them unchanged: the same dropdown, the same data-reason-type, the same list. What
// differs is only who the row is for and which route writes it, and both hang off the one word
// data-flow="student" on the page's <body> (see the student flow section above).
const REASONS_URL = `${API_ORIGIN}/reasons`;

// Input: type — a `type` column value exactly as the table spells it ("JOB SALARIES", "BONUS
//   BUCKS"), taken from a page's data-reason-type or from JOB_SALARIES_TYPE.
// Output: the slug the API names that value by:
//   "JOB SALARIES"                -> "job-salaries"
//   "BONUS BUCKS"                 -> "bonus-bucks"
//   "BONURA BANK FINES"           -> "bonura-bank-fines"
//   "WAYS TO SPEND BONURA BUCKS"  -> "ways-to-spend-bonura-bucks"
// Action: trims it, lower-cases it, turns every run of anything that is not a letter or a digit
//   into one hyphen and cuts the hyphens off the ends.
// Role: the one place a route slug is built in this file — /reasons/{slug} on the reason pages
//   and the job-salaries list on the students page, both out of the type column's own value, so
//   no hand-written slug can drift from the table. All four routes are openapi.json's, and the
//   raw type value is not one of them: /reasons/JOB%20SALARIES answers 404 {"detail": "Unknown
//   reason type: JOB SALARIES"}.
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
//
// A student's own page does not write through this route: it hands the same five fields to
// POST /add-transaction-submit, and the row waits for an admin to approve it (see the student
// flow section above). The two routes are told apart in writeTransaction() alone, which is the
// one place either of them is spoken to.
const RECORD_URL = `${API_ORIGIN}/transaction-record`;

// Input: none — it reads the browser's own local clock.
// Output: the clock in the shape a row's `date` carries, YYYY/MM/DD HH:mm, as in
//   2026/09/29 16:17 — the shape the history column names, where MM is the month and mm the
//   minute and the space holds the date and the time apart.
// Action: reads the year, month, day, hour and minute off a Date by hand, each padded to two
//   digits with its leading zero — deliberately not through toISOString(), which works in UTC
//   and would date an evening transaction tomorrow on this side of the world.
// Role: the one clock of the transaction-type pages — the admin's four and the student flow's four
//   alike: the default their date boxes are filled with (boxStamp), the reading a box nobody has
//   picked a day in is set to once more as the transaction is built (transactionDate), and the
//   stamp written by a page that carries no
//   box at all. The route keeps no stamp of its own, so the shape is this app's to choose, and
//   choosing the history column's own shape keeps the rows this app writes and the rows the
//   backend wrote reading alike (transactionview.js re-cuts both into that one shape, and reads
//   back a stamp written this way unchanged).
function transactionStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');

    return `${now.getFullYear()}/${month}/${day} ${hour}:${minute}`;
}

// The date box ----------------------------------------------------------------
// The transaction-type pages - the three reason lists and the Other page, on the admin's side
// and in the student flow alike - carry one box
// for the row's date, so a transaction can be filed under the day and time it happened rather
// than under the moment it was typed in. The box is the browser's own day-and-clock control,
// type="datetime-local": a date input - the control addaccount.html's birthday box is - with a
// clock reading beside the day. It is picked over a text box for the reasons that birthday box
// gives: the browser hands the value over in one shape of its own, so nothing here has to parse
// what was typed, and the calendar behind it is what offers the day. Every day of every month is
// on it, January 1st through December 31st, and the months and the years around them are walked
// by the control itself. What a date input alone could not carry is the time of day, and a row's
// date is a stamp rather than a day - the history column heads it YYYY/MM/DD HH:mm - so the box
// is the one that keeps a clock as well as a calendar. The id below is the one every one of
// those pages gives it. The box is filled from the clock as the page loads, so it starts at now,
// and whatever it holds at approval is what the row is written with: the day it names, at the time
// beside it, or at 00:00 when it names a day with no time on it, the time of day being the one part
// of the stamp a box is allowed to leave off (readStamp).
const dateField = document.getElementById('transactiondate');

// Input: none — it reads the clock through transactionStamp().
// Output: the same reading in the shape a datetime-local box reads and writes:
//   2026/09/29 16:17 -> 2026-09-29T16:17.
// Action: splits the stamp into its day and its time, swaps the day's slashes for hyphens and
//   puts a T in place of the space.
// Role: the date box's default on the transaction-type pages (filled by the `if (dateField)`
//   boot below). Both shapes come off the one reading, so a box's default and the row it is
//   written into can never name two different minutes.
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

// Input: the input event of the date box — a day picked from its calendar, or typed into its
//   parts.
// Output: none.
// Action: sets dateChosen to true.
// Role: the flag transactionDate() reads: from here on the box is the admin's own, and the clock
//   is never written over it again; until it is set, the box means "now".
dateField?.addEventListener('input', function () {
    dateChosen = true;
});

// The shape a datetime-local box holds: the day in three parts, a T, then the clock in two. The
// clock is the one part that may be missing - a box left holding a day with no time beside it
// names a day all the same - so the T and the clock are read as a single optional part. The
// seconds are not here because the box carries none - the control's own step is a minute - and
// the shape a row is written in carries none either.
const BOX_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

// Input: value — what a datetime-local box holds.
// Output: the day in the shape a row is written with, YYYY/MM/DD HH:mm, or null when the box
//   holds no whole day at all.
// Action: matches it against BOX_STAMP and re-cuts the parts; a day with no clock reading beside
//   it is filed at 00:00, so a box holding 2026-03-04 and one holding 2026-03-04T00:00 write the
//   same row.
// Role: the reader transactionDate() puts between the box and the row, so the transaction
//   pages cannot date a row one way each. The shape is the whole test, the way it is for the
//   birthday box, and for the same reason: the browser answers with a day it could name and a
//   clock reading it could make sense of, and leaves the box empty when it could not — February
//   the 30th is not a day any calendar offers, so the control keeps no such value — which means
//   what is left to refuse is a box holding no whole day at all: cleared, or a day cut off half
//   way.
function readStamp(value) {
    const parts = BOX_STAMP.exec(String(value).trim());

    if (!parts) {
        return null;
    }

    return `${parts[1]}/${parts[2]}/${parts[3]} ${parts[4] || '00'}:${parts[5] || '00'}`;
}

// Input: none — it reads the page's own date box (dateField) and the dateChosen flag.
// Output: the day the row is to be written with, in the shape a row carries, or null when the
//   box holds no whole day.
// Action: on a page with no box it answers transactionStamp(); on a page whose box nobody has
//   touched it fills the box from the clock once more (boxStamp) and then reads it back
//   (readStamp).
// Role: the one date read the approving pages share, called as each of them builds its
//   transaction, so the reason pages and the Other page cannot drift into two shapes or two
//   moments — a page left open for an hour still writes the minute it happened. A day with no
//   time on it is not a refusal (readStamp files it at 00:00, and DATE_PROMPT says so); a box
//   holding no whole day at all is, and each page says so on its own status line.
function transactionDate() {
    if (!dateField) {
        return transactionStamp();
    }

    if (!dateChosen) {
        dateField.value = boxStamp();
    }

    return readStamp(dateField.value);
}

// What the transaction pages' status line says when the date box holds no whole day at all. One
// sentence for all of them, so they cannot word the same refusal two ways. A time of day is not asked
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
// several. Kept in sync with STUDENT_USERNAME_KEY in sessionstorage.js. A student's own page
// never reads it — nothing about that flow is in sessionStorage — and asks the backend who the
// browser is instead (currentStudent, through selectedStudents).
const STUDENT_KEY = 'student_username';

// The whole pick the same box made - every picked student's name, in the order they were
// picked, which is the order the box was clicked in - kept in sync with SELECTED_STUDENTS_KEY
// in sessionstorage.js. The pages that approve a transaction load app.js and not that
// file, so the reader below is kept here by hand, the way the key itself is, and both read the
// one key the box wrote.
const SELECTED_STUDENTS_KEY = 'selected_students';

// Input: none — it reads SELECTED_STUDENTS_KEY out of sessionStorage.
// Output: the stored names as an array of strings, in the order they were picked; [] when
//   nothing is stored or when what is stored cannot be read back as a list of names.
// Action: parses the stored JSON and keeps the entries that are non-empty strings.
// Role: the reader of the pick transaction1.html's box stores — the same reading
//   sessionstorage.js's storedStudentSelection() makes, so half a JSON object, or a key somebody
//   else wrote, can only ever come back as no pick at all rather than as a student to write a
//   row for. It is kept here by hand because the approving pages load this file and not
//   that one.
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

// Input: none — on a student's own page it reads studentFlowName, and on every other page the stored
//   pick (storedStudentSelection) and, as a fallback, the one name STUDENT_KEY carries.
// Output: the students the transaction is for, as an array of names; [] when nothing holds one.
// Action: answers the one name the backend gave this browser on a student's own page, and otherwise
//   the pick when there is one, falling back to the single stored username when it holds something.
// Role: who an approved transaction is written for — every student of the pick on the admin's pages,
//   in the order the box was clicked in, because the one transaction typed there is recorded for
//   each of them rather than for the first of them alone, and the one account behind the session
//   cookie on a student's own page, where a student writes for themselves and for nobody else. It
//   is read once, as the approving page builds the transaction — the very object the Y/N question is
//   asked about — so what is written is what was agreed to; with nothing holding a name the list is
//   empty, and the approval writes nothing rather than a row for a student nobody named.
function selectedStudents() {
    // Nothing is stored on a student's own page: who the row is for is the account the backend named
    // for this browser's session cookie (currentStudent), kept in studentFlowName.
    if (STUDENT_FLOW) {
        return studentFlowName ? [studentFlowName] : [];
    }

    const pick = storedStudentSelection();

    if (pick.length) {
        return pick;
    }

    const stored = sessionStorage.getItem(STUDENT_KEY);

    return stored && stored.trim() !== '' ? [stored] : [];
}

// Input: names — one or more student names, in the order the box was clicked in.
// Output: them as a sentence names them: "A", "A and B", "A, B and C" — '' for an empty list.
// Action: answers a single name as itself and otherwise joins all but the last with commas and
//   the last with " and ".
// Role: the one place a list of names becomes words, so every line that says who a transaction
//   was written for — the Y/N question, the recorded sentence, a write that stopped partway —
//   reads the same, and the one-student case reads exactly as it always has.
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

// Input: source — an object the backend sent (or nothing at all); keys — the field names to try,
//   most likely first.
// Output: the value of the first of those keys that actually carries something, or null when
//   none of them does.
// Action: reads source[key] in turn and answers the first value that is not undefined, null or
//   '' — an empty string counting as missing, so it never turns into a blank option or a blank
//   cell.
// Role: the one place an untyped route's field names are tried in this file: every reader of an
//   answer (studentRows, reasonEntry, submissionFields, describeCurrentAdmin) asks through it,
//   which is what lets the backend rename or add a field without the page drawing a dash for it.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// Input: entry — one reason as the backend sent it: an object carrying its own fields, or a bare
//   value.
// Output: the points it is worth as a number — negatives surviving, the fine list coming back as
//   -10, -15, and so on — or null when it carries no usable figure.
// Action: takes the first of REASON_POINTS_KEYS that holds something and numbers it, accepting a
//   numeric string; anything that is not a finite number is null.
// Role: the figure half of reasonEntry(), and through it what the dropdown option is labelled
//   with (amountLabel) and what the row's amount is signed from (signedAmount) — a reason with
//   no figure being carried as null rather than as a 0 nothing was read for.
function reasonPoints(entry) {
    const field = firstField(entry, REASON_POINTS_KEYS);

    if (field === null) {
        return null;
    }

    const points = Number(field);

    return Number.isFinite(points) ? points : null;
}

// Input: payload — the parsed body of a /reasons/{slug} answer, in any of the shapes those
//   routes have been answered with.
// Output: the reason entries as an array — objects, or bare strings where the list was one.
// Action: answers an array as itself, walks the wrapper keys (bonuses, bonus, data, items) and,
//   failing those, reads a single reason object as a one-row list and a reason -> amount map as
//   one entry per key.
// Role: the shape-finding reader of the reason lists, shared by the reason pages' dropdowns
//   (loadReasons) and by the job salaries behind the students table (jobSalaries). The shapes
//   accepted so far:
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

// Input: entry — one element of a reason list as reasonList() found it: an object with its own
//   fields, a bare string, or nothing at all.
// Output: { label, value, points } for an <option> — the reason column's own text as both label
//   and value, and the figure the backend sent with it (null when it sent none, which is what a
//   page's built-in fallback list looks like) — or null when the entry carries nothing worth
//   showing.
// Action: reads the name through REASON_NAME_KEYS and the figure through reasonPoints(); an
//   entry that is neither an object nor a usable string answers null.
// Role: one row of a reason dropdown, and of the job-salaries list behind the students table.
//   The value is always the reason itself — the reason column value the backend sent, never a
//   separate id — so the choice a page carries on with is exactly the text the column holds, and
//   null is what lets fillReasonOptions skip an entry instead of printing "undefined" into the
//   dropdown. The figure is signed later, by type, in fillReasonOptions().
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

// Input: points — the figure a reason carries (a number, or null); type — the page's own
//   data-reason-type value, which is what the sign is decided from.
// Output: the amount to record, as a number — negative for the types that spend money, positive
//   for the ones that add it — or null when the reason carries no figure at all.
// Action: refuses anything that is not a finite number and otherwise takes the absolute figure
//   with a minus for a DEBIT_TYPES type.
// Role: the sign half of a reason page's row: it is what makes spending and fines take points
//   off an account while salaries and bonuses add them, so the figure the dropdown promised
//   (amountLabel) and the figure recorded cannot differ. Nothing is invented for a reason with
//   no figure — null is what the route's schema allows.
function signedAmount(points, type) {
    if (typeof points !== 'number' || !Number.isFinite(points)) {
        return null;
    }

    return DEBIT_TYPES.includes(type) ? -Math.abs(points) : Math.abs(points);
}

// Input: reason — the reason column's own text; amount — the signed figure that will be
//   recorded for it, or null when the reason carries none.
// Output: the text a dropdown option — or the Other page's row type — is labelled with:
//   "Teacher Assistant (65 pts)", "Pen pass (-5 pts)", or the bare reason when there is no
//   figure.
// Action: appends the amount and its unit in brackets, "pt" for exactly one point and "pts"
//   otherwise (Math.abs, so a single point does not read "(-1 pts)").
// Role: the label of every option a reason page builds, and the row type of the Other page: the
//   amount is spelled with the sign it will be recorded with, so the dropdown cannot promise one
//   thing while the transaction carries another.
function amountLabel(reason, amount) {
    if (amount === null) {
        return reason;
    }

    // Math.abs so a single point reads "(-1 pt)", not "(-1 pts)".
    return `${reason} (${amount} ${Math.abs(amount) === 1 ? 'pt' : 'pts'})`;
}

// Input: option — the <option> the admin picked, or undefined when the dropdown holds nothing.
// Output: the amount it carries as a number, or null when it carries none.
// Action: reads data-amount off the option (where makeOption put it) and numbers it, accepting a
//   numeric string; an absent or unusable value is null.
// Role: what an approved reason page records as its row's amount — the figure the option's own
//   label shows, read back off the element rather than worked out again, so approving a reason
//   ships exactly the figure the admin saw. A page's built-in list carries no data-amount, which
//   is why null — a reason with no figure — is the answer there.
function optionAmount(option) {
    const value = option?.dataset?.amount;

    if (value === undefined || value === '') {
        return null;
    }

    const amount = Number(value);

    return Number.isFinite(amount) ? amount : null;
}

// Input: value — the option's value (the reason itself); label — the text the eye reads;
//   selected — whether it is the entry the dropdown starts on; amount — the signed figure that
//   goes with it, or null/undefined for a reason that carries none.
// Output: the <option> element.
// Action: builds the node, writes the value and the label as text, keeps the amount on
//   data-amount when there is one, and marks it selected when asked.
// Role: one row of a reason dropdown on the reason pages, and of the job-salaries list behind
//   the students table. Keeping the amount on the option is what lets approving it ship exactly
//   the figure its label shows (optionAmount).
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

// Input: reasons — a list of reason entries, or a raw payload for reasonList() to read.
// Output: the number of reasons it filled in — 0 when nothing usable came back and the page's
//   built-in list was left exactly as it is.
// Action: keeps the placeholder "choose one" entry at the top, signs each reason's figure by the
//   page's own type (signedAmount), labels it with that figure (amountLabel), and swaps the whole
//   list in; entries reasonEntry() answers null for are skipped.
// Role: the one writer of a reason dropdown — how a reason page shows what /reasons/{slug}
//   answered, and the count loadReasons() reads to decide whether the backend's list or the
//   page's built-in one stands.
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

// Input: enabled — true to make the dropdown live, false to grey it out.
// Output: none — the select's aria-disabled attribute is set or cleared.
// Action: adds or removes that one attribute; a page without the dropdown is left alone.
// Role: the reason pages' dropdown switch — grey while the list is being read and while the
//   session is still unconfirmed, using the attribute styles.css styles for .panel select.
function setReasonEnabled(enabled) {
    if (!reasonSelect) return;

    if (enabled) {
        reasonSelect.removeAttribute('aria-disabled');
    } else {
        reasonSelect.setAttribute('aria-disabled', 'true');
    }
}

// Input: enabled — true to make the reason pages' Next button live, false to grey it out.
// Output: none — the button's aria-disabled attribute is set or cleared.
// Action: adds or removes that one attribute; a page without the button is left alone.
// Role: the switch of the reason pages' Next — the same attribute styles.css styles for .btn,
//   which transaction1.html's Next link wears too — and the state a recorded or refused
//   transaction leaves behind until the dropdown or the date box is touched again.
function setApproveEnabled(enabled) {
    if (!reasonNext) return;

    if (enabled) {
        reasonNext.removeAttribute('aria-disabled');
    } else {
        reasonNext.setAttribute('aria-disabled', 'true');
    }
}

// Input: text — the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a page without the block is left alone.
// Role: the one status line of the reason pages, where the session check and the dropdown read
//   share a sentence (openReasonPage) and every refusal of a transaction is said — the same
//   one-paragraph shape the other show*Message writers use.
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

// Input: label — the text on the button ("Y"/"N" or "Yes"/"No"); variant — the .btn class it
//   wears (btn--primary for the yes answer, btn--danger where the yes answer destroys something);
//   answer — the boolean answerConfirmation() is given when it is pressed.
// Output: the <button> element.
// Action: builds a type="button" node with the app's own .btn classes and a click listener that
//   answers the question.
// Role: one of the two answers of the Y/N question, built when the overlay is first needed
//   (buildConfirmDialog) and then re-worded and re-coloured for whatever question is asked.
function confirmButton(label, variant, answer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${variant}`;
    button.textContent = label;
    // Input: the click on one of the two answers.
    // Output: none — the question is answered with the boolean this button was built for.
    // Action: hands that boolean to answerConfirmation().
    // Role: what makes one of the two answers work — both buttons are wired the same way, and the
    //   answer each carries is the one it was built with (true for yes, false for the other).
    button.addEventListener('click', function () {
        answerConfirmation(answer);
    });

    return button;
}

// Input: none.
// Output: none — the overlay is built and appended to the body, and the module-level
//   confirmDialog, confirmHeading, confirmText, confirmYes and confirmNo are filled in.
// Action: builds the .confirm panel — the h2 question, the sentence under it and the two answer
//   buttons — gives it role="dialog" and aria-modal, wires the keyboard (the first letter of each
//   label, and Escape as the quieter answer) and stores the pieces every later question writes
//   over.
// Role: the app's own question box, built on first use and hidden again until it is needed — the
//   one place a transaction approval and a student removal are asked about. window.confirm()
//   would answer OK/Cancel, which is not what this flow asks for, so the question is a dialog of
//   its own, and the listener lives on the document because the buttons are the only things
//   inside the overlay and the keyboard may be anywhere.
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

    // Input: the keydown event — any key pressed while the page has focus.
    // Output: none — the question is answered when the key is one of the two answers.
    // Action: ignores every key while the overlay is hidden; otherwise the first letter of the
    //   yes label answers yes, and the first letter of the no label or Escape answers no. Each
    //   key is read off the label on the panel at the time, so a question answered with
    //   "Yes"/"No" is answered by y and n exactly as the approving pages' "Y"/"N" is.
    // Role: the keyboard half of the question — the two answers work as keys too, the question
    //   says so, and Escape is the same answer as the quieter one, so the question can always be
    //   dismissed without a mouse.
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

// Input: transaction — the object an approving page built and is about to send (students, type,
//   amount, date, memo, label).
// Output: the sentence the Y/N question shows under its heading.
// Action: names the type — and the label in quotes, unless the type already opens with that
//   label, which is the Other page's case alone — every student the transaction is for, the
//   amount, the memo when it says more than the label already does, and, with more than one
//   name, the tail that says how many accounts Y really writes to.
// Role: the body of the transaction question: the same facts the status line names after a
//   recording, so what the admin agrees to and what is reported afterwards cannot describe two
//   different things. It is handed the very object the request will carry, and it never reads
//   `date`, which the question does not name.
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

// Input: question — the heading; text — the sentence under it; options — what the caller varies:
//   the two labels, whether the yes answer is drawn in the red a refusal gets, and the button the
//   keyboard goes back to.
// Output: a promise that settles true for the yes answer and false for the no one.
// Action: builds the overlay on first use, writes the question, the sentence, both labels and the
//   yes button's colour over whatever was there, shows it with the focus on the yes answer, and
//   parks the promise the answer will resolve.
// Role: the one question box of the app, asked wherever something cannot be undone: the approving
//   pages put a transaction in front of the admin and answer it with Y and N, while remove.html
//   puts a student there and answers it with Yes and No. The caller owns every word and the
//   treatment, and a question already up is the question that has to be answered, so a second
//   call shares it instead of stacking another one on top.
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
    // Input: resolve — the promise's own resolver, handed over by the Promise constructor.
    // Output: none — the resolver is kept on the pending object.
    // Action: parks resolve where answerConfirmation() can reach it.
    // Role: how a question answered by a click (or a key) becomes a promise the asking flow can
    //   await, with the resolution held until the overlay is answered.
    pending.promise = new Promise(function (resolve) {
        pending.resolve = resolve;
    });
    confirmPending = pending;

    return pending.promise;
}

// Input: answer — true for the yes answer, false for the no one.
// Output: none — the waiting promise is resolved with that answer.
// Action: takes the pending question (returning when there is none), hides the overlay, puts the
//   keyboard back on the button the question was asked from, and resolves the promise.
// Role: what both answers come through — the buttons (confirmButton) and the keys
//   (buildConfirmDialog) alike — and the first answer is the answer: once the question is gone
//   there is nothing left to resolve, so a second click or key cannot change what was decided.
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

// Input: none — the page's own dropdown decides the list asked for (reasonType/reasonSlug).
// Output: { count, text, isError } — how many reasons ended up in the dropdown and the sentence
//   the page should show about it. It does not write that message itself.
// Action: greys the dropdown for the round trip, GETs /reasons/{slug} with the session cookie,
//   hands the answer to reasonList() and fillReasonOptions(), and turns a 404, an unusable list
//   or a dead network into the sentence that says the built-in options stand.
// Role: the read half of a reason page, called by the page's own boot (openReasonPage). The page
//   opener and the Next button share the one status line, which is why the message is handed
//   back rather than written here.
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

// Input: none — it sends the browser's own session cookie.
// Output: { granted, text, isError } — the verdict and the sentence the page should show for it.
// Action: POSTs an empty body to ADMIN_CHECK_URL and reads the status: 2xx or 422 means only the
//   empty body was refused, so the session cookie was accepted; 401 means no session; anything
//   else is said in words. The verdict is also kept in permissionState.
// Role: the one admin gate of the protected flows — the reason pages, the Other page and the
//   remove page ask it as they open and again at the last moment before a write, because a
//   session can expire while a page stands. It is the same empty-body POST /adduser trick
//   sessionstorage.js uses, kept for the one request it costs: the route answers "Not logged in"
//   before it ever looks at the body, and an empty body can never create a user. The transaction
//   pages reach it through flowPermission(), which asks a student's own page for the student
//   (currentStudent) instead: a student holds no admin session, and the route that names the
//   account is the one that also answers who the row is for.
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

// Input: none — it reads the page's own dropdown, the flow's gate and, on the admin's pages, the
//   stored student pick.
// Output: none — the dropdown is filled (or the page's built-in list left as it is), the Next
//   button is left live or grey, and the one status line says what happened.
// Action: refuses a page with no type value on the <select>, and — on the admin's pages alone —
//   one with no student confirmed on transaction1.html; otherwise asks the flow's own gate
//   (flowPermission: the student read on a student's own page, the admin probe on every other),
//   then reads the reason list (loadReasons) and puts both halves of the answer on the one status
//   line, styled as an error if either half went wrong.
// Role: the boot of the six reason pages (transaction_bonus, transaction_fines,
//   transaction_spending and their transaction_student_* twins) — what stops a type being opened
//   straight from the URL with nobody behind it. On a student's own page there is no stored pick to
//   look for: the read the gate makes is the check, because it both names the account and proves
//   the session, and a browser with none behind it is refused with that sentence on this same line.
async function openReasonPage() {
    if (!reasonSelect) return; // every other page loads app.js for its own form only

    // A transaction on the admin's pages is only ever for a student confirmed on transaction1.html,
    // so without one the dropdown and the Next button stay switched off and the status line says
    // where to go. This is what stops a type being opened straight from the URL with nobody behind
    // it. A student's own page has no such pick to look for: the gate below is asked instead, and
    // it is the read that names the account.
    if (!STUDENT_FLOW && !sessionStorage.getItem(STUDENT_KEY)) {
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

    const check = await flowPermission();
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

// Input: none — it reads the page's dropdown, the date box and sessionStorage.
// Output: none — the approval is run, and everything it has to say is written on the status line.
// Action: refuses a page without the dropdown, refuses a second approval while one is running
//   (approvalRunning), and otherwise runs runApproval(); the flag is cleared however that ended.
// Role: the reason pages' Next button (wired to it below), the outer half of an approval — one
//   approval at a time, because a second click while the Y/N question is up would only put the
//   same question up again.
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

// Input: none — it reads the dropdown, its selected option, the date box and the flow's gate.
// Output: none — the row is written, or the status line (and Next's state) says why it was not.
// Action: refuses an empty dropdown and a date box holding no whole day; re-asks the flow's gate
//   (flowPermission); builds the row (students, type, amount, date, memo, label) with the amount
//   read off the selected option (optionAmount), the students the flow's own (selectedStudents) and
//   the date through transactionDate(); asks the Y/N question about that very object; and on Y sends
//   it (sendTransaction), greying Next once it is written and handing the browser back to the flow's
//   own hub (FLOW_HOME_URL).
// Role: the approval itself, behind approveReason() — split out so the one-at-a-time flag covers
//   every way out of it: written, refused, unanswered or off the network. It is the same function on
//   an admin's page and on a student's own, which is why the gate, the students and the hub are all
//   asked of the flow rather than named here.
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
    const check = await flowPermission();

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

    // The approved choice is parked next to the student the flow is for — the pick
    // transaction1.html stored, or the account the backend named on a student's own page —
    // and it is parked before anything is sent: the bodies kept in sessionStorage are the
    // ones the requests carry, so a send that fails loses nothing.
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
        showReasonMessage(`Nothing was ${WRITE_WORD} — the "${transaction.label}" transaction${forStudent} was not confirmed with Y.`, true);
        return;
    }

    // The flow's own write route takes it — POST /transaction-record on the admin's pages,
    // POST /add-transaction-submit on a student's own (writeTransaction) — through the one
    // function both approving pages send with, so the reason pages and the Other page cannot
    // drift apart.
    const sent = await sendTransaction(transaction);

    if (sent.ok) {
        // Written once is written: Next goes grey until another reason is
        // chosen, so a second click cannot write the same transaction twice.
        setApproveEnabled(false);
        showReasonMessage(recordedMessage(transaction), false);

        // The transaction is done with this account, and the flow's own hub is where the
        // balance it just changed is drawn, so the flow hands the browser back to it
        // instead of leaving it on a form with nothing left to do.
        redirectHomeAfter(REDIRECT_DELAY_MS, FLOW_HOME_URL);
        return;
    }

    showReasonMessage(sent.text, true);

    // A send that did not go through leaves Next live, so the same choice can be
    // tried again.
    setApproveEnabled(true);
}

// Input: transaction — the object an approving page built; student — the one student this body
//   is for.
// Output: { user, amount, type, date, memo } — the five fields a row of the table carries, and
//   nothing else.
// Action: copies those five fields out of the transaction object, `user` being the student handed
//   in.
// Role: the one body shape both approving pages send (sendTransaction), so the reason pages and
//   the Other page cannot drift apart. What the pages keep beside it — the label the question
//   reads, the reason the memo is built from — none of that goes over the wire; the two pages
//   differ only in what they put in `type` and `memo`, the Other page having no list to take a
//   type from. The five fields are the same for every student of a pick, which is why
//   sendTransaction()'s loop builds one body per student and changes nothing but `user`.
function transactionBody(transaction, student) {
    return {
        user: student,
        amount: transaction.amount,
        type: transaction.type,
        date: transaction.date,
        memo: transaction.memo
    };
}

// Input: transaction — the approved transaction as the page built it (students, type, amount,
//   date, memo, label).
// Output: { ok: true, count } once the backend has written every row, or { ok: false, text }
//   with the sentence to show when it refused, when the network was gone, or when there is no
//   student to write for.
// Action: re-asks the flow's own gate at the last moment before the rows leave (a refusal writes
//   nothing, so nothing is parked either); refuses a transaction naming nobody; builds one body per
//   student (transactionBody, only `user` differing); parks them all in sessionStorage before the
//   first request leaves, so a send that fails loses nothing; then POSTs one row per student in a
//   for loop (writeTransaction), stopping at the first refusal.
// Role: the one write of both approving pages, and of a student's own pages — the same function,
//   because the only thing a flow changes about a write is the route it goes to, which
//   writeTransaction() knows. On the admin's pages it is made for the whole pick: one transaction
//   typed once is recorded for every picked student, one row each, rather than for the first of them
//   alone; on a student's own page the list is one name long, the account the backend named for the
//   session cookie. The loop stops at the first row the backend refuses or that never reaches it —
//   the rest of the pick would be asked for with the same session and answered the same way, and
//   every one of them would sit out the network's own timeout again, once per student, while the
//   admin is the one who has to read what happened and decide about the rest. What it answers names
//   the students it did write for (stoppedMessage), or, on a student's own page, the one account.
async function sendTransaction(transaction) {
    // The rows are only written for a session the backend recognizes, and the backend is the only
    // thing that can say which one that is: the flow's gate is asked here, once for the whole
    // approval rather than once per student, at the last moment before the rows leave. The approving
    // pages have already asked it once — before the Y/N question — but an answer given there is not
    // an answer given here, and a session that ran out in between is precisely what this check is
    // for. On the admin's pages it is the empty-body POST /adduser probe; on a student's own page it
    // is GET /current-student, which is also the read that re-names the account the rows are for. A
    // refusal writes nothing, so nothing is parked either: these rows were never on their way.
    const check = await flowPermission();

    if (!check.granted) {
        return { ok: false, text: `Nothing was ${WRITE_WORD} — ${check.text}` };
    }

    // Who the rows are for is what the Y/N question was asked about - the students the approving
    // page read out of sessionStorage as it built this transaction, or the one account the backend
    // named on a student's own page - so what is written is what was agreed to, name for name. A
    // transaction naming nobody is refused rather than sent as a row for an empty username: the
    // admin's approving pages sit behind transaction1.html's confirmed pick, so this is a page whose
    // storage was emptied while it was open, and the sentence says where to pick a student instead.
    const students = transaction.students;

    if (!students.length) {
        return {
            ok: false,
            text: STUDENT_FLOW
                ? 'Nothing was submitted — this page has no student behind it, so there is no account to submit for. Sign in as the student on the front door, then reload this page.'
                : 'Nothing was recorded — this transaction names no student, so there is no account to write the rows to. Go back to the transaction page, pick the students it is for, and press continue.'
        };
    }

    const bodies = students.map((student) => transactionBody(transaction, student));

    sessionStorage.setItem(PENDING_KEY, JSON.stringify(bodies));
    console.log(STUDENT_FLOW ? 'Submitted:' : 'Approved:', bodies);

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

    // A student's own page had one account to write for and nobody else, so a refusal needs none of
    // the pick's own words: the sentence names the account and says what the backend answered.
    if (STUDENT_FLOW) {
        return {
            ok: false,
            count: written.length,
            text: `Nothing was submitted for ${refusal.student} — ${refusal.text}`
        };
    }

    // The students of the pick the loop never reached are named with the ones it did: a
    // half-written approval is the one thing the admin must not have to work out for themselves.
    return {
        ok: false,
        count: written.length,
        text: stoppedMessage(transaction, written, refusal, students.slice(written.length + 1))
    };
}

// Input: body — one row's five fields, as transactionBody() built them.
// Output: { ok: true, result } once the backend has taken the row, or { ok: false, text } with the
//   reason alone when it refused or the network was gone.
// Action: picks the flow's own route — POST /transaction-record on the admin's pages,
//   POST /add-transaction-submit on a student's own — POSTs the body as JSON to it with the session
//   cookie and reads the answer once (a refusal is never trusted to parse); a 404 on the student
//   route is handed back with the sentence that names it as the route the API has not been given
//   yet.
// Role: the one request of a write on the transaction pages, called once per student by
//   sendTransaction()'s loop — and the same call the approvals page's Approve makes for a submission
//   (through the admin's route, that page being an admin's). The sentence the reader sees is the
//   caller's, which is why only the reason is handed back: the caller is the one that has to name
//   the student this row was for. It is the one place the two routes are told apart.
async function writeTransaction(body) {
    const url = STUDENT_FLOW ? SUBMIT_URL : RECORD_URL;

    try {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // A refusal can answer with something that is not JSON, so the body is read
        // once and never trusted to parse.
        const result = await response.json().catch(() => null);

        if (response.ok) {
            console.log(STUDENT_FLOW ? 'Transaction submitted:' : 'Transaction recorded:', result);
            return { ok: true, result };
        }

        console.error('Transaction write error:', response.status, url, result);

        // A student's route is one the backend has yet to answer, so its 404 is read the way the
        // approvals page reads GET /getsubmittransaction's: the API's own words, with the route
        // named, rather than dressed up as something the page did wrong.
        const missing = STUDENT_FLOW && response.status === 404
            ? ' — the page asks POST /add-transaction-submit for it, which is the route the API has not been given yet, so there is nothing to submit until it answers.'
            : '';

        return {
            ok: false,
            text: `the backend refused the ${WRITE_NOUN} (${response.status}): ${describeError(result)}${missing}`
        };
    } catch (error) {
        console.error('Network Error:', error);
        return { ok: false, text: `the ${WRITE_NOUN} never reached the API (network error)` };
    }
}

// Input: transaction — the approved transaction that was written.
// Output: the sentence the page shows once every row has been taken, ending with the way on to the
//   flow's own hub.
// Action: names the label, every student it was written for, what the row was filed under —
//   dropping the type when it already opens with the label, which is the Other page's case alone —
//   and, for a pick of several, that one row was written per student; on a student's own page it
//   says instead that the row is a submission waiting to be approved, since that is what
//   POST /add-transaction-submit leaves behind.
// Role: the success sentence of both approving pages and of a student's own, shared so the reason
//   pages, the Other page and the student's pages word a write alike, and built from the same object
//   the question named.
function recordedMessage(transaction) {
    const students = transaction.students;
    const forStudent = students.length ? ` for ${nameList(students)}` : '';

    // A student's own page hands the row over rather than writing it into the table, so its sentence
    // says what the row is now — a submission — and where it is: on the approvals page's list, where
    // an admin answers it. None of the admin's own words about a row that is already in the table
    // belong here.
    if (STUDENT_FLOW) {
        return `${WRITE_VERB} "${transaction.label}"${forStudent} — the backend took the submission`
            + ` (POST /add-transaction-submit), and it is waiting for an admin to approve it on the`
            + ` approvals page. Taking you to the student home page…`;
    }

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

// Input: transaction — the approved transaction; written — the students whose rows the backend
//   took; refusal — { student, text } for the student the loop stopped at; unwritten — the
//   students of the pick the loop never reached.
// Output: the sentence the page shows for a write that stopped partway.
// Action: names the students the rows were written for and the student it stopped at, and appends
//   the two further sentences when they apply.
// Role: what the admin reads when a half-written approval is left standing — which students the
//   transaction was written for, where it stopped, and which students of the pick never got their
//   row. The last sentence is written only when something has already been written, because
//   pressing Next again asks for the whole pick rather than for the rest of it, and the admin has
//   to know that before they do it.
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

// Input: the change event of the reason dropdown — another reason chosen.
// Output: none.
// Action: brings the Next button back when the dropdown holds a reason.
// Role: the dropdown's own undo of the grey a recorded or refused transaction left on Next:
//   choosing another reason is a different transaction, so the same click can be made again.
reasonSelect?.addEventListener('change', function () {
    if (reasonSelect.value) {
        setApproveEnabled(true);
    }
});

// Input: the input event of the date box — a day picked from its calendar, or typed into its
//   parts.
// Output: none.
// Action: brings the Next button back when the dropdown holds a reason.
// Role: another day is another transaction, so setting the box has to undo the grey a recorded or
//   refused one left on Next, the way choosing another reason does — but only with a reason in
//   the dropdown, the box on its own having nothing to file. (The Other page needs no line of its
//   own here: its date box is inside its form, whose own input listener covers every box in it.)
dateField?.addEventListener('input', function () {
    if (reasonSelect?.value) {
        setApproveEnabled(true);
    }
});

// Input: the click on the reason pages' Next button.
// Output: none.
// Action: hands the click to approveReason() and nothing else.
// Role: the wiring of the reason pages' Next — the button the Y/N question is asked from and the
//   one its answer returns the keyboard to.
reasonNext?.addEventListener('click', approveReason);

// Input: none — the boot runs as this file is read on a reason page.
// Output: none — openReasonPage() does everything, on the page's own status line.
// Action: calls openReasonPage() once, as the page loads.
// Role: the boot of the three reason pages; every other page loads this file for its own form,
//   and the call returns at once there, there being no dropdown to fill.
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
//
// transaction_student_other.html is the same card for the student flow — the same three boxes and
// the same date box, and every line above holds for it. What differs is only the two things the
// whole student flow differs by: the student is the account GET /current-student names for the
// session cookie rather than a pick, and the row is handed to POST /add-transaction-submit instead
// of being recorded by POST /transaction-record (see the student flow section above).
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

// Input: enabled — true to make the Other page's Next button live, false to grey it out.
// Output: none — the button's aria-disabled attribute is set or cleared, and otherEnabled is set
//   to match.
// Action: records the answer in otherEnabled, then adds or removes the attribute.
// Role: the switch of the Other page's Next — the same attribute styles.css styles for .btn on
//   the reason pages. The attribute is what the eye and the mouse see; otherEnabled is the flag
//   the handler is checked against, because Enter inside a box submits the form whether or not
//   the button looks live.
function setOtherEnabled(enabled) {
    otherEnabled = Boolean(enabled);

    if (!otherNext) return;

    if (otherEnabled) {
        otherNext.removeAttribute('aria-disabled');
    } else {
        otherNext.setAttribute('aria-disabled', 'true');
    }
}

// Input: text — the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a page without the block is left alone.
// Role: the one status line of the Other page, where the boot, the reason and amount refusals,
//   the date refusal and every answer to a write are said — the same one-paragraph shape the
//   other show*Message writers use.
function showOtherMessage(text, isError) {
    if (!otherResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    otherResults.replaceChildren(paragraph);
}

// Input: none — it reads the Other page's memo box (#othermemo).
// Output: the text of the box, trimmed, or null when it was left empty.
// Action: reads and trims the box's value, answering null for ''.
// Role: the memo field of the Other page's row — the whole of the row's memo, since the broad
//   reason it belongs to is the row's type instead. Null is sent rather than an empty string: the
//   route takes a null memo, and an empty box is not a note.
function otherMemoValue() {
    const memo = otherMemo?.value?.trim() ?? '';

    return memo === '' ? null : memo;
}

// Input: none — it reads the page's own boxes and button, sessionStorage and the session cookie.
// Output: none — the Next button is left live or grey, and the one status line says what the
//   checks answered, naming the students the transaction would be for.
// Action: refuses to go on with no student confirmed on transaction1.html — on the admin's pages
//   alone; otherwise asks the flow's own gate (flowPermission: the student read on a student's own
//   page, the admin probe on every other) and, once it was granted, invites the transaction to be
//   typed in — naming the account it is for, the whole pick on the admin's pages and the one
//   student behind the session cookie on their own.
// Role: the boot of the six Other pages (transaction-other.html and its
//   transaction_student_other.html twin), the type with no list behind it — the same two checks the
//   reason pages make as they load, and what stops this type being opened straight from the URL with
//   nobody behind it. On a student's own page there is no stored pick to look for: the read the gate
//   makes is the check, because it both names the account and proves the session.
async function openOtherPage() {
    if (!otherAmount) return; // every other page loads app.js for its own form only

    // A transaction on the admin's pages is only ever for a student confirmed on transaction1.html,
    // so without one the boxes and the Next button stay switched off and the status line says where
    // to go. This is what stops this type being opened straight from the URL with nobody behind it.
    // A student's own page has no such pick to look for: the gate below is asked instead, and it is
    // the read that names the account.
    if (!STUDENT_FLOW && !sessionStorage.getItem(STUDENT_KEY)) {
        setOtherEnabled(false);
        showOtherMessage('No student was confirmed by the backend — go back to the transaction page and enter a username that exists.', true);
        return;
    }

    setOtherEnabled(false);

    const check = await flowPermission();
    setOtherEnabled(check.granted);

    // Who the transaction is for is the one thing neither box can say, so the line
    // names the account along with the invitation - every student transaction1.html
    // confirmed, because the row is written for each of them, and the one student the
    // backend named for this browser on a student's own page, where the row is theirs.
    const students = selectedStudents();
    const forStudents = students.length ? ` for ${nameList(students)}` : '';
    const each = students.length > 1 ? ` — one row each` : '';
    const nextStep = check.granted
        ? ` Type the amount, the broad reason and, if it is worth remembering, a memo${forStudents}${each}, then press Next.`
        : '';

    showOtherMessage(`${check.text}${nextStep}`, check.isError);
}

// Input: none — it reads the page's own amount and reason boxes, and sessionStorage.
// Output: none — the approval is run, and everything it has to say is written on the status line.
// Action: refuses a page without the amount box, refuses a click the button's own state says is
//   not live (otherEnabled) and a second approval while one is running (approvalRunning), and
//   otherwise runs runOtherApproval(); the flag is cleared however that ended.
// Role: the Other page's Next — the outer half of that approval, one at a time like the reason
//   pages' and the same shape as theirs: the backend is asked for admin powers once more, and the
//   Y/N question stands between the choice and the write.
async function approveOther() {
    if (!otherAmount || !otherEnabled || approvalRunning) return;

    approvalRunning = true;

    try {
        await runOtherApproval();
    } finally {
        approvalRunning = false;
    }
}

// Input: none — it reads the Other page's reason, amount, memo and date boxes, and
//   sessionStorage.
// Output: none — the row is written, or the status line (and Next's state) says why it was not.
// Action: refuses an empty reason and an amount that is not a whole number of points; refuses a
//   date box holding no whole day; re-asks the flow's own gate (flowPermission); builds the row —
//   type the broad reason with its figure (amountLabel), the sign the box holds, the memo box or
//   null, and the flow's own students (selectedStudents) — asks the Y/N question about that object,
//   and on Y sends it (sendTransaction), greying Next once it is written and handing the browser back
//   to the flow's own hub (FLOW_HOME_URL).
// Role: the approval itself, behind approveOther() — split out so the one-at-a-time flag covers every
//   way out of it: written, refused, unanswered or off the network. This is the one type with no list
//   behind it: the amount, the reason and the memo are all typed. It is the same function on an
//   admin's page and on a student's own, like the reason pages' runApproval().
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
    const check = await flowPermission();

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
        showOtherMessage(`Nothing was ${WRITE_WORD} — the "${transaction.label}" transaction${forStudent} was not confirmed with Y.`, true);
        return;
    }

    const sent = await sendTransaction(transaction);

    if (sent.ok) {
        // Written once is written: Next goes grey until a box changes, so a second
        // Enter or click cannot write the same transaction twice.
        setOtherEnabled(false);
        showOtherMessage(recordedMessage(transaction), false);
        redirectHomeAfter(REDIRECT_DELAY_MS, FLOW_HOME_URL);
        return;
    }

    showOtherMessage(sent.text, true);

    // A send that did not go through leaves Next live, so the same choice can be tried
    // again.
    setOtherEnabled(true);
}

// Input: the input event of any box inside the Other page's form — the amount, the reason or the
//   memo.
// Output: none.
// Action: brings the Next button back when both the amount box and the reason box hold something.
// Role: the Other page's own undo of the grey a recorded or refused transaction left on Next:
//   editing the boxes is a different transaction, so the same click can be made again — and both
//   boxes have to hold something for that, because neither half alone can be written.
otherForm?.addEventListener('input', function () {
    if (otherAmount?.value.trim() && otherReason?.value.trim()) {
        setOtherEnabled(true);
    }
});

// Input: the submit event of the Other page's form — its Next button, or Enter inside one of its
//   boxes.
// Output: none.
// Action: stops the browser's own submit and hands the work to approveOther().
// Role: Next is a submit button so that Enter inside a box works too, and a form that asks to be
//   submitted is answered here: nothing may leave this page as a query string.
otherForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    approveOther();
});

// Input: none — the boot runs as this file is read on the Other page.
// Output: none — openOtherPage() does everything, on the page's own status line.
// Action: calls openOtherPage() once, as the page loads.
// Role: the boot of transaction-other.html; every other page loads this file for its own form,
//   and the call returns at once there, there being no amount box to fill.
openOtherPage();

// Input: none — the boot runs as this file is read on the remove page.
// Output: none — openRemovePage() does everything, on the page's own status line.
// Action: calls openRemovePage() once, as the page loads.
// Role: the boot of remove.html — its one line down here rather than at the foot of its own
//   section above because the check it starts with is the shared checkAdminPermission, and the
//   ADMIN_CHECK_URL that reads is declared this far down: a const cannot be read before the line
//   that declares it, and the whole file is read before anything is asked. The boot calls above
//   find none of their own elements on remove.html and start nothing, so this last line is the
//   only one with work to do there.
openRemovePage();

// ----------------------------------------- approve transactions page --------
// approve_transactions.html, the page behind the hub's "Approve transactions" door: the
// transactions students have asked for, one row each, waiting for the admin to answer.
// A row reads the way the sketch draws it — the student it is for, the day it names, the
// type it is filed under, the amount and the memo, then the balance that account ended on —
// with Approve and Decline at the end of it, and the whole list runs from the oldest
// submission to the newest.
//
// Three routes stand behind the page:
//   GET  /getsubmittransaction     -> every transaction waiting to be approved. It is the
//                                     route the backend has yet to answer: it is not in
//                                     https://api.rongrongwu.com/openapi.json and the API
//                                     answers 404 {"detail": "Not Found"} to it (checked
//                                     live), which is the sentence this page's status line
//                                     writes until it is there. Its reply is read the way
//                                     every other untyped route in this project is read
//                                     (see SUBMITTED_STUDENT_KEYS below).
//   POST /removesubmittransaction  -> takes one submission off that list, named by its id,
//                                     which is the one field POST /remove is written with
//                                     ({"id": 5}, read off openapi.json). The name is this
//                                     page's own reading of the read above: the same
//                                     single-word spelling, wearing the "remove" its sibling
//                                     /remove wears. No other line in the app spells it, so
//                                     a backend that answers under another name is one line
//                                     to change here.
//   POST /transaction-record       -> the add-transaction route, and the whole of what
//                                     approving means: the row the submission asked for is
//                                     written into the transaction table with the five fields
//                                     the reason pages write (transactionBody), so the
//                                     submission's own figure is filed under its own type and
//                                     dated its own day. Nothing about it is re-priced here —
//                                     the sign on the amount is the submission's, the way the
//                                     admin's own sign is the Other page's.
const SUBMITTED_URL = `${API_ORIGIN}/getsubmittransaction`;
const SUBMITTED_DECLINE_URL = `${API_ORIGIN}/removesubmittransaction`;

// The names a submitted transaction is likely to carry its own fields under, most likely
// first. The read is untyped — no schema for it exists yet — so each field is asked for by
// every name it could plausibly wear rather than trusted to one, the way the students page
// reads an account and the history page reads a transaction. The student comes first because
// the row's first value is the student; the balance is the backend's own figure for the
// account the row would end on, drawn as it came and never sent back (a change does not send
// it either — it is the backend's to work out).
const SUBMITTED_STUDENT_KEYS = ['user', 'student', 'username', 'name'];
const SUBMITTED_DATE_KEYS = ['date', 'created_at', 'timestamp', 'time'];
const SUBMITTED_TYPE_KEYS = ['type', 'category', 'kind'];
const SUBMITTED_AMOUNT_KEYS = ['amount', 'bonura_bucks', 'value', 'points'];
const SUBMITTED_MEMO_KEYS = ['memo', 'note', 'notes'];
const SUBMITTED_BALANCE_KEYS = ['ending_balance', 'balance_after', 'end_balance', 'balance'];

// The submission's own id: what POST /removesubmittransaction names the row it takes away by,
// the way POST /remove names a transaction. Only unambiguous names for an identifier are
// read, and nothing is guessed at — reading some other field as an id would point a decline
// at the wrong row, while reading none only means the row cannot be declined, which is the
// safe half of the two. An id of 0 is an id like any other: the value is asked for being
// present, not for being true.
const SUBMITTED_ID_KEYS = ['id', 'transaction_id', 'submit_id'];

// The six values a row draws, in the order the sketch reads them, each with the word a screen
// reader is given for it (the six are never named on screen — the bars between the values are
// the whole of what the eye gets). field is the name submissionFields collects the value under;
// className is the one a value needs a rule of its own for (the stamp that may not wrap, the two
// figures), and numeric marks the two figures, which is what lets a minus stand in the red a pale
// surface carries. Every other value is a plain .approvals__value, so no class is written into
// the page that nothing draws.
const SUBMITTED_LINE = [
    { field: 'student', label: 'Student' },
    { field: 'date', label: 'Date', className: 'approvals__value--date' },
    { field: 'type', label: 'Type' },
    { field: 'amount', label: 'Amount', className: 'approvals__value--amount', numeric: true },
    { field: 'memo', label: 'Memo' },
    { field: 'balance', label: 'Ending balance', className: 'approvals__value--balance', numeric: true }
];

// The shapes a submitted row's day may arrive in — the very reader the history page's own Date
// column is re-cut with (STAMP in transactionview.js), for the same value and the same reason:
// the day in three parts behind either separator, the ISO one this app writes itself and the
// slash the backend stamps its transactions with, and, when the row carries one, a clock of two
// parts behind a T, a space or a slash. Minutes may be followed by seconds the row does not
// show, and by the timezone the backend stamped the day in; both are read past rather than
// drawn, and half a date is no date at all — the pattern is anchored at both ends, because a
// day left behind in a row would be worse than one drawn in a shape nobody planned.
const SUBMITTED_STAMP = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T/ ](\d{2})[:/](\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// Input: payload — the parsed body of a GET /getsubmittransaction answer, in any shape that route
//   may answer with.
// Output: the transaction records as an array, each of them an object.
// Action: filters an array, walks the wrapper keys (transactions, submissions, records, data,
//   items) and otherwise answers the whole payload as a one-row list.
// Role: the shape-finding reader of the approvals page, reading an untyped list the way
//   studentEntries and the history page's reader do:
//   [{...}, …]                                                    -> used as is
//   {"transactions": […]}, {"submissions": […]}, {"records": […]},
//   {"data": […]}, {"items": […]}                                 -> the inner list
//   {…}                                                           -> wrapped in an array
//   null / undefined / ""                                         -> []
//   Only objects count as rows: a transaction is a set of fields, so a bare string cannot be one,
//   and anything else is dropped rather than drawn as a row of dashes.
function submissionRecords(payload) {
    if (Array.isArray(payload)) {
        return payload.filter(isSubmissionRecord);
    }

    if (payload === null || payload === undefined || payload === '' || typeof payload !== 'object') {
        return [];
    }

    for (const key of ['transactions', 'submissions', 'records', 'data', 'items']) {
        const nested = payload[key];

        if (Array.isArray(nested)) {
            return nested.filter(isSubmissionRecord);
        }

        if (nested && typeof nested === 'object') {
            return submissionRecords(nested);
        }
    }

    return [payload];
}

// Input: entry — one element of a GET /getsubmittransaction answer.
// Output: true when it could be a transaction record, false for everything else.
// Action: asks whether it is a non-null object, and nothing more.
// Role: the one test behind submissionRecords() — a transaction is a set of fields, so a bare
//   string or a null is dropped rather than drawn as a row of dashes, while no field name is
//   required here, which names the route uses being submissionFields()' business.
function isSubmissionRecord(entry) {
    return entry !== null && typeof entry === 'object';
}

// Input: value — a submitted row's day, in whatever shape the backend sent it.
// Output: the day in the shape the history page's Date column names — YYYY/MM/DD HH:mm, as in
//   2026/09/29 16:17 — or null when the value is no whole day.
// Action: matches the value against SUBMITTED_STAMP and re-cuts the parts it found.
// Role: the day of one submitted row, re-cut for three reasons: it is the shape every other date
//   in this app is shown in, it is the shape the row is written with when the submission is
//   approved (submissionTransaction), and its fixed width and leading zeros are what make two
//   stamps comparable as text (rankSubmissionRows). A day with no clock reading on it keeps the
//   two parts it has — the time of day is the backend's to send, and a time nobody recorded is
//   not invented.
function submissionStamp(value) {
    const parts = SUBMITTED_STAMP.exec(String(value).trim());

    if (!parts) {
        return null;
    }

    return `${parts[1]}/${parts[2]}/${parts[3]} ${parts[4] || '00'}:${parts[5] || '00'}`;
}

// Input: record — one transaction of a GET /getsubmittransaction reply, as the backend sent it.
// Output: { student, date, stamp, type, amount, memo, balance, id } — the six values the row draws
//   (the day as it came, and the stamp it could be re-cut into, which is null when it could not),
//   plus the id a decline names the row by; every one of them null where the backend sent nothing.
// Action: asks firstField() for each field group in turn (SUBMITTED_*_KEYS), writes the values it
//   found as strings except the two figures, which are kept as they came, and re-cuts the day
//   with submissionStamp().
// Role: the one read of a submitted record — the row is drawn from this object, the question asked
//   before a write names it, the body the row is written with is built from it, and the sentence
//   the status line shows afterwards names it again. Reading the record once is what keeps those
//   four from disagreeing about what the submission said.
function submissionFields(record) {
    const student = firstField(record, SUBMITTED_STUDENT_KEYS);
    const date = firstField(record, SUBMITTED_DATE_KEYS);
    const type = firstField(record, SUBMITTED_TYPE_KEYS);
    const amount = firstField(record, SUBMITTED_AMOUNT_KEYS);
    const memo = firstField(record, SUBMITTED_MEMO_KEYS);
    const balance = firstField(record, SUBMITTED_BALANCE_KEYS);

    return {
        student: student === null ? null : String(student),
        date: date === null ? null : String(date),
        // the same day re-cut into the shape a row is written and drawn in, or null when the
        // value is no whole day — the value as it came is kept beside it, and is what is drawn
        // and sent in that case, rather than a day nobody could read
        stamp: submissionStamp(date),
        type: type === null ? null : String(type),
        amount: amount === null ? null : amount,
        memo: memo === null ? null : String(memo),
        balance: balance === null ? null : balance,
        id: firstField(record, SUBMITTED_ID_KEYS)
    };
}

// Input: fields — one submission as submissionFields() read it; column — one entry of
//   SUBMITTED_LINE, naming the field and the word a screen reader is given for it.
// Output: that value as the text the row draws: the re-cut day for the date column, the value as
//   it came for any other, and a dash (ROSTER_EMPTY_CELL) when the backend sent nothing at all.
// Action: reads the named field and, for the date column, prefers the re-cut stamp over the value
//   as it came.
// Role: the value half of one cell of the approvals page, drawing a missing value the way the
//   history table draws its own cells — a dash rather than a blank or an "undefined" the admin has
//   to read past.
function submissionText(fields, column) {
    const value = fields[column.field];

    if (value === null) {
        return ROSTER_EMPTY_CELL;
    }

    return column.field === 'date' ? (fields.stamp ?? String(value)) : String(value);
}

// Input: rows — the submissions as submissionFields() left them, each with its stamp or null.
// Output: the same array, the oldest submission first.
// Action: sorts on the re-cut stamp as plain text, and answers 1 for a row with no stamp, so it
//   stands after every row that has one.
// Role: the order of the approvals list — a queue is answered in the order it formed, so the
//   request that has been waiting longest is the one at the top. The stamp's fixed width and
//   leading zeros make a later day and a later clock reading sort after an earlier one as text; a
//   row the backend sent no readable day for has nothing to be placed by and does not belong at
//   the head of the list; and the sort is stable, so the order the backend answered in decides
//   between two rows of the same minute.
function rankSubmissionRows(rows) {
    rows.sort((a, b) => {
        if (a.stamp === null) return b.stamp === null ? 0 : 1;
        if (b.stamp === null) return -1;

        return a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0;
    });

    return rows;
}

// The list and the line above it. approve_transactions.html is the only page that carries
// these elements — every other page loads app.js for its own form — so a read only ever starts
// where there is a list to put an answer in, and the boot at the foot of this section starts
// nothing anywhere else.
const approvalsStatus = document.getElementById('approvalsstatus');
const approvalsList = document.getElementById('approvalslist');
const approvalsStamp = document.getElementById('approvalsstamp');
const approvalsRefreshButton = document.getElementById('approvalsrefresh');

// Every button the list holds, so the whole list can be greyed while a read or an action is on
// its way — the attribute styles.css greys .btn with, the same rule the students page's
// Refresh follows. The list is drawn again from scratch on every read, so this is emptied as
// the rows go.
let approvalButtons = [];

// One read at a time, and one action at a time: a Refresh pressed while a slow answer is still
// on its way must not pile a second read up behind the first, and an Approve pressed twice must
// not write the same row twice. Neither is started while the other is running either, so the
// list is never drawn again under a row that is being written or declined.
let submissionsReadRunning = false;
let submissionActionRunning = false;

// Input: text — the sentence to show; isError, whether it is a refusal rather than a result.
// Output: none — the block is emptied and the one paragraph put in it.
// Action: builds a paragraph, gives it the red .results__error class when isError, and swaps it
//   in with replaceChildren(); a page without the block is left alone.
// Role: the status line of the approvals page — where the list's own read (readSubmissions) and
//   every answer to an Approve or a Decline are said, in the same one-paragraph shape every other
//   page's show*Message writes into its own block.
function showApprovalsMessage(text, isError) {
    if (!approvalsStatus) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    approvalsStatus.replaceChildren(paragraph);
}

// Input: enabled — true to make every Approve and Decline live, false to grey them out.
// Output: none — each of the list's buttons has its aria-disabled attribute set or cleared.
// Action: walks approvalButtons and adds or removes that one attribute.
// Role: the whole approvals list's switch, greyed while a read or an action is on its way — the
//   attribute styles.css greys .btn with, the same state the students page's Refresh wears. The
//   attribute is what the eye and the mouse see and what stops the click; the running flags
//   (submissionsReadRunning, submissionActionRunning) are what the handlers are checked against,
//   because a button is reachable by Tab whatever it looks like.
function setApprovalsEnabled(enabled) {
    for (const button of approvalButtons) {
        if (enabled) {
            button.removeAttribute('aria-disabled');
        } else {
            button.setAttribute('aria-disabled', 'true');
        }
    }
}

// Input: label — the text on the button ("Approve" or "Decline"); variant — the .btn class it
//   wears (btn--primary for Approve, btn--danger for Decline).
// Output: the <button> element.
// Action: builds a type="button" node with the app's own .btn classes and the label as its text;
//   the row wires its own click listener to it afterwards.
// Role: one of the two answers a submitted row ends with on the approvals page. Both are ordinary
//   .btn buttons, so they look and behave like every other button in the app: Approve is the
//   filled ink one that takes the row further in, Decline the red the app draws a refusal in.
function approvalButton(label, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${variant}`;
    button.textContent = label;

    return button;
}

// Input: fields — one submission as submissionFields() read it: the six values, the re-cut stamp
//   and the id.
// Output: the <li> the approvals list is made of — one row of values with the pair of buttons that
//   answer it at the end.
// Action: builds one <span> per SUBMITTED_LINE column, each carrying its own sr-only word (the six
//   words are never drawn — the bar between two values is the whole of what the eye gets), marks a
//   figure below zero in the red as well as with its own sign, and wires Approve and Decline to
//   approveSubmission() and declineSubmission().
// Role: one row of the approvals page, drawn from the record's own fields object, which its two
//   buttons close over — so an Approve is about the very submission the row was drawn from and not
//   about the values as they happen to read.
function submissionLine(fields) {
    const item = document.createElement('li');
    item.className = 'approvals__item';

    const line = document.createElement('p');
    line.className = 'approvals__line';

    for (const column of SUBMITTED_LINE) {
        const classes = ['approvals__value'];

        if (column.className) {
            classes.push(column.className);
        }

        // a figure below zero takes the red as well as its own sign: the figure itself carries
        // the minus, so nothing else has to say which way the account moved
        if (column.numeric && Number(fields[column.field]) < 0) {
            classes.push('approvals__value--negative');
        }

        const value = document.createElement('span');
        value.className = classes.join(' ');

        // The six words are never drawn — the bar between two values is the whole of what the
        // eye gets — so each value carries its own word for a screen reader, which is what
        // makes a row read as "Student: Venus Wu, Date: …, Amount: …" rather than as a string
        // of values nobody could tell apart.
        const label = document.createElement('span');
        label.className = 'sr-only';
        label.textContent = `${column.label}: `;

        value.append(label, submissionText(fields, column));
        line.append(value);
    }

    const actions = document.createElement('div');
    actions.className = 'approvals__actions';

    const approve = approvalButton('Approve', 'btn--primary');
    // Input: the click on this row's Approve button.
    // Output: none.
    // Action: hands the row's own fields, the row and the button to approveSubmission().
    // Role: what makes this row's Approve about the very submission the row was drawn from, rather
    //   than about the values as they happen to read.
    approve.addEventListener('click', function () {
        approveSubmission(fields, item, approve);
    });

    const decline = approvalButton('Decline', 'btn--danger');

    // Input: the click on this row's Decline button.
    // Output: none.
    // Action: hands the row's own fields, the row and the button to declineSubmission().
    // Role: the same for the row's Decline — the fields are the row's own, so a decline names the
    //   very submission the row was drawn from.
    decline.addEventListener('click', function () {
        declineSubmission(fields, item, decline);
    });

    actions.append(approve, decline);
    item.append(line, actions);

    return item;
}

// Input: rows — the submissions as rankSubmissionRows() ordered them.
// Output: none — #approvalslist is emptied and given one row per submission and shown, and the
//   buttons of every row are collected in approvalButtons; the count is logged.
// Action: builds every row with submissionLine(), gathers each row's two buttons, and swaps the
//   lot in with replaceChildren().
// Role: how the approvals page draws what it read — one row per submission, oldest first. Every
//   value is built as a node rather than with innerHTML, because the words come from the backend,
//   and the buttons are collected so that a read or an action can grey the whole list at once
//   (setApprovalsEnabled).
function drawSubmissions(rows) {
    const body = document.createDocumentFragment();
    const buttons = [];

    for (const fields of rows) {
        const item = submissionLine(fields);
        buttons.push(...item.children[1].children);
        body.append(item);
    }

    approvalsList.replaceChildren(body);
    approvalsList.hidden = false;
    approvalButtons = buttons;

    console.log(`Listed ${rows.length} transaction(s) waiting to be approved.`, rows);
}

// Input: none.
// Output: none — the list's rows are dropped, the list is hidden and approvalButtons is emptied.
// Action: empties #approvalslist, hides it, and forgets the buttons it held.
// Role: what every failed or empty read of the approvals page does before it says so on the
//   status line: a read that failed or came back empty must not leave the rows of the read before
//   standing as if they were current.
function clearSubmissions() {
    approvalsList?.replaceChildren();
    approvalButtons = [];

    if (approvalsList) {
        approvalsList.hidden = true;
    }
}

// Input: none.
// Output: none — #approvalsstamp is given the clock reading of the read that has just finished.
// Action: writes "Last read at <local time>" into the element; a page without it is left alone.
// Role: the small print beside the approvals page's Refresh button, saying how fresh the list is.
//   It stands outside the live region, so a clock written there on every read is not read out to
//   a screen reader.
function stampSubmissions() {
    if (!approvalsStamp) return;

    approvalsStamp.textContent = `Last read at ${new Date().toLocaleTimeString()}.`;
}

// Input: none — it reads the page's own list elements and the session cookie.
// Output: none — the rows are drawn, or the list is emptied and the status line says what came
//   back.
// Action: GETs /getsubmittransaction with the session cookie; on a failure it drops the rows and
//   says what the backend answered, naming the route when the answer is the API's 404 and saying
//   where to log in on a 401; on an empty list it says there is nothing waiting; otherwise it
//   reads every record once (submissionFields), orders them oldest first (rankSubmissionRows) and
//   draws them (drawSubmissions).
// Role: the approvals page's own read, started as the page opens, by Refresh, and when the tab
//   comes back to the front. It is the students page's read one route shorter — one read at a
//   time, a line while it is on its way, and a sentence that says what came back — and it asks
//   the backend as it stands: GET /getsubmittransaction is a route the API does not answer yet,
//   and its 404 is said in the API's own words, with what the page asked for, rather than dressed
//   up as something the page did wrong.
async function readSubmissions() {
    if (!approvalsList) return; // every other page loads app.js for its own form
    if (submissionsReadRunning) return;

    // A row being written or declined is a row this read would draw back under it — the write
    // takes its row off the page when the backend has answered, and a read in between would put
    // it back — so the list is left exactly as it is until the action is done.
    if (submissionActionRunning) return;

    submissionsReadRunning = true;
    setApprovalsEnabled(false);
    approvalsRefreshButton?.setAttribute('aria-disabled', 'true'); // one read at a time
    showApprovalsMessage('Asking the backend which transactions are waiting to be approved…', false);

    try {
        const response = await fetch(SUBMITTED_URL, {
            method: 'GET',
            credentials: 'include'
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Approvals read error:', response.status, result);
            clearSubmissions();

            // The route answers "Not logged in" to a browser with no admin session, the way
            // every protected route in the API does, and that is a sentence the admin can act
            // on rather than a fault of the page's.
            if (response.status === 401) {
                showApprovalsMessage('Not logged in — the backend refused the request. Log into the admin account first.', true);
                return;
            }

            showApprovalsMessage(
                `The backend could not list the transactions waiting to be approved (${response.status}): ${describeError(result)}`
                + (response.status === 404
                    ? ' — the page asks GET /getsubmittransaction for them, which is the route the API has not been given yet, so there is nothing to approve until it answers.'
                    : ''),
                true
            );
            return;
        }

        const records = submissionRecords(result);

        if (!records.length) {
            clearSubmissions();
            showApprovalsMessage('The backend lists no transaction waiting to be approved — every submission it holds has been answered.', false);
            return;
        }

        // One fields object per record, then the queue in order: every value the page draws,
        // asks about and writes comes from these, so a record is read once and the row, the
        // question and the request cannot disagree about what the submission said.
        const rows = rankSubmissionRows(records.map(submissionFields));

        drawSubmissions(rows);
        showApprovalsMessage(
            `The ${rows.length} transaction${rows.length === 1 ? '' : 's'} waiting to be approved, oldest first — the student each one is for, the day it names, the type it is filed under, the amount and the memo, then the balance its account would reach.`
            + ' Approve writes the row into the transaction table; Decline takes it off this list.',
            false
        );
    } catch (error) {
        console.error('Approvals read error:', error);
        clearSubmissions();
        showApprovalsMessage('Network error — the transactions waiting to be approved could not be read from the API. Press Refresh to read them again.', true);
    } finally {
        submissionsReadRunning = false;
        setApprovalsEnabled(true);
        approvalsRefreshButton?.removeAttribute('aria-disabled');
        stampSubmissions();
    }
}

// The question the Decline button asks, in the shape the Approve button's question is written
// in — one heading, one sentence, answered with Y and N.
const DECLINE_QUESTION = 'confirm decline transaction, Y/N';

// Input: fields — one submission as submissionFields() read it.
// Output: the transaction object in the shape the reason pages build theirs in — students (the one
//   account this submission names, or []), type, amount, date, memo and a label that is null on
//   purpose.
// Action: wraps the student in a one-name list, passes the type, the amount and the memo on as
//   they were submitted, and files the day as the re-cut stamp when there is one, the value as it
//   came when there is not, and null when the submission names no day at all — which the route
//   takes and stamps itself.
// Role: the bridge between a submission and the transaction this app writes: the same five fields
//   the reason pages build (transactionBody), so approving files the submission's own figure under
//   its own type and dated its own day. The sign on the amount is the submission's own, the way
//   the admin's own sign is the Other page's, and the label is null because there is no list here
//   to name a reason from — nothing is quoted that the submission did not say.
function submissionTransaction(fields) {
    return {
        students: fields.student === null ? [] : [fields.student],
        type: fields.type ?? '',
        amount: fields.amount,
        date: fields.stamp ?? fields.date,
        memo: fields.memo,
        label: null
    };
}

// Input: fields — one submission as submissionFields() read it.
// Output: the submission in a sentence: the type it is filed under, the figure it asks for, the
//   account it is for and the day it names (as the re-cut stamp where there is one).
// Action: builds those four pieces, dropping each one the backend sent nothing for, and joins what
//   is left.
// Role: the one way a submission becomes words — a row in front of the admin and a sentence about
//   that row cannot describe two different things, both coming from the same fields object. A
//   value the backend did not send is left out of the sentence rather than spelled there as a dash.
function submissionWords(fields) {
    const head = fields.type === null ? 'The submission' : `The “${fields.type}” submission`;
    const amount = fields.amount === null
        ? ''
        : ` of ${fields.amount} ${Math.abs(Number(fields.amount)) === 1 ? 'pt' : 'pts'}`;
    const student = fields.student === null ? '' : ` for ${fields.student}`;
    const date = fields.stamp ?? fields.date;
    const day = date === null ? '' : `, dated ${date}`;

    return `${head}${amount}${student}${day}`;
}

// Input: fields — one submission as submissionFields() read it.
// Output: the sentence the decline question shows under its heading.
// Action: builds it from submissionWords() and appends what each answer does to the submission.
// Role: the body of the Decline question — the shape remove.html's question is written in, with a
//   decline in place of a removal: the submission the row draws, said in words, and the sentence
//   that says this app has no undo.
function describeDecline(fields) {
    return `${submissionWords(fields)}, will be taken off the approvals list, and this app has no undo.`
        + ' Y declines it and it is off the list for good, N leaves it waiting.';
}

// Input: fields — one submission as submissionFields() read it; line — the row drawn from it.
// Output: none — the row is written and the status line says what came of it.
// Action: refuses a submission naming nobody, there being no account to put the row on and the
//   backend's own `user` being a required field; re-asks the backend for admin powers at the last
//   moment before the row leaves; sends it through writeTransaction(transactionBody(...)), the one
//   body POST /transaction-record is written with; and takes the row off the page once it is
//   written.
// Role: what the Approve button does — the write half of the approvals page. The row the
//   submission asked for goes into the transaction table through the add-transaction route the
//   reason pages write through, one row for the one account this submission names. The row leaves
//   the page the moment the backend has written it, a row left standing being a row that can be
//   approved twice and this app having no undo; the submission on the backend's own list is the
//   backend's to take away, and the sentence does not claim it has.
async function writeApprovedSubmission(fields, line) {
    const transaction = submissionTransaction(fields);
    const words = submissionWords(fields);

    // A submission naming nobody is refused rather than sent as a row for an empty username:
    // there is no account to put the row on, and the backend's own `user` is a required field.
    if (!transaction.students.length) {
        showApprovalsMessage('Nothing was recorded — this submission names no student, so there is no account to write the row to.', true);
        return;
    }

    const check = await checkAdminPermission();

    if (!check.granted) {
        showApprovalsMessage(`Nothing was recorded — ${check.text}`, true);
        return;
    }

    const answer = await writeTransaction(transactionBody(transaction, transaction.students[0]));

    if (!answer.ok) {
        console.error('Approve error:', answer);
        showApprovalsMessage(`Nothing was recorded — ${answer.text}.`, true);
        return;
    }

    // The row comes off the page the moment the backend has written it, because a row left
    // standing is a row that can be approved twice and this app has no undo. The submission on
    // the backend's own list is the backend's to take away, and the sentence does not claim it
    // has: Refresh asks for the list again, and a submission the backend has not taken off its
    // list comes back with it.
    line?.remove();

    showApprovalsMessage(
        `Recorded ${words} — the backend wrote the ${transaction.type} transaction into the transaction table (POST /transaction-record), and the row is off this page so it cannot be approved twice.`
        + ' Refresh asks the backend for the list again.',
        false
    );
}

// Input: fields — one submission as submissionFields() read it; line — the row drawn from it.
// Output: none — the submission is taken off the list and the status line says what came of it.
// Action: refuses a row the backend sent no id for, the route naming the row it is to take away
//   and there being nothing to ask without one; re-asks the backend for admin powers at the last
//   moment; POSTs { id } as JSON to SUBMITTED_DECLINE_URL with the session cookie; and takes the
//   row off the page once the backend has answered 200.
// Role: what the Decline button does — the other half of the approvals page, and the same one-field
//   body POST /remove takes a transaction away with. The button stands on every row, so every row
//   ends the same way, saying the one thing that is missing when there is no id to name.
async function removeSubmission(fields, line) {
    const words = submissionWords(fields);

    if (fields.id === null) {
        showApprovalsMessage(`Nothing was declined — ${words} carries no id, and the request that takes a submission away names the row by its id: there is nothing to ask the backend about.`, true);
        return;
    }

    const check = await checkAdminPermission();

    if (!check.granted) {
        showApprovalsMessage(`Nothing was declined — ${check.text}`, true);
        return;
    }

    const body = { id: fields.id };
    console.log('Declining:', body);

    try {
        const response = await fetch(SUBMITTED_DECLINE_URL, {
            method: 'POST',
            credentials: 'include', // carry the admin session cookie along
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // A refusal can answer with something that is not JSON, so the body is read once and
        // never trusted to parse.
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Decline error:', response.status, result);
            showApprovalsMessage(`Nothing was declined — the backend refused the request (${response.status}): ${describeError(result)}`, true);
            return;
        }

        line?.remove();

        showApprovalsMessage(
            `Declined — ${words} was taken off the list (POST /removesubmittransaction answered ${response.status}), and the row is off this page.`
            + ' Refresh asks the backend for the list again.',
            false
        );
    } catch (error) {
        console.error('Decline error:', error);
        showApprovalsMessage(`Network error — ${words} could not be declined: the API could not be reached. Press Decline again, or Refresh to read the list afresh.`, true);
    }
}

// Input: fields — one submission as submissionFields() read it; line — the row drawn from it;
//   button — the Approve button the question was asked from, so the keyboard can go back to it.
// Output: none — the row is written and the status line says what came of it; a question answered
//   with N writes nothing.
// Action: refuses a second action while one is running and a read in flight; greys the whole list;
//   puts the Y/N question up about submissionTransaction(fields) — the very object the write will
//   carry — and on Y runs writeApprovedSubmission(); the list is brought back however it ended.
// Role: the Approve button of the approvals page. Approving writes a transaction and this app has
//   no undo, so every approve is asked about first, and one action runs at a time: a second button
//   pressed while the question is up would only put the same question up again, one click being
//   one answer.
async function approveSubmission(fields, line, button) {
    if (submissionActionRunning) return;
    if (submissionsReadRunning) return; // a read in flight is about to draw this list again

    submissionActionRunning = true;
    setApprovalsEnabled(false);

    try {
        const confirmed = await askConfirmation(
            CONFIRM_QUESTION,
            describeTransaction(submissionTransaction(fields)),
            { returnFocus: button }
        );

        if (!confirmed) {
            showApprovalsMessage(`Nothing was recorded — ${submissionWords(fields)} was not confirmed with Y.`, true);
            return;
        }

        await writeApprovedSubmission(fields, line);
    } finally {
        submissionActionRunning = false;
        setApprovalsEnabled(true);
    }
}

// Input: fields — one submission as submissionFields() read it; line — the row drawn from it;
//   button — the Decline button the question was asked from, so the keyboard can go back to it.
// Output: none — the submission is taken off the list, or the status line says it was not
//   confirmed.
// Action: refuses a second action while one is running and a read in flight; greys the whole list;
//   puts the question up (DECLINE_QUESTION, describeDecline, Y drawn as the red the app refuses
//   with) and on Y runs removeSubmission(); the list is brought back however it ended.
// Role: the Decline button of the approvals page, asked about the same way an approve is, with a
//   heading of its own: the answer that takes the submission off the list is the one that cannot be
//   undone, which is why Y wears the refusal's colour here and not the ink. The whole list is
//   greyed for as long as the answer takes, so the row being worked on is plain to see.
async function declineSubmission(fields, line, button) {
    if (submissionActionRunning) return;
    if (submissionsReadRunning) return; // a read in flight is about to draw this list again

    submissionActionRunning = true;
    setApprovalsEnabled(false);

    try {
        const confirmed = await askConfirmation(DECLINE_QUESTION, describeDecline(fields), {
            returnFocus: button,
            danger: true
        });

        if (!confirmed) {
            showApprovalsMessage(`Nothing was declined — ${submissionWords(fields)} was not confirmed with Y.`, true);
            return;
        }

        await removeSubmission(fields, line);
    } finally {
        submissionActionRunning = false;
        setApprovalsEnabled(true);
    }
}

// Input: none — the boot runs as this file is read on the approvals page.
// Output: none — the list is read at once, and reads itself again on Refresh and when the tab
//   comes back to the front.
// Action: starts readSubmissions(), binds the Refresh button to it, and binds the document's
//   visibilitychange to it.
// Role: the approvals page's boot, the way the students page's table starts itself. The `if` is
//   what keeps every other page — which loads this file for its own form, has no list to fill —
//   from starting anything.
if (approvalsList) {
    readSubmissions();

    approvalsRefreshButton?.addEventListener('click', readSubmissions);

    // Input: the visibilitychange event of the document — this tab coming back to the front.
    // Output: none.
    // Action: reads the list again whenever the tab stops being hidden.
    // Role: the third way the approvals page reads itself, beside the first read as the page opens
    //   and the Refresh button — a submission answered in another tab is off this list when this
    //   tab comes back to the front.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            readSubmissions();
        }
    });
}










