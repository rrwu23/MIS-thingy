// Job rotation page (job_rotation.html).
//
// The teacher gives every one of the signed-in admin's students a job — one text box
// per student, the students listed in alphabetical order — and presses Rotate to send
// the whole list. Four routes stand behind the page, all of them taking the session
// cookie:
//   GET  /current-admin               which admin this browser is signed in as;
//                                     401 {"detail": "Not logged in"} with no session
//   GET  /getuser?supervisor=<admin>  that admin's students — the exact filter the
//                                     transaction flow and the home chart use, so only
//                                     this admin's own accounts are ever listed. The
//                                     route has no response annotation to read
//                                     (openapi.json declares "schema": {} for it), so
//                                     its answer is taken as the array of accounts it
//                                     actually answers with: [{"name": "Rongrong Wu",
//                                     "password": "wwww", "supervisor": "d"}, ...].
//   GET  /get-jobs                    the job list the typed jobs are checked against.
//                                     Annotated (openapi.json) as a map whose values
//                                     are lists — {additionalProperties: [string] |
//                                     [object of string|integer]} — and it answers both
//                                     halves live:
//                                       {"jobs": ["Attendance Monitor", ...],
//                                        "content": [{"type": "JOB SALARIES",
//                                                     "reason": "Attendance Monitor",
//                                                     "amount": 65}, ...]}
//                                     so jobNames() walks that map: every array value is
//                                     a list of jobs, a string is a job's name, and an
//                                     object's name is its reason column.
//   POST /set-jobs                    where the list is sent. openapi.json names its
//                                     body JobAssignments: two arrays of the same
//                                     length, students[0] being the student jobs[0]
//                                     belongs to. (The annotation also allows the same
//                                     list as an array of StudentJob pairs —
//                                     {"student": ..., "job": ...} — which this page
//                                     does not use.) Checked live too: an empty body
//                                     answers 422 naming "students" and "jobs" as
//                                     required before anything is written.
//
// Rotate is the confirm button: it checks the typing first, alerts the teacher with
// every job that is wrong — one that is not in the job list (with the closest job the
// list does have offered as a suggestion) and one that two students were both given —
// and nothing is sent while any of them stands. A box left empty is not wrong: that
// student is simply not given a job.
//
// This file is the page's own script, so the readers it needs are kept here rather
// than shared: studentpicker.js and sessionstorage.js do the same, and no page ever
// loads two of them.

const JOB_STUDENTS_URL = 'https://api.rongrongwu.com/getuser';
const JOB_ADMIN_URL = 'https://api.rongrongwu.com/current-admin';
const JOBS_URL = 'https://api.rongrongwu.com/get-jobs';
const SET_JOBS_URL = 'https://api.rongrongwu.com/set-jobs';

// Fields the GET /current-admin reply may carry the admin name in, most likely first
// — the route is untyped, openapi.json only promises an object of strings.
const JOB_ADMIN_NAME_KEYS = ['admin_name', 'name', 'admin', 'username'];

// Where a GET /getuser account carries the student's name. The route answers the
// accounts table's own columns — {"name": "Rongrong Wu", "password": "wwww",
// "supervisor": "d"} — so `name` is the field; `student` is read as well, because that
// is the name the annotated models in openapi.json give a student (StudentJob,
// TransactionRecord).
const JOB_STUDENT_NAME_KEYS = ['name', 'student'];

// Where one row of an annotated /get-jobs list carries the job's name, most likely
// first. A row is either a plain string — the live "jobs" list — or an object of the
// reasons table, whose reason column *is* the job's name. `type` is deliberately not
// read: it says "JOB SALARIES" on every row, which is no job at all.
const JOB_NAME_KEYS = ['reason', 'job', 'name'];

// The datalist every job box points at by id.
const JOB_LIST_ID = 'joblist';

const jobForm = document.getElementById('jobform');
const jobRows = document.getElementById('jobrows');
const jobRotate = document.getElementById('rotate');
const jobResults = document.getElementById('jobresults');
const jobSuggestions = document.getElementById(JOB_LIST_ID);

// The student's name and the text box holding their job, in the order the students
// were listed — this is what Rotate reads.
let jobBoxes = [];

