// Typing dropdown for the student field on transaction1.html.
//
// As the admin types into #student_username this file shows the accounts whose
// name matches what has been typed so far, so a username never has to be
// remembered exactly. The names come from GET /getuser, the public route the
// query form in app.js also uses; it answers with one object per account:
//   [{"name": "Rongrong Wu", "password": "wwww", "supervisor": "d"}, ...]
// The whole list is fetched once when the page opens and filtered in the
// browser, because the route's own ?name= filter only matches a complete name
// exactly (checked live: ?name=a answers just the account called "a"), so it
// would answer nothing at all for a half-typed name.
//
// Matching runs on the typed text: names that start with it come first, then the
// names that merely contain it (both case-insensitive), and the letters that
// lined up are marked in the list. Nothing is suggested while the field is
// empty, and the hint under the field says when nothing matched, when the list
// was cut short, or when the account list could not be loaded.
//
// This file only writes the chosen name into the input. Saving it stays where it
// was, in sessionstorage.js, which reads that same input when Next is clicked or
// the form is submitted.

const STUDENT_LIST_URL = 'https://api.rongrongwu.com/getuser';

// How many accounts the open list shows at once; the hint says when there were
// more, so a long list never runs off the page.
const STUDENT_LIST_LIMIT = 8;

// Fields an account object may carry its username in, and the field that carries
// the supervisor, most likely first. Mirrors the tolerant reading in app.js,
// which copes with the untyped /getuser payload too.
const STUDENT_NAME_KEYS = ['name', 'username', 'account', 'id'];
const STUDENT_SUPERVISOR_KEYS = ['supervisor', 'owner', 'manager'];

const studentInput = document.getElementById('student_username');
const studentList = document.getElementById('studentlist');
const studentHint = document.getElementById('studenthint');

// Every account the backend listed, sorted by name: [{ name, supervisor }, ...]
let studentAccounts = [];

// True when GET /getuser failed, so the hint can say the list is missing instead
// of pretending nothing matched.
let studentListFailed = false;

// Position of the highlighted option inside the open list, -1 when none is.
let studentActive = -1;

// First field of an account that actually carries something, or null when none
// of them does. Empty strings count as missing, so they never turn into blank
// suggestions.
function studentField(account, keys) {
    for (const key of keys) {
        const value = account?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

// Accepts every shape the endpoint has answered with so far, mirroring
// reasonList() in app.js:
//   [{"name": "X"}]                                          -> used as is
//   {"users": [...]} / {"accounts": [...]} / {"data": [...]}  -> the inner list
//   {"name": "X"} / "X"                                      -> wrapped in an array
//   null / undefined / ""                                    -> []
function studentAccountList(payload) {
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
            return studentAccountList(nested);
        }
    }

    return [payload];
}

// One payload entry -> { name, supervisor }, or null when it carries no name, so
// entries without one are skipped instead of printed as "undefined".
function studentAccount(entry) {
    if (entry === null || typeof entry !== 'object') {
        return entry ? { name: String(entry), supervisor: '' } : null;
    }

    const name = studentField(entry, STUDENT_NAME_KEYS);

    if (name === null) {
        return null;
    }

    const supervisor = studentField(entry, STUDENT_SUPERVISOR_KEYS);

    return {
        name: String(name),
        supervisor: supervisor === null ? '' : String(supervisor)
    };
}

// Replaces the account list with everything usable in the payload. Names are
// de-duplicated case-insensitively and sorted, so the order the list shows is the
// same on every keystroke.
function fillStudentAccounts(payload) {
    const seen = new Set();
    const accounts = [];

    for (const entry of studentAccountList(payload)) {
        const account = studentAccount(entry);

        if (!account) continue;

        const key = account.name.toLowerCase();

        if (seen.has(key)) continue;

        seen.add(key);
        accounts.push(account);
    }

    accounts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    studentAccounts = accounts;

    return accounts.length;
}

