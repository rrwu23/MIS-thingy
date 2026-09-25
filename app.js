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

// index.html's "View students" button draws one bar per student of the admin behind
// the session cookie: balance up the y axis, student name along the x axis. Three
// live routes stand behind a chart, all of them taking the session cookie:
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

// The step the balance scale is laid out on: the axis runs from a multiple of it below
// the lowest balance up to one above the highest, so the gridlines land on round
// figures, the tallest bar never touches the ceiling, and a set of zero balances still
// has a range to draw in. No number is written beside the axis — each bar carries its
// own balance above it.
const CHART_STEP = 20;

// Fields an account object may carry its name and its supervisor in, most likely
// first — the same order the other pages read them in, the route being untyped.
const STUDENT_NAME_KEYS = ['name', 'username', 'account', 'id'];
const STUDENT_SUPERVISOR_KEYS = ['supervisor', 'owner', 'manager'];

const viewStudentsButton = document.getElementById('viewstudents');
const studentChartSection = document.getElementById('studentchart');
const studentChartStatus = document.getElementById('studentchartstatus');
const studentChartFrame = document.getElementById('studentchartframe');
const studentChartPlot = document.getElementById('studentchartplot');
const studentChartNames = document.getElementById('studentchartnames');

// Pressing the button asks who is signed in first, then draws whatever that admin's
// students and balances turn out to be. Anything that is not a chart is spelled out
// on the status line above the plot.
viewStudentsButton?.addEventListener('click', async function () {
    viewStudentsButton.setAttribute('aria-disabled', 'true');
    showChartSection();
    clearStudentChart();
    showChartStatus('Asking the backend which admin is signed in…', false);

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include'
        });
        const result = await response.json().catch(() => null);
        const admin = response.ok ? currentAdminNameIn(result) : '';

        if (!admin) {
            console.error('Student chart: the backend named no admin.', response.status, result);
            showChartStatus('No admin session — the backend named no admin for this browser, and the chart only draws the students of the admin that is signed in. Log into the admin account, then press the button again.', true);
            return;
        }

        showChartStatus(`Reading the students of “${admin}” and their balances…`, false);

        const students = await adminStudents(admin);

        if (!students.length) {
            showChartStatus(`The backend lists no student with “${admin}” as their supervisor, so there is nothing to draw.`, true);
            return;
        }

        // One request per student, all at once. A balance that cannot be read takes
        // that student out of the chart rather than being drawn as a zero, and the
        // status line says how many fell out.
        const rows = await Promise.all(students.map(async (name) => ({
            name,
            balance: await studentBalance(name).catch((error) => {
                console.error(`Balance of "${name}" could not be read:`, error);
                return null;
            })
        })));
        const drawn = rows.filter((row) => row.balance !== null);

        if (!drawn.length) {
            showChartStatus('No balance could be read for these students, so there is nothing to draw.', true);
            return;
        }

        drawStudentChart(drawn);

        const missing = rows.length - drawn.length;
        showChartStatus(
            `${drawn.length} student${drawn.length === 1 ? '' : 's'} of the admin “${admin}” — the bar is the balance and the name sits under it.`
            + (missing
                ? ` ${missing} balance${missing === 1 ? '' : 's'} could not be read, so ${missing === 1 ? 'that student is' : 'those students are'} not drawn.`
                : ''),
            false
        );
    } catch (error) {
        console.error('Student chart error:', error);
        showChartStatus('Network error — the students and their balances could not be read from the API.', true);
    } finally {
        viewStudentsButton.removeAttribute('aria-disabled');
    }
});

// The chart block appears the moment the button is pressed, so the status line is
// visible while the requests are out; the frame itself waits for real bars.
function showChartSection() {
    if (studentChartSection) {
        studentChartSection.hidden = false;
    }
}

function showChartStatus(text, isError) {
    if (!studentChartStatus) return;

    studentChartStatus.textContent = text;
    studentChartStatus.className = isError ? 'chart__status chart__status--error' : 'chart__status';
}

// Drops the bars, the gridlines and the names of the chart drawn before, so a second
// press cannot leave two charts stacked on each other.
function clearStudentChart() {
    if (studentChartFrame) {
        studentChartFrame.hidden = true;
    }

    studentChartPlot?.replaceChildren();
    studentChartNames?.replaceChildren();
}

// The admin name inside a GET /current-admin reply (an object of strings), or '' when
// the reply names nobody. The chart needs the name itself, not the sentence
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

// The usernames GET /getuser lists for `admin`, sorted and de-duplicated. The
// ?supervisor= filter is exact — checked live: ?supervisor=test-account answers that
// admin's three accounts while ?supervisor=nonsense answers [] — and each row's own
// supervisor field is read again here, so only this admin's students can reach the
// chart, the same rule the transaction flow follows.
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
// so a numeric string is accepted too. Anything else is thrown rather than drawn as a
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

// Draws the bars on the scale described above: the axis runs from the lowest balance
// (zero when every balance is positive) up to the highest, both rounded out to a
// multiple of CHART_STEP.
//   235 highest  -> 0 to 240
//   -10 lowest   -> -20 to 240, the bars growing from the zero line
// The gridlines are the only marks on that axis — no number is written beside them,
// each bar carrying its own balance above it. A bar is absolutely positioned inside its
// column and measured up from the bottom of the plot, which is how a negative balance
// hangs below the zero line while positive ones grow above it. Everything is built as
// nodes rather than innerHTML, because the student names come from the backend.
function drawStudentChart(rows) {
    const balances = rows.map((row) => row.balance);
    const axisLow = Math.floor(Math.min(0, ...balances) / CHART_STEP) * CHART_STEP;
    const axisHigh = Math.max(Math.ceil(Math.max(0, ...balances) / CHART_STEP) * CHART_STEP, axisLow + CHART_STEP);
    const span = axisHigh - axisLow;

    // Where a balance sits on the plot, in per cent up from the axis bottom.
    const upTo = (value) => ((value - axisLow) / span) * 100;

    const gridlines = document.createDocumentFragment();

    for (let value = axisLow; value <= axisHigh; value += CHART_STEP) {
        const gridline = document.createElement('div');
        gridline.className = value === 0 ? 'chart__gridline chart__gridline--zero' : 'chart__gridline';
        gridline.style.bottom = `${upTo(value)}%`;
        gridlines.append(gridline);
    }

    studentChartPlot.replaceChildren(gridlines);

    const bars = document.createElement('div');
    bars.className = 'chart__bars';
    const names = document.createDocumentFragment();

    for (const row of rows) {
        const column = document.createElement('div');
        column.className = 'chart__bar-column';

        // The balance is written above its bar and the name below the plot, so the bar
        // itself carries no text and is hidden from a screen reader.
        const value = document.createElement('span');
        value.className = 'chart__value';
        value.style.bottom = `calc(${upTo(Math.max(row.balance, 0))}% + 0.3rem)`;
        value.textContent = String(row.balance);

        const bar = document.createElement('div');
        bar.className = row.balance < 0 ? 'chart__bar chart__bar--negative' : 'chart__bar';
        bar.style.bottom = `${upTo(Math.min(row.balance, 0))}%`;
        bar.style.height = `${(Math.abs(row.balance) / span) * 100}%`;
        bar.setAttribute('aria-hidden', 'true');

        column.append(value, bar);
        bars.append(column);

        const name = document.createElement('span');
        name.className = 'chart__name';
        name.textContent = row.name;
        names.append(name);
    }

    studentChartPlot.append(bars);
    studentChartNames.replaceChildren(names);
    studentChartFrame.hidden = false;

    console.log(`Drew ${rows.length} bar(s) on a y axis of ${axisLow} to ${axisHigh}, stepped every ${CHART_STEP}.`, rows);
}

// Reason pages --------------------------------------------------------------
// transaction_bonus.html, transaction_fines.html, transaction_salaries.html and
// transaction_spending.html each show one dropdown of reasons that comes from the
// backend. Every /reasons/{slug} route answers with the same shape - a plain map
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
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(transaction));
    console.log('Approved:', transaction);

    const forStudent = transaction.student ? ` for ${transaction.student}` : '';

    // POST /transaction-record writes it: the object goes as a whole, as JSON, with
    // the two table columns (type and reason) in the backend's own spelling, and the
    // admin session cookie travels with the request.
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

            // Recorded once is recorded: Next goes grey until another reason is
            // chosen, so a second click cannot write the same transaction twice.
            setApproveEnabled(false);
            showReasonMessage(`Recorded "${transaction.label}"${forStudent} — the backend wrote the ${transaction.type} transaction.`, false);
            return;
        }

        console.error('Transaction record error:', result);
        showReasonMessage(`Nothing was recorded — the backend refused the transaction (${response.status}): ${describeError(result)}`, true);
    } catch (error) {
        console.error('Network Error:', error);
        showReasonMessage('Network error — the transaction could not reach the API, so nothing was recorded.', true);
    }

    // A send that did not go through leaves Next live, so the same choice can be
    // tried again.
    setApproveEnabled(true);
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