// Session handling for the student flow.
//
// Two pages open the flow — transaction1.html starts a transaction and
// transaction-view-middle.html opens a student's history — so they share this file. The
// transaction page no longer asks for a username by hand: it draws the sketch's box of
// students, "Select student for transaction", one row per student of the signed-in admin,
// each row ticked and unticked with a click. The history page keeps its one typed username.
// Whichever way the student was named, the backend is asked the same two questions: whether
// this browser still holds an admin login, and — when the page's button is pressed — whether
// every student named is still an account of that admin. Those students have to be the
// logged-in admin's own accounts: the admin behind the session cookie is read from GET
// /current-admin, and only an account naming that admin as its supervisor can be confirmed,
// so no admin can open a transaction — or a history — for another admin's student. The
// confirmed students are stored in sessionStorage, and the pages after these read the first
// of them back so every step knows which account is being changed or looked at — and refuse
// to carry on when no student has been confirmed.
// What the transaction page stores is one key per picked student (SELECTED_STUDENT_KEY_PREFIX
// below), every one of them holding the same mark, because the students picked together share
// the one transaction the flow is about to enter rather than one transaction each, plus the
// whole pick in one key (SELECTED_STUDENTS_KEY) for the pages that read the group.
// Loaded by the two pages that open the flow (transaction1.html and
// transaction-view-middle.html) and by the two pages they open (transaction-middle.html
// and transaction-view.html), which read the stored username back.

const STUDENT_USERNAME_KEY = 'student_username';

// The students transaction1.html's box has picked, held in two places: the whole pick, in the
// order it was picked, under SELECTED_STUDENTS_KEY, and one key of its own per picked student —
// SELECTED_STUDENT_KEY_PREFIX + the account's own spelling of the name — written in a for loop
// over the picked students. Every one of those per-student keys holds the same value,
// SHARED_TRANSACTION_MARK: the students picked together share the one transaction the flow is
// about to enter, so no student's key describes a transaction of its own. Only the first
// picked student is also written under STUDENT_USERNAME_KEY, which is the key the pages after
// this one read — they are left exactly as they were, so the transaction they open is the one
// the first picked student's page carries, and the group's own keys say who else shares it.
const SELECTED_STUDENTS_KEY = 'selected_students';
const SELECTED_STUDENT_KEY_PREFIX = 'selected_student_';
const SHARED_TRANSACTION_MARK = 'shared';

// Where the flow goes once the username has been confirmed: the transaction flow's Next
// opens the type menu, the history flow's opens the transactions of that student.
const TRANSACTION_NEXT_URL = '/transaction-middle.html';
const VIEW_NEXT_URL = '/transaction-view.html';

// Public account list, the route the typing picker in studentpicker.js also
// loads. Its ?name= and ?supervisor= filters are exact, case-sensitive lookups
// (checked live: ?name=a answers the account "a" while ?name=A and ?name=Arm answer
// [], and ?name=a&supervisor=test-account answers that one account while
// ?name=a&supervisor=d answers []), so the two filters together are the direct
// answer to "is this a student of mine?", and the admin's own list is only fetched
// when they answered nothing, to still accept a username typed in the wrong case.
// Every route below is asked of this site's own origin — `${API_ORIGIN}/getuser`, and
// '/api' once the page is on the deployed site — where the Cloudflare Pages Function
// functions/api/[[path]].js fetches the same route from the API and hands the answer back,
// the session cookie included. apibase.js, loaded before this file on every page, carries
// that origin and says why the API is no longer asked by its own hostname (a SameSite=lax
// cookie cannot cross from bonurabank.ca to rongrongwu.com). What follows API_ORIGIN is the
// API's own route, unchanged.
const STUDENT_ACCOUNTS_URL = `${API_ORIGIN}/getuser`;

// Who the student has to belong to: GET /current-admin answers the admin behind the
// session cookie — the route the home page's "Get current admin" button asks, and the
// picker on this page asks it too — and every account this flow confirms has to name
// that admin as its supervisor.
const CURRENT_ADMIN_URL = `${API_ORIGIN}/current-admin`;

// Fields the GET /current-admin reply may carry the admin name in, most likely
// first — the route is untyped, openapi.json only promises an object of strings.
const ADMIN_NAME_KEYS = ['admin_name', 'name', 'admin', 'username'];

// Fields an account object may carry its supervisor in, most likely first — the same
// order studentpicker.js reads them in, so both files agree on whose account this is.
const SUPERVISOR_KEYS = ['supervisor', 'owner', 'manager'];

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
const PERMISSION_URL = `${API_ORIGIN}/adduser`;

// 422 is the "you are logged in" answer, not a failure — but Chrome still prints
// it in red ("422 (Unprocessable Content)") because that is what the HTTP status
// says, and JavaScript cannot silence that line. Nothing is created either way.
// checkLoginPermission() prints a console note saying as much, and every answer
// that does not confirm a session gets the red on-page message instead.

const transactionForm = document.getElementById('transactionform');
const transactionNext = document.getElementById('transactionnext');
const transactionStudent = document.getElementById('transactionstudent');
const transactionSession = document.getElementById('transactionsession');

// The history flow's version of the same three pieces: transaction-view-middle.html's
// one-username form, the Next link beside it, and the line under the form that says what
// the backend answered.
const viewForm = document.getElementById('transactionviewform');
const viewNext = document.getElementById('viewnext');
const viewSession = document.getElementById('viewsession');

// transaction1.html's box of students — the sketch's "Select student for transaction" — as the
// one thing this file dresses differently on its two pages: the transaction page asks which
// student by showing every student of the signed-in admin to be picked, and the history page by
// its typed field. Null on every page without the box, and that null is how the functions below
// know which of the two questions they are answering. The list is filled by fillStudentPicker()
// once the session has been confirmed, and it is the only element of the box this file finds:
// the rows live inside it, and the Continue link beside it keeps the id the transaction flow
// has always used (transactionnext), so it is the same link the typed page's Next is.
const pickerList = document.getElementById('studentpicklist');

// Whichever flow this page is, read once: the form whose username is asked about, the
// Next link held back until the backend agrees about it, the line that says why, and
// what that link opens. Every function below works on the one pair that is on the page,
// and that is what makes the two flows one check. A page with neither form — the two
// pages the flows open — finds nothing here and starts nothing.
const flowForm = transactionForm ?? viewForm;
const flowNext = transactionNext ?? viewNext;
const flowSession = transactionSession ?? viewSession;
const nextPageUrl = viewForm ? VIEW_NEXT_URL : TRANSACTION_NEXT_URL;
const nextPageName = viewForm ? 'the transaction history' : 'a transaction';

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

// The students transaction1.html's box has picked, in the order they were picked: what the
// ticked rows stand for, and what Continue asks the backend about. Empty until a row is clicked.
let pickedStudents = [];

// The pick transaction1.html's last Continue could not have confirmed, and the line that says
// why — the memory blockedStudent is for the typed page, kept apart from it because the two
// pages ask about different things. While the same students are picked the question is not
// asked twice, and picking or unpicking any row clears both, because an answer about one group
// of students says nothing about another.
let blockedPick = '';
let blockedPickMessage = '';

// The username as typed, trimmed; '' when the field is empty.
function typedStudentUsername() {
    const field = flowForm?.elements.namedItem('student_username');
    return field ? field.value.trim() : '';
}

// Saves the name the backend confirmed. The account's own spelling is what gets
// stored — and shown back in the field — so a name typed in the wrong case cannot
// travel on as typed.
function storeStudentUsername(username) {
    sessionStorage.setItem(STUDENT_USERNAME_KEY, username);

    const field = flowForm?.elements.namedItem('student_username');

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

// The students the stored pick names, in the order they were named; [] when nothing is stored,
// or when what is stored cannot be read back as a list of names. The one reader of
// SELECTED_STUDENTS_KEY, so half a JSON object, or a key somebody else wrote, can only ever come
// back as no pick at all rather than as a student to open a transaction for.
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

// Remembers the students the transaction is for — the sketch's box, as sessionStorage. The whole
// pick is written under SELECTED_STUDENTS_KEY in the order it was picked, and then, in a for loop
// over the picked students, one key of its own per student (SELECTED_STUDENT_KEY_PREFIX + the
// account's own spelling of the name). Every one of those keys holds the same value, so the pick
// reads as what it is: these students share the one selected transaction rather than one
// transaction each. Written only once the backend has confirmed every one of them, and always
// after the pick of an earlier round is dropped, so a student unpicked since cannot be left
// standing in storage.
function storeStudentSelection(names) {
    forgetStudentSelection();

    if (!names.length) {
        // Nothing is picked, so nothing is stored: the box holds no student and neither does
        // sessionStorage — an empty pick is not a pick of nobody.
        console.log('No student is picked, so no pick is stored.');
        return;
    }

    for (const name of names) {
        sessionStorage.setItem(SELECTED_STUDENT_KEY_PREFIX + name, SHARED_TRANSACTION_MARK);
    }

    sessionStorage.setItem(SELECTED_STUDENTS_KEY, JSON.stringify(names));
    console.log(
        `Stored ${names.length} picked student(s) in sessionStorage: ${names.join(', ')} — they share the one selected transaction.`
    );
}

// Drops what the last round stored: the group key and one key per student it named, walked from
// the group key so nothing the pick wrote is left behind. A page opened fresh, or a pick that was
// never confirmed, removes the group key only — there is nothing else to remove.
function forgetStudentSelection() {
    for (const name of storedStudentSelection()) {
        sessionStorage.removeItem(SELECTED_STUDENT_KEY_PREFIX + name);
    }

    sessionStorage.removeItem(SELECTED_STUDENTS_KEY);
}

// Next is a plain link on both pages, so the click is always held back until the
// backend has agreed about the student; confirmStudent() opens the next page itself
// once it has.
flowNext?.addEventListener('click', function (event) {
    event.preventDefault();
    confirmStudent();
});

// Pressing Enter inside the single input submits the form, not the link.
flowForm?.addEventListener('submit', function (event) {
    event.preventDefault();
    confirmStudent();
});

// Editing the username lifts the lock: the backend's answer was about the name
// that was asked about, not about this new one.
flowForm?.addEventListener('input', function () {
    if (!blockedStudent) return;

    blockedStudent = '';
    blockedMessage = '';
    setNextEnabled(permission === 'granted');
});

// ------------------------------------------- transaction1.html's student box ----
// The sketch's box, "Select student for transaction": one row per student of the admin behind
// the session cookie — the student's name, the word "[choose]" and the box a click ticks — with
// Continue at the foot. Picking is a click, unpicking is the same click again, and the pick is
// remembered in sessionStorage as it is made, so a box that was ticked is ticked when the page is
// opened again. Every row is one button wearing role="checkbox": the whole row is the click's
// target (the box is at the end of the row, and a name is as easy to hit as the box) and the
// state is announced as chosen or not chosen rather than as a pressed button.
// The student the pages after this one open their transaction for is not written while the boxes
// are clicked: Continue asks the backend about every picked student first — the same question the
// typed page asks about its one name — and only a confirmed pick is stored under the keys above.

// One row of the box: the student's name, the sketch's "[choose]" and the box the tick is drawn
// in. data-student-name carries the account's own spelling of the name, which is what Continue
// asks the backend about and what the pick is stored under — never what is written on the row, so
// what is shown and what is stored cannot drift apart.
function pickerRow(name) {
    const row = document.createElement('li');

    const option = document.createElement('button');
    option.type = 'button'; // a row picks a student; it must never submit the form
    option.className = 'picker__option';
    option.setAttribute('role', 'checkbox');
    option.setAttribute('aria-checked', 'false');
    option.setAttribute('data-student-name', name);

    const studentName = document.createElement('span');
    studentName.className = 'picker__name';
    studentName.textContent = name;

    // the word the sketch writes beside every student, kept as its own span so it sits between
    // the name and the box, whichever of them is longer
    const choose = document.createElement('span');
    choose.className = 'picker__choose';
    choose.textContent = '[choose]';

    // the box itself; the tick is drawn by the stylesheet off the row's aria-checked, so this
    // span is only the box, and it is hidden from a reader because the row's own state already
    // says whether the student is picked
    const box = document.createElement('span');
    box.className = 'picker__box';
    box.setAttribute('aria-hidden', 'true');

    option.append(studentName, choose, box);
    row.append(option);

    return row;
}

// The rows of the box, in the order they are drawn.
function pickerOptions() {
    return Array.from(pickerList.querySelectorAll('.picker__option'));
}

// The row that stands for `name`, or null when the box has no such row. Read off the rows' own
// data-student-name rather than looked up by a selector, so a name carrying a quote or a space
// needs no escaping to be found.
function pickerOption(name) {
    return pickerOptions().find((option) => option.getAttribute('data-student-name') === name) ?? null;
}

// Fills the box with the students the backend listed, and ticks the rows of the pick the last
// round stored, in the order that pick was made in: what was picked stays picked when the page is
// opened again, and the pick the box shows is the pick Continue would ask about.
function fillStudentPicker(names) {
    pickerList.replaceChildren(...names.map(pickerRow));

    pickedStudents = [];

    for (const stored of storedStudentSelection()) {
        // the stored pick is matched to the listed names the way every other lookup in this flow
        // matches a name — surrounding space and case ignored — so a name stored and a name listed
        // with different capitals are the same student here too
        const listed = names.find((name) => name.trim().toLowerCase() === stored.trim().toLowerCase());
        const option = listed ? pickerOption(listed) : null;

        if (!option) continue; // a stored student the backend no longer lists stays unticked

        option.setAttribute('aria-checked', 'true');
        pickedStudents.push(listed);
    }

    showPickMessage();
    setNextEnabled(permission === 'granted');
}

// The line under the box: who is picked and what that means, or the nudge to pick. Only written
// while the session is confirmed — before that the line belongs to the permission check, which is
// the reason the box has nothing in it.
function showPickMessage() {
    if (permission !== 'granted') return;

    const picked = pickedStudents.length === 1
        ? `One student is picked: ${pickedStudents[0]}`
        : `${pickedStudents.length} students are picked: ${pickedStudents.join(', ')}`;

    showSessionMessage(
        pickedStudents.length
            ? `${picked} — the pick is kept key by key, one per student, and every one of those keys carries the same mark: the students picked together share the one transaction this flow is about to enter.`
            : 'Nothing is picked yet — click a student in the box above to pick them, and click them again to unpick.',
        false
    );
}

// A click on a row: pick that student, or unpick them. aria-checked is both the state the
// stylesheet draws the tick from and the state a reader is told, so writing it is the whole of the
// toggle. The pick is then stored as the box shows it — one key per picked student, written in the
// for loop inside storeStudentSelection() — and that is the pick the page would come back to.
function togglePickedStudent(option) {
    const name = option.getAttribute('data-student-name');
    const picked = option.getAttribute('aria-checked') !== 'true';
    const at = pickedStudents.indexOf(name);

    option.setAttribute('aria-checked', picked ? 'true' : 'false');

    if (picked && at === -1) {
        pickedStudents.push(name);
    } else if (!picked && at !== -1) {
        pickedStudents.splice(at, 1);
    }

    // whatever the last Continue could not confirm was about the students picked then, so any
    // click lifts that lock: the line and the link say what the new pick makes them say
    blockedPick = '';
    blockedPickMessage = '';
    storeStudentSelection(pickedStudents);
    showPickMessage();
    setNextEnabled(permission === 'granted');
}

// One listener for the whole box, so a row drawn later needs no listener of its own. A click walks
// up to the row it landed in, whichever part of that row — the name, "[choose]" or the box — it
// hit, and a click that missed every row does nothing.
pickerList?.addEventListener('click', function (event) {
    const option = event.target.closest?.('.picker__option');

    if (!option) return;

    togglePickedStudent(option);
});

// An empty box that says why, rather than looking like a page that is still filling: one line
// where the rows would be. Nothing can be picked out of a list nobody read, so the pick goes with
// it and Continue is left locked.
function noteInPicker(text) {
    const note = document.createElement('li');
    note.className = 'picker__note';
    note.textContent = text;

    pickerList.replaceChildren(note);

    pickedStudents = [];
    setNextEnabled(false);
}

// Fills the box as the page opens, once the session has been confirmed and never before it — an
// unlogged browser is sent to log in by the permission check instead of being shown the students
// of somebody else. Two questions are asked of the backend: which admin is signed in (GET
// /current-admin) and which accounts are theirs (GET /getuser), the pair studentpicker.js asks for
// the typed page. A read that fails, or a backend that names no admin, leaves a note in the box
// and Continue locked, so no transaction can be started from a list nobody read.
async function loadStudentPicker() {
    if (!pickerList) return;

    noteInPicker('Reading the students of the signed-in admin…');

    try {
        const admin = await loggedInAdmin();

        if (!admin) {
            console.error('Student box: the backend named no admin.');
            noteInPicker(`No admin session — the backend named no admin for this browser, so there are no students to pick from. Log into the admin account, then reload this page.`);
            return;
        }

        const names = await studentsOfAdmin(admin);

        if (!names.length) {
            noteInPicker(`The backend lists no student with “${admin}” as their supervisor, so there is no student to pick from.`);
            return;
        }

        fillStudentPicker(names);
        console.log(`The student box lists ${names.length} account(s) of the admin "${admin}".`);
    } catch (error) {
        console.error('Student box error:', error);
        noteInPicker('Network error — the student list could not reach the API, so no student can be picked. Reload this page to try again.');
    }
}


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

// The two pages with the one-username form: ask the backend for login permission as the
// page opens.
async function checkLoginPermission() {
    if (!flowForm) return; // only the pages with that form have anything to unlock

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
            showSessionMessage(pickerList
                ? 'Admin login confirmed by the backend — pick the student the transaction is for in the box above, then press continue.'
                : `Admin login confirmed by the backend — you can open ${nextPageName}.`, false);

            // transaction1.html's box is only filled for a session the backend has just confirmed,
            // so its rows are the students of the admin behind this browser and nobody else's. On
            // the history page this starts nothing: there is no box to fill.
            loadStudentPicker();
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

    // The box is only ever filled for a confirmed session, so a refused one leaves it empty; the
    // note says why, rather than leaving a blank box that reads like a list still on its way. The
    // history page has no box, and there this writes nothing.
    if (pickerList) {
        noteInPicker('No students are listed — the backend did not confirm an admin session for this browser, and it is only ever the students of the signed-in admin that may be picked.');
    }
}

// Shared gate for the Next link and the Enter key.
function permissionGranted() {
    if (permission === 'granted') {
        return true;
    }

    if (permission === 'denied') {
        alert(`log into the admin account before opening ${nextPageName}`);
    }

    return false;
}

// The link is live only for what it is standing on: the admin session everywhere, and, on
// transaction1.html, a picked student as well — a transaction for nobody is what that page must
// not open, the same reason the type menu stays shut on a page with no confirmed student. So on
// that page the pick is what the link waits for, and clicking a row is what sets it going.
function setNextEnabled(enabled) {
    if (!flowNext) return;

    if (enabled && (!pickerList || pickedStudents.length > 0)) {
        flowNext.removeAttribute('aria-disabled');
    } else {
        flowNext.setAttribute('aria-disabled', 'true');
    }
}

function showSessionMessage(text, isError) {
    if (!flowSession) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    flowSession.replaceChildren(paragraph);
}

// The check behind both Next and Enter, on the two pages that carry the form. The admin
// session has to be confirmed first, then the backend is asked whether the typed
// username is an account it knows about; only then is the name stored and the next page
// opened — the type menu for a transaction, the history page for a history. Otherwise
// the page stays where it is and the results line below the form says why.
async function confirmStudent() {
    // transaction1.html asks its question with a box rather than a field: Continue and Enter go to
    // the pick's own check, which is the same question asked about the students the box shows.
    if (pickerList) return confirmPickedStudents();

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
        const admin = await loggedInAdmin();

        if (!admin) {
            // No admin named, so there is no way to tell whose student this is and
            // nothing may be confirmed — the same way the picker's list stays empty.
            blockStudent(username, 'Not logged in — the backend named no admin for this session, and only the logged-in admin\'s own students may be used. Log into the admin account, then reload this page.');
            forgetStudentUsername();
            return;
        }

        const account = await findStudentAccount(username, admin);

        if (!account) {
            blockStudent(username, INVALID_STUDENT_MESSAGE);
            forgetStudentUsername();
            return; // no student, no way on: Next stays grey until the name changes
        }

        blockedStudent = '';
        blockedMessage = '';
        storeStudentUsername(account);
        showSessionMessage(`${account} confirmed by the backend — opening ${nextPageName}…`, false);
        window.location.href = nextPageUrl;
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

// transaction1.html's Continue, and its Enter: the box's own version of the check above. The admin
// session has to be confirmed first (the gate both pages share), at least one student has to be
// picked, and the backend has to still list every picked student among that admin's accounts —
// asked again here, so a student taken off the backend since the box was filled cannot travel on
// as a transaction. Only then is the pick stored: the first picked student under the key the pages
// after this one read, and the whole pick under the group's own keys, so the students it names
// carry the one transaction between them.
async function confirmPickedStudents() {
    if (studentCheckRunning) return; // one check at a time, however fast the clicks
    if (!permissionGranted()) return;

    if (!pickedStudents.length) {
        showSessionMessage('Nothing is picked — click a student in the box above to pick them before pressing continue.', true);
        setNextEnabled(permission === 'granted');
        return;
    }

    // The pick as one string, which is what the memory below is kept under: the students picked
    // then, in the order they were picked.
    const pick = pickedStudents.join(' | ');

    // A pick the backend has already refused is not asked about again: that answer stands until a
    // row is clicked, so Continue cannot be hammered into asking the same question over and over.
    if (blockedPick === pick) {
        showSessionMessage(blockedPickMessage, true);
        setNextEnabled(permission === 'granted');
        return;
    }

    studentCheckRunning = true;
    setNextEnabled(false);
    showSessionMessage(`Asking the backend whether ${pickedStudents.length === 1
        ? `${pickedStudents[0]} is still a student of yours`
        : `${pickedStudents.join(', ')} are still students of yours`}…`, false);

    try {
        const admin = await loggedInAdmin();

        if (!admin) {
            // No admin named, so there is no way to tell whose students these are and nothing may
            // be confirmed — the same way the box stays empty without one.
            blockPick(pick, 'No admin session — the backend named no admin for this browser, so no student can be confirmed and the transaction stays locked. Log into the admin account and reload this page.');
            return;
        }

        const confirmed = confirmedPicks(pickedStudents, await studentsOfAdmin(admin));

        if (!confirmed) {
            blockPick(pick, `${INVALID_STUDENT_MESSAGE} — the backend no longer lists every student picked in this box among the accounts of “${admin}”.`);
            forgetStudentUsername(); // no student may be left behind for the pages after this one
            return;
        }

        blockedPick = '';
        blockedPickMessage = '';
        storeStudentUsername(confirmed[0]); // the student the pages after this one open the transaction for
        storeStudentSelection(confirmed);   // the whole pick, the students that share that transaction

        showSessionMessage(`${confirmed.join(', ')} confirmed by the backend — opening a transaction for ${confirmed.length === 1 ? 'that student' : 'those students'}…`, false);
        window.location.href = nextPageUrl;
    } catch (error) {
        console.error('Student check error:', error);
        blockPick(pick, 'Network error — the account check could not reach the API, so the transaction stays locked. Try again.');
    } finally {
        studentCheckRunning = false;

        // Grey and unclickable for every pick that did not come back confirmed — a student the
        // backend no longer lists, or a check that could not be completed. Clicking a row is what
        // unlocks another attempt.
        if (!blockedPick) {
            setNextEnabled(permission === 'granted');
        }
    }
}

// The backend's own spelling of every picked student, in the order they were picked — or null as
// soon as one of them is missing from the list the backend has just answered with. Null is what
// keeps the confirmation all-or-nothing: one student gone takes the whole pick with it and nothing
// is stored, rather than a transaction opened for whichever students happen to be left.
function confirmedPicks(picks, listed) {
    const confirmed = [];

    for (const pick of picks) {
        const name = matchingStudentName(listed, pick);

        if (!name) {
            return null;
        }

        confirmed.push(name);
    }

    return confirmed;
}

// Locks the box on a pick the backend did not confirm: the line under the box says in red why, and
// Continue is left in the .btn[aria-disabled] state styles.css greys out and makes unclickable.
// Remembering the pick stops the same question being asked twice, so a held-down Enter cannot
// hammer the API. The pick itself is left in storage: it is what the box shows, and the key the
// pages after this one read is one a refused Continue never writes.
function blockPick(pick, message) {
    blockedPick = pick;
    blockedPickMessage = message;
    setNextEnabled(false);
    showSessionMessage(message, true);
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

// The admin behind the session cookie, or '' when the backend will not name one.
// Asked once per page: the answer cannot change without a login, and the later pages
// of the flow carry the confirmed student, not this.
let currentAdmin = null;

async function loggedInAdmin() {
    if (currentAdmin !== null) return currentAdmin;

    try {
        const response = await fetch(CURRENT_ADMIN_URL, {
            method: 'GET',
            credentials: 'include' // the admin session cookie
        });

        currentAdmin = response.ok ? adminNameIn(await response.json()) : '';
    } catch (error) {
        console.error('Current admin error:', error);
        currentAdmin = '';
    }

    console.log(currentAdmin
        ? `Only the students of the admin "${currentAdmin}" can be confirmed here.`
        : 'The backend named no admin, so no student can be confirmed here.');

    return currentAdmin;
}

// The admin name inside a GET /current-admin reply (an object of strings), or ''.
function adminNameIn(payload) {
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

// The backend's own spelling of the typed username, or null when `admin` has no
// account by that name. The ?name= filter answers the exact username straight away
// and the ?supervisor= filter keeps the answer to that admin's own rows; a name typed
// in the wrong case comes back empty, because those filters are case-sensitive, so
// the admin's list is asked once before the username is called invalid.
async function findStudentAccount(username, admin) {
    const filtered = await studentNamesFromUrl(
        `${STUDENT_ACCOUNTS_URL}?${new URLSearchParams({ name: username, supervisor: admin })}`,
        admin
    );
    const match = matchingStudentName(filtered, username);

    if (match) {
        return match;
    }

    return matchingStudentName(
        await studentNamesFromUrl(`${STUDENT_ACCOUNTS_URL}?${new URLSearchParams({ supervisor: admin })}`, admin),
        username
    );
}

// Every student of `admin`, alphabetically and each one once — the list transaction1.html's box
// offers. The accounts come from GET /getuser?supervisor=<admin>, the exact filter
// studentpicker.js uses, and every one of them is read through studentNames() again, so an account
// that is not this admin's can never reach the box whatever the server answered. When that exact
// filter answers nothing the whole list is asked once and filtered here instead — the fallback
// studentpicker.js makes for the same reason, for a backend that ignores the filter; a backend
// that honours it never sees the second ask.
async function studentsOfAdmin(admin) {
    const filtered = await studentNamesFromUrl(
        `${STUDENT_ACCOUNTS_URL}?${new URLSearchParams({ supervisor: admin })}`,
        admin
    );

    const names = filtered.length
        ? filtered
        : await studentNamesFromUrl(STUDENT_ACCOUNTS_URL, admin);

    return sortedStudentNames(names);
}

// The names in alphabetical order, each one once: names that differ only in case or surrounding
// space are one student, and the box reads the same way on every load — the sort studentpicker.js
// draws its own list with.
function sortedStudentNames(names) {
    const seen = new Set();
    const sorted = [];

    for (const name of names) {
        const trimmed = name.trim();
        const key = trimmed.toLowerCase();

        if (!key || seen.has(key)) continue;

        seen.add(key);
        sorted.push(trimmed);
    }

    return sorted.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// The names a URL lists that belong to `admin`, the session cookie going with the
// request. studentNames() reads the supervisor field again, so an account that is not
// this admin's can never be confirmed here, whatever the server filter answered.
async function studentNamesFromUrl(url, admin) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`GET /getuser answered ${response.status}`);
    }

    return studentNames(await response.json(), admin);
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

// Every account name in a GET /getuser payload that belongs to `admin`: an entry only
// counts when its supervisor is that admin, exact apart from surrounding space, so
// another admin's student stays out even if the request came back with one — and with
// no admin named, nothing may be used at all. The shapes accepted mirror
// studentAccountList in studentpicker.js, because that endpoint is untyped:
//   [{"name": "X", "supervisor": "Y"}]                         -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}   -> the inner list
//   {"name": "X", "supervisor": "Y"} / "X"                     -> wrapped in an array
//   null / undefined / ""                                      -> []
function studentNames(payload, admin) {
    if (!admin) {
        return []; // no admin to own them, so no account may be used
    }

    return studentEntries(payload)
        .filter((entry) => studentEntrySupervisor(entry) === admin)
        .map((entry) => studentEntryName(entry))
        .filter((name) => name !== null);
}

// The supervisor an account object names, trimmed; '' when it names none. The same
// field order studentpicker.js reads, so both files agree on whose account this is.
function studentEntrySupervisor(entry) {
    if (entry === null || typeof entry !== 'object') {
        return '';
    }

    for (const key of SUPERVISOR_KEYS) {
        const value = entry[key];

        if (value !== undefined && value !== null && value !== '') {
            return String(value).trim();
        }
    }

    return '';
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