// One public request when the page opens. The admin session is deliberately not
// sent, exactly like the query form in app.js, because listing accounts needs no
// cookie and the typing list should still work while an admin signs in.
async function loadStudentAccounts() {
    if (!studentInput) return 0; // every other page that loads this file has no field

    try {
        const response = await fetch(STUDENT_LIST_URL);

        if (!response.ok) {
            throw new Error(`GET /getuser answered ${response.status}`);
        }

        const count = fillStudentAccounts(await response.json());
        console.log(`Loaded ${count} student account(s) for the typing list.`);
        return count;
    } catch (error) {
        console.error('Student list error:', error);
        studentListFailed = true;
        return 0;
    }
}

// The accounts to offer for what has been typed, in the order they appear: whole
// names that start with the text first, then the ones that merely contain it.
// Each entry is { account, matchIndex }, so the matching letters can be marked.
function matchStudentAccounts(query) {
    const needle = query.trim().toLowerCase();

    if (!needle) {
        return []; // nothing typed yet, nothing to suggest
    }

    const starts = [];
    const contains = [];

    for (const account of studentAccounts) {
        const index = account.name.toLowerCase().indexOf(needle);

        if (index < 0) continue;

        (index === 0 ? starts : contains).push({ account, matchIndex: index });
    }

    return starts.concat(contains);
}

// Text nodes with a <mark> around the matched letters, so the list shows which
// part of the name the typed text lined up with. Built as nodes rather than
// innerHTML, because the names come from the backend.
function markStudentMatch(name, matchIndex, length) {
    const fragment = document.createDocumentFragment();

    if (matchIndex < 0 || length <= 0) {
        fragment.append(document.createTextNode(name));
        return fragment;
    }

    const mark = document.createElement('mark');
    mark.textContent = name.slice(matchIndex, matchIndex + length);

    fragment.append(document.createTextNode(name.slice(0, matchIndex)));
    fragment.append(mark);
    fragment.append(document.createTextNode(name.slice(matchIndex + length)));

    return fragment;
}

