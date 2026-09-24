console.log(document.getElementById("getusersform"));
console.log("loaded")

// 1. Select the form
const form = document.getElementById('adduserform');

// 2. Listen for the submit event
form?.addEventListener('submit', async function(event) {
  // Prevent the default browser behavior (reloading the page)
  event.preventDefault(); 

  // 3. Gather the form data
  const formData = new FormData(form);
  
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

const form1 = document.getElementById('getusersform');

form1?.addEventListener('submit', async function (event) {
    event.preventDefault();
    console.log("hi there")

    const params = new URLSearchParams({
        name: form1.elements.namedItem('name').value.trim(),
        supervisor: form1.elements.namedItem('supervisor').value.trim()
    });

    try {
        const response = await fetch(
            `https://api.rongrongwu.com/getuser?${params}`
        );

        if (!response.ok) {
            console.error('Server error:', await response.text());
            return;
        }

        const users = await response.json();
        const results = document.getElementById('results');
            results.replaceChildren(); // Clear previous results

            if (users.length === 0) {
                results.textContent = 'No users found.';
            }

            for (const user of users) {
                const paragraph = document.createElement('p');

                paragraph.textContent =
                    `Name: ${user.name} | Supervisor: ${user.supervisor}`;

                results.appendChild(paragraph);
            }
    } catch (error) {
        console.error('Network error:', error);
    }
});

const adminForm = document.getElementById('addadminform');

adminForm?.addEventListener('submit', async function (event) {
    event.preventDefault();

    // Validate that the two password fields match before sending anything
    const password = adminForm.elements.namedItem('password').value;
    const retypePassword = adminForm.elements.namedItem('retype_password').value;

    if (password !== retypePassword) {
        alert('Error: Passwords do not match.');
        return;
    }

    const formData = new FormData(adminForm);

    // retype_password is only used for validation, the server only needs password
    formData.delete('retype_password');

    try {
        const response = await fetch('https://api.rongrongwu.com/add-admin', {
            method: 'POST',
            credentials: "include", // Send the admin session cookie, else 401 "Not logged in"
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Success:', result);
            alert('Form submitted successfully!');
        } else {
            console.error('Validation error:', await response.json());
        }
    } catch (error) {
        console.error('Network Error:', error);
    }
});

// Admin login -> POST the form to the API login endpoint.
// POST /login is live and takes admin_name + password (see
// https://api.rongrongwu.com/openapi.json). /adduser and /add-admin answer
// 401 {"detail": "Not logged in"} until this login has stored the session
// cookie, which is why every API call sends credentials: "include".
const LOGIN_URL = 'https://api.rongrongwu.com/login';

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
            showLoginMessage(results, `Logged in as ${formData.get('admin_name')}.`, false);
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

// Home page ------------------------------------------------------------------
// index.html's "Get current admin" button answers one question: which admin is
// this browser signed in as? GET /current-admin is the live route for it (listed
// in https://api.rongrongwu.com/openapi.json), it takes the session cookie, and
// without one it answers 401 {"detail": "Not logged in"} — checked live with
// curl, exactly like the other protected routes. So the request sends
// credentials: "include", the same as the login and add-admin forms above.
const CURRENT_ADMIN_URL = 'https://api.rongrongwu.com/current-admin';

// Fields the reply may carry the admin name in, most likely first — the route is
// untyped, openapi.json only promises an object whose values are strings.
const ADMIN_NAME_KEYS = ['admin_name', 'name', 'admin', 'username'];

const currentAdminButton = document.getElementById('getcurrentadmin');

currentAdminButton?.addEventListener('click', async function () {
    const results = document.getElementById('currentadminresults');

    // A second click while the backend is being asked would only repeat the same
    // question, so the button goes grey and unclickable for the round trip, using
    // the .btn[aria-disabled="true"] state styles.css already styles.
    currentAdminButton.setAttribute('aria-disabled', 'true');
    showCurrentAdminMessage(results, 'Asking the backend which admin is signed in…', false);

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // send the admin session cookie
        });

        // FastAPI replies with JSON for both success and error bodies
        const result = await response.json();

        if (response.ok) {
            console.log('Current admin:', result);
            showCurrentAdminMessage(results, describeCurrentAdmin(result), false);
        } else {
            console.error('Current admin error:', result);
            showCurrentAdminMessage(
                results,
                `No admin session (${response.status}): ${describeError(result)} — log in on the admin login page first.`,
                true
            );
        }
    } catch (error) {
        console.error('Network Error:', error);
        showCurrentAdminMessage(results, 'Network error — the current-admin API could not be reached.', true);
    } finally {
        currentAdminButton.removeAttribute('aria-disabled');
    }
});