// The job names GET /get-jobs listed, sorted; [] when the route could not be read.
let knownJobNames = [];

// True once the students are on the page: nothing can be rotated before that.
let studentsListed = false;

// True while a send is in flight, so a second click or Enter cannot send the list
// twice.
let rotating = false;

// One paragraph per line under the form, so a list of problems stays readable and the
// live region reads each of them out. { text, isError } lets the note about a missing
// job list be red while the rest of the status stays plain.
function showJobLines(lines) {
    if (!jobResults) return;

    jobResults.replaceChildren(...lines.map(function (line) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line.text;

        if (line.isError) {
            paragraph.className = 'results__error';
        }

        return paragraph;
    }));
}

function showJobMessage(text, isError) {
    showJobLines([{ text: text, isError: isError }]);
}

// First field that actually carries something, or null when none of them does. Empty
// strings count as missing, so they never turn into blank names.
function firstField(source, keys) {
    for (const key of keys) {
        const value = source?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// The admin behind the session cookie, or '' when the backend will not name one.
// Asked once per page: the answer cannot change without a login.
let jobAdmin = null;

async function loggedInAdmin() {
    if (jobAdmin !== null) return jobAdmin;

    try {
        const response = await fetch(JOB_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // the admin session cookie
        });

        jobAdmin = response.ok ? adminNameIn(await response.json()) : '';
    } catch (error) {
        console.error('Current admin error:', error);
        jobAdmin = '';
    }

    console.log(jobAdmin
        ? `Giving jobs to the students of the admin "${jobAdmin}".`
        : 'The backend named no admin, so there is no student to give a job to.');

    return jobAdmin;
}

// The admin name inside a GET /current-admin reply (an object of strings), or '' when
// the reply names nobody.
function adminNameIn(payload) {
    if (typeof payload === 'string') {
        return payload.trim();
    }

    if (payload === null || typeof payload !== 'object') {
        return '';
    }

    for (const key of JOB_ADMIN_NAME_KEYS) {
        const value = payload[key];

        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

// The students of `admin`, alphabetically and without duplicates. An account only
// counts when its own supervisor field names that admin, exactly apart from surrounding
// space — the same rule the transaction flow and the home chart follow — so another
// admin's student is never listed, and an account with no supervisor belongs to nobody.
// GET /getuser?supervisor= filters on the backend as well (checked live: an unknown
// supervisor answers []), so the two checks agree.
async function adminStudents(admin) {
    const response = await fetch(`${JOB_STUDENTS_URL}?${new URLSearchParams({ supervisor: admin })}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    // No response annotation to read, so the answer is taken as the array of account
    // objects the route answers with — one row of the accounts table each. Anything
    // else is a shape this page cannot list students from, and it says so.
    const accounts = await response.json();

    if (!Array.isArray(accounts)) {
        throw new Error('the answer is not the array of accounts GET /getuser answers with');
    }

    const names = new Set();

    for (const account of accounts) {
        const name = accountNameIn(account);
        const supervisor = String(account?.supervisor ?? '').trim();

        if (name && supervisor === admin) {
            names.add(name);
        }
    }

    // Case and accents are ignored while sorting, so "ada" and "Ada" sit together
    // instead of every capital coming first.
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// The student's name in one account of GET /getuser, trimmed: the name field of the
// account object (see JOB_STUDENT_NAME_KEYS). A bare string names an account with
// nothing else, so it is taken as it stands; anything else names nobody.
function accountNameIn(account) {
    if (typeof account === 'string') {
        return account.trim();
    }

    if (account === null || typeof account !== 'object') {
        return '';
    }

    return String(firstField(account, JOB_STUDENT_NAME_KEYS) ?? '').trim();
}

// One row per student, in the order the students came back (alphabetical): the name
// is the label and the job's text box sits under it — the same .field shape every
// other form in the app uses. Every box points at the datalist of jobs read from
// /get-jobs, so the registered spellings are offered while the teacher types; with no
// list the datalist is empty and the boxes behave normally.
function buildJobRows(students) {
    if (!jobRows) return;

    jobBoxes = students.map(function (student, index) {
        const field = document.createElement('div');
        field.className = 'field';

        const label = document.createElement('label');
        label.htmlFor = `job-${index}`;
        label.textContent = student;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `job-${index}`;
        input.name = 'job';
        input.autocomplete = 'off';
        input.setAttribute('list', JOB_LIST_ID);

        field.append(label, input);

        return { student: student, field: field, input: input };
    });

    jobRows.replaceChildren(...jobBoxes.map((box) => box.field));
}

// The registered jobs as suggestions behind every box. An empty list — the route could
// not be read, or it listed nothing — simply leaves the datalist empty.
function fillJobList(names) {
    if (!jobSuggestions) return;

    jobSuggestions.replaceChildren(...names.map(function (name) {
        const option = document.createElement('option');
        option.value = name;

        return option;
    }));
}

// The typed jobs, one { student, job } per student on the page, in the order they are
// listed. The job is trimmed, so a stray space is never read as a different job.
function readJobRows() {
    return jobBoxes.map(function (box) {
        return { student: box.student, job: box.input.value.trim() };
    });
}

// The job names GET /get-jobs answered, sorted and without duplicates, or [] when the
// route could not be read or answered with nothing usable. A failed read is not the end
// of the page — it only means the jobs cannot be checked for spelling, which the status
// line says out loud.
async function readJobList() {
    try {
        const response = await fetch(JOBS_URL, {
            method: 'GET',
            credentials: 'include' // the job list is admin data
        });

        if (!response.ok) {
            console.error('Job list error:', response.status, await response.text());
            return { read: false, reason: `the backend answered ${response.status}` };
        }

        const names = jobNames(await response.json());

        return names.length
            ? { read: true, names: names }
            : { read: false, reason: 'it answered with no job names' };
    } catch (error) {
        console.error('Network Error:', error);
        return { read: false, reason: 'it could not be reached' };
    }
}

// Every job name in a GET /get-jobs payload: trimmed, without duplicates, sorted
// alphabetically. The route is annotated (openapi.json) as a map whose values are
// lists, each list holding either plain strings or objects of strings and numbers, and
// it answers both halves live:
//   {"jobs": ["Attendance Monitor", ...],
//    "content": [{"type": "JOB SALARIES", "reason": "Attendance Monitor", "amount": 65}, ...]}
// So the map is walked exactly as annotated — no wrapper key is guessed at: every value
// that is an array is a list of jobs, whatever it is called, and both halves above end
// up in one sorted, de-duplicated list.
function jobNames(payload) {
    const names = new Set();

    for (const list of jobListsIn(payload)) {
        for (const entry of list) {
            const name = jobNameIn(entry);

            if (name) {
                names.add(name);
            }
        }
    }

    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// Every list of jobs inside a GET /get-jobs payload: each value of the annotated map
// that is an array. A payload that is not a map of lists holds none.
function jobListsIn(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return [];
    }

    return Object.values(payload).filter((value) => Array.isArray(value));
}

// The job's name in one entry of such a list: a string entry *is* the name (the live
// "jobs" list), and an object entry carries it in its own name field — the reason column
// of the reasons table (see JOB_NAME_KEYS). Anything else names no job.
function jobNameIn(entry) {
    if (typeof entry === 'string') {
        return entry.trim();
    }

    if (entry === null || typeof entry !== 'object') {
        return '';
    }

    return String(firstField(entry, JOB_NAME_KEYS) ?? '').trim();
}

// Sets the Rotate button's greyed-out state, the same aria-disabled attribute
// styles.css styles for every .btn. The flag behind the button is checked as well,
// because the attribute only stops the mouse — Enter inside a job box still submits.
function setRotateEnabled(enabled) {
    if (!jobRotate) return;

    if (enabled) {
        jobRotate.removeAttribute('aria-disabled');
    } else {
        jobRotate.setAttribute('aria-disabled', 'true');
    }
}

// Everything wrong with the typed jobs, one sentence each, or [] when the list is
// ready to be sent. A box left empty is not wrong: that student is simply not given a
// job, and the status line says how many of them there were.
function jobProblems(rows) {
    const problems = [];

    for (const row of unknownJobs(rows)) {
        problems.push(row.suggestion
            ? `"${row.job}" (${row.student}) is not one of the jobs — did you mean "${row.suggestion}"?`
            : `"${row.job}" (${row.student}) is not one of the jobs — check the spelling.`);
    }

    for (const shared of sharedJobs(rows)) {
        problems.push(`"${shared.job}" was given to more than one student: ${shared.students.join(', ')} — a job belongs to one student at a time.`);
    }

    return problems;
}

// The rows whose job the list /get-jobs answered with does not have, each with the
// closest job in the list as a suggestion, or '' when nothing is close enough. Case
// and surrounding space are ignored, and only the first spelling of a job counts as
// the registered one.
// Without a list to check against (the route answered 404, or nothing usable came
// back) nothing here can be called misspelled, so this answers [] and the spelling
// half of the check is skipped — which the status line says out loud.
function unknownJobs(rows) {
    const listed = registeredJobs();

    if (!listed.size) {
        return [];
    }

    return rows
        .filter((row) => row.job && !listed.has(row.job.toLowerCase()))
        .map((row) => ({
            student: row.student,
            job: row.job,
            suggestion: closestJob(row.job, knownJobNames)
        }));
}

// The jobs more than one student was given, with the students named. The same job
// twice is a mistake, because a job belongs to one student at a time. Comparison
// ignores case and surrounding space, so "line leader" and "Line Leader" collide and
// are reported together under the first spelling that was typed.
function sharedJobs(rows) {
    const byJob = new Map();

    for (const row of rows) {
        if (!row.job) continue;

        const key = row.job.toLowerCase();
        const entry = byJob.get(key) ?? { job: row.job, students: [] };

        entry.students.push(row.student);
        byJob.set(key, entry);
    }

    return [...byJob.values()].filter((entry) => entry.students.length > 1);
}

// The typed jobs, ready to send: the rows that carry a job, as the two parallel
// arrays the body of POST /set-jobs takes — openapi.json's JobAssignments — where
// students[0] is the student jobs[0] belongs to, students[1] the student jobs[1]
// belongs to, and so on. A job the list knows is sent in the list's own spelling, so a
// lower-case "line leader" is stored as the registered "Line Leader"; if the list could
// not be read, the typed text is sent as it stands.
function jobAssignments(rows) {
    const listed = registeredJobs();
    const assigned = rows.filter((row) => row.job);

    return {
        students: assigned.map((row) => row.student),
        jobs: assigned.map((row) => listed.get(row.job.toLowerCase()) ?? row.job)
    };
}

// The registered job names as a lookup from the spelling to compare with to the
// spelling to send: "line leader" -> "Line Leader". Empty when no list was read.
function registeredJobs() {
    return new Map(knownJobNames.map((job) => [job.toLowerCase(), job]));
}

// Levenshtein distance: how many single-letter insertions, deletions or changes turn
// one string into the other. Nothing but the "did you mean ..." hint hangs off this,
// so a small, plain implementation is all it needs.
function editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];

        for (let j = 1; j <= b.length; j += 1) {
            const change = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, change);
        }

        previous = current;
    }

    return previous[b.length];
}

// The job in the list that is closest to what was typed, or '' when nothing is close
// enough to be worth suggesting. Close means at most three edits and at most a third
// of the typed job, so "Lien Leader" is pointed at "Line Leader" while a job that is
// simply a different word ("Chef") is only called wrong.
function closestJob(typed, jobs) {
    let best = '';
    let bestDistance = Infinity;

    for (const job of jobs) {
        const distance = editDistance(typed.toLowerCase(), job.toLowerCase());

        if (distance < bestDistance) {
            best = job;
            bestDistance = distance;
        }
    }

    return bestDistance <= 3 && bestDistance <= Math.ceil(typed.length / 3) ? best : '';
}

// FastAPI errors: {"detail": "..."} or {"detail": [{"msg": "..."}, ...]}
function describeJobError(result) {
    if (typeof result?.detail === 'string') {
        return result.detail;
    }

    if (Array.isArray(result?.detail)) {
        return result.detail.map((item) => item.msg).join('; ');
    }

    return 'the backend refused the list.';
}

// Rotate: check the typing, then send. The check comes first, and while anything is
// wrong the teacher is told exactly which jobs are wrong — in an alert, and again on
// the status line under the form — and nothing leaves the page. A clean list is sent
// to POST /set-jobs as the two parallel arrays its body takes: the students that were
// given a job, and the job each of them gets, in the same order.
async function rotateJobs() {
    if (!studentsListed) return; // no students on the page, so nothing to send
    if (rotating) return;        // one send at a time, however fast the clicks or Enters

    const rows = readJobRows();
    const problems = jobProblems(rows);

    if (problems.length) {
        alert(['These jobs need fixing before the list can be sent:', ...problems.map((problem) => `• ${problem}`)].join('\n'));
        showJobLines(problems.map((problem) => ({ text: problem, isError: true })));
        return;
    }

    const assignments = jobAssignments(rows);
    const count = assignments.students.length;
    const blank = rows.length - count;

    if (!count) {
        alert('No job was typed, so there is nothing to send.');
        showJobMessage('No job was typed, so there is nothing to send.', true);
        return;
    }

    rotating = true;
    setRotateEnabled(false);
    showJobMessage(`Sending ${count} job${count === 1 ? '' : 's'} to /set-jobs…`, false);

    try {
        const response = await fetch(SET_JOBS_URL, {
            method: 'POST',
            credentials: 'include', // the admin session cookie
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assignments)
        });

        // A refusal can answer with something that is not JSON, so the body is read
        // once and never trusted to parse.
        const result = await response.json().catch(() => null);

        if (response.ok) {
            console.log('Jobs sent:', result);
            showJobLines([
                { text: `Sent ${count} job${count === 1 ? '' : 's'} to /set-jobs${blank ? `, and left ${blank} student${blank === 1 ? '' : 's'} without one` : ''}.`, isError: false },
                { text: 'Correct a job and press Rotate again to send the list once more.', isError: false }
            ]);
            return;
        }

        console.error('Jobs error:', response.status, result);
        showJobMessage(`Nothing was sent — /set-jobs answered ${response.status} (${describeJobError(result)}).`, true);
    } catch (error) {
        console.error('Network Error:', error);
        showJobMessage('Network error — /set-jobs could not be reached, so nothing was sent.', true);
    } finally {
        rotating = false;
        setRotateEnabled(true);
    }
}

// The page starts itself: read the signed-in admin, list that admin's students in
// alphabetical order in a text box each, then read the job list the typing is checked
// against. Pages without the rows (every page that does not load this script) start
// nothing at all.
async function openJobPage() {
    if (!jobRows) return;

    setRotateEnabled(false);
    showJobMessage('Reading your students and the job list…', false);

    const admin = await loggedInAdmin();

    if (!admin) {
        showJobMessage('Not logged in — the backend named no admin for this session, and only the students of the admin that is signed in can be given jobs. Log in on the admin login page, then reload this page.', true);
        return;
    }

    let students;

    try {
        students = await adminStudents(admin);
    } catch (error) {
        console.error('Student list error:', error);
        showJobMessage(`The student list could not be read from /getuser (${error.message}), so there is nobody to give a job to. Reload the page to try again.`, true);
        return;
    }

    if (!students.length) {
        showJobMessage(`The backend lists no student with "${admin}" as their supervisor, so there is nobody to give a job to.`, true);
        return;
    }

    buildJobRows(students);
    studentsListed = true;
    setRotateEnabled(true);

    const list = await readJobList();
    knownJobNames = list.names ?? [];
    fillJobList(knownJobNames);

    const listed = students.length === 1
        ? '1 student'
        : `${students.length} students`;

    showJobLines([
        { text: `${listed} of "${admin}", in alphabetical order — type a job for each one and press Rotate.`, isError: false },
        list.read
            ? { text: `${knownJobNames.length} job${knownJobNames.length === 1 ? '' : 's'} read from /get-jobs; every typed job is checked against that list before anything is sent.`, isError: false }
            : { text: `The typed jobs cannot be checked against /get-jobs — ${list.reason}. Misspellings are not caught without it, so only a job two students share is reported; the list is still sent when you press Rotate.`, isError: true }
    ]);
}

// Enter inside a job box submits the form, so the button and the keyboard take the
// same path; the page is asked, never reloaded.
jobForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    rotateJobs();
});

openJobPage();