// One <li role="option">: the marked name, plus the supervisor as a muted aside
// so two similar names can be told apart.
function makeStudentOption(account, matchIndex, index, length) {
    const option = document.createElement('li');
    option.className = 'combo__option';
    option.id = `studentoption-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.setAttribute('data-student-name', account.name);

    const name = document.createElement('span');
    name.className = 'combo__option-name';
    name.append(markStudentMatch(account.name, matchIndex, length));
    option.append(name);

    if (account.supervisor) {
        const supervisor = document.createElement('span');
        supervisor.className = 'combo__option-hint';
        supervisor.textContent = account.supervisor;
        option.append(supervisor);

        // The supervisor sits next to the name for the eye only, so spell the
        // option out for screen readers instead of letting them read
        // "Rongrong Wud" out of the two spans.
        option.setAttribute('aria-label', `${account.name} — supervisor ${account.supervisor}`);
    }

    return option;
}

// Writes the one hint line under the field. Errors also colour it, the same way
// the results blocks use .results__error.
function setStudentHint(text, isError) {
    if (!studentHint) return;

    studentHint.className = isError ? 'combo__hint combo__hint--error' : 'combo__hint';
    studentHint.hidden = !text;
    studentHint.textContent = text;
}

// The options the open list is showing, in order.
function studentOptions() {
    return studentList ? Array.from(studentList.children) : [];
}

function openStudentList() {
    if (!studentList || !studentInput) return;

    studentList.hidden = false;
    studentInput.setAttribute('aria-expanded', 'true');
}

// Shuts the list and forgets the highlight. The hint goes too: it described the
// list that was just closed.
function closeStudentList() {
    if (!studentList || !studentInput) return;

    studentList.hidden = true;
    studentList.replaceChildren();
    studentInput.setAttribute('aria-expanded', 'false');
    studentInput.removeAttribute('aria-activedescendant');

    studentActive = -1;
    setStudentHint('');
}

// Highlights the option at index and points the input at it, wrapping around the
// ends. scrollIntoView only for keyboard moves, so hovering does not jump.
function setStudentActive(index, scroll) {
    const options = studentOptions();

    if (!options.length) {
        studentActive = -1;
        return;
    }

    studentActive = (index + options.length) % options.length;

    options.forEach((option, position) => {
        const active = position === studentActive;

        option.className = active ? 'combo__option combo__option--active' : 'combo__option';
        option.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    studentInput.setAttribute('aria-activedescendant', options[studentActive].id);

    if (scroll) {
        options[studentActive].scrollIntoView?.({ block: 'nearest' });
    }
}

// Fills the open list with the accounts matching the typed text. The list stays
// shut when there is nothing to show, and the hint says what happened.
function renderStudentList() {
    if (!studentInput || !studentList) return;

    const query = studentInput.value.trim();
    const matches = matchStudentAccounts(query);
    const shown = matches.slice(0, STUDENT_LIST_LIMIT);

    studentActive = -1;
    studentInput.removeAttribute('aria-activedescendant');

    if (shown.length) {
        studentList.replaceChildren(...shown.map((match, index) =>
            makeStudentOption(match.account, match.matchIndex, index, query.length)));
        openStudentList();

        setStudentHint(
            matches.length > shown.length
                ? `Showing ${shown.length} of ${matches.length} matches — keep typing to narrow them down.`
                : ''
        );
        return;
    }

    closeStudentList();

    if (studentListFailed) {
        // No list to filter, so saying "nothing matches" would be a lie.
        setStudentHint(
            'The account list could not be loaded — type the whole username and it will still be used.',
            true
        );
        return;
    }

    if (!query) {
        return; // nothing typed and the list is fine: stay quiet
    }

    setStudentHint(`No account matches "${query}".`, false);
}

// Puts the chosen account name into the field, which is all sessionstorage.js
// needs: it reads this input when Next is clicked or the form is submitted.
function chooseStudent(index) {
    const option = studentOptions()[index];

    if (!option) return;

    studentInput.value = option.getAttribute('data-student-name');
    closeStudentList();
    studentInput.focus();
}

studentInput?.addEventListener('input', renderStudentList);

// Arrow keys walk the list, Enter takes the highlighted account, Escape shuts the
// list and Tab moves on.
studentInput?.addEventListener('keydown', function (event) {
    const open = studentList && !studentList.hidden;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();

        if (!open) {
            renderStudentList(); // typing is the usual way in, the arrows open it too
        }

        const step = event.key === 'ArrowDown' ? 1 : -1;
        const first = step === 1 ? 0 : studentOptions().length - 1;

        setStudentActive(studentActive === -1 ? first : studentActive + step, true);
        return;
    }

    if (event.key === 'Enter') {
        if (open && studentActive > -1) {
            // Take the highlighted account instead of submitting the form: the
            // submit handler in sessionstorage.js would otherwise accept the
            // half-typed name and move on with it.
            event.preventDefault();
            chooseStudent(studentActive);
        }

        return;
    }

    if (event.key === 'Escape' && open) {
        closeStudentList();
        return;
    }

    if (event.key === 'Tab') {
        closeStudentList(); // moving on, the list would only be in the way
    }
});

// Clicking an option has to beat the input's blur, which shuts the list. mousedown
// lands first and would move focus away by default, so it is cancelled here and
// the choice is made straight away.
studentList?.addEventListener('mousedown', function (event) {
    const option = event.target.closest?.('li[role="option"]');

    if (!option) return;

    event.preventDefault();
    chooseStudent(studentOptions().indexOf(option));
});

// Hovering moves the highlight too, so Enter takes what the pointer is over.
studentList?.addEventListener('mousemove', function (event) {
    const option = event.target.closest?.('li[role="option"]');

    if (!option) return;

    setStudentActive(studentOptions().indexOf(option), false);
});

studentInput?.addEventListener('blur', closeStudentList);

// The page starts itself: load the names once. From then on the list is filtered
// in the browser, so typing never waits on the network.
loadStudentAccounts();