// Replace the previous status line under the home page buttons with a single
// message — the same one-paragraph shape showLoginMessage and showReasonMessage
// write into their own blocks.
function showCurrentAdminMessage(results, text, isError) {
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

// Reason pages --------------------------------------------------------------
// transaction_bonus.html, transaction_fines.html, transaction_salaries.html and
// transaction_spending.html each show one dropdown of reasons that comes from the
// backend. Every /reasons/{slug} route answers with the same shape - a plain map
// of name -> points, negatives included:
//   {"Bathroom expectation violation": -10, "Being rude / disrespectful": -15, ...}
// A page says which list it wants with data-reason-type on its <select>, e.g.
// data-reason-type="fines", and the built-in options it ships with stay in place
// whenever the request fails or comes back with nothing usable.
const REASON_SLUGS = {
    bonus: 'bonus-bucks',
    fines: 'bonura-bank-fines',
    salaries: 'job-salaries',
    spending: 'ways-to-spend-bonura-bucks'
};

const REASONS_URL = 'https://api.rongrongwu.com/reasons';

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

// Which reason list this page wants: the type comes from the page itself, the
// slug from the map above, so no page has to know a URL.
const reasonType = reasonSelect?.dataset.reasonType ?? 'bonus';
const reasonSlug = REASON_SLUGS[reasonType];

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

    // {"Birthday Bonus": 100} - the live shape: a name -> points map. Object.keys
    // keeps the backend's order, and the name doubles as the value the option
    // reports, because the name is the key the backend knows.
    return Object.keys(payload).map((name) => ({ id: name, name, points: payload[name] }));
}

// One element of the list -> the { label, value } pair an <option> needs:
//   "Attendance bonus"                                    -> both the same
//   {id: "attendance", name: "Attendance bonus"}           -> label reads nicely,
//                                                            value is the id
//   {id: "Birthday Bonus", name: "Birthday Bonus", points: 100}
//                                                          -> label adds the points
// Answers null when the entry carries nothing worth showing, so fillReasonOptions
// can skip it instead of printing "undefined" into the dropdown.
function reasonEntry(entry) {
    if (entry === null || typeof entry !== 'object') {
        if (entry === undefined || entry === null || entry === '') {
            return null;
        }

        return { label: String(entry), value: String(entry) };
    }

    const name = firstField(entry, REASON_NAME_KEYS);

    if (name === null) {
        return null;
    }

    const label = String(name);
    const points = reasonPoints(entry);
    const id = firstField(entry, ['id']);

    return {
        // Math.abs so a single fine point reads "1 pt", not "1 pts".
        label: points === null ? label : `${label} (${points} ${Math.abs(points) === 1 ? 'pt' : 'pts'})`,
        value: String(id ?? label)
    };
}

function makeOption(value, label, selected) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;

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
            options.push(makeOption(reason.value, reason.label, false));
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
        showReasonMessage(`Unknown reason type "${reasonType}" — check data-reason-type on the <select>.`, true);
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
async function approveReason() {
    if (!reasonSelect) return;

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
    const transaction = {
        student: sessionStorage.getItem(STUDENT_KEY) || '',
        type: reasonType,
        slug: reasonSlug,
        reason: reasonSelect.value,
        label: option ? option.textContent : reasonSelect.value
    };

    // Nothing is sent yet: openapi.json lists only /adduser, /add-admin, /getuser,
    // /login and the /reasons routes, so there is no route that records a
    // transaction. The approved choice is parked in sessionStorage for the step
    // that will POST it, next to the student username transaction1.html stored.
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(transaction));
    console.log('Approved, parked for the next step:', transaction);

    const forStudent = transaction.student ? ` for ${transaction.student}` : '';
    showReasonMessage(
        `Approved "${transaction.label}"${forStudent} — parked for the next step: the API has no route that records a transaction yet, so nothing was sent.`,
        false
    );
}

reasonNext?.addEventListener('click', approveReason);

// The page starts itself: ask the backend for admin powers, fill the dropdown,
// then say on the one status line what happened.
openReasonPage();