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
// Matching runs on the initials of the typed text only, and the initials of a name
// are the first N letters of it — not just its first letter. What has been typed is
// cut into parts (letters and digits make a part; dots, spaces and dashes split
// them), and every part has to be the first letters of one word of a name, with the
// words following each other: "rong" finds "Rongrong Wu", "rong w" and "rong.wu"
// find it too, and "wu" or "w" find it by its last word (case-insensitive). The
// letters that matched are marked in the list, one mark per run of them.
// Nothing is suggested while the field is empty, and the hint under the field
// says when nothing matched, when the list was cut short, when only one account
// is left, or when the account list could not be loaded.
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

// One word inside a name, and one part of what has been typed: "Rongrong Wu" is two
// words and so is "rong.wu". Letters and digits make a word, everything else
// (spaces, dots, dashes) splits them. Unicode classes, so an accented name keeps
// its letter instead of being split around it.
const STUDENT_WORD_PATTERN = /\p{L}[\p{L}\p{N}]*/gu;

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

// Every word of a name with where it starts, so the first letters of a word can be
// read out of it: "Rongrong Wu" gives [{ index: 0, text: "Rongrong" },
// { index: 9, text: "Wu" }] and therefore the initials "rong" or "wu".
function studentWords(name) {
    return [...name.matchAll(STUDENT_WORD_PATTERN)].map((word) => ({
        index: word.index,
        text: word[0]
    }));
}

// The indexes of the letters of a name that the typed parts cover, or null when
// they cover nothing. Every part has to be the first letters of one word — the
// first N letters, not just the first one — and the words have to follow each
// other, so "rong" finds "Rongrong Wu" and "rong w" does too, because a space says
// the next word. The run of words may start at any word, so "w" and "wu" find
// "Rongrong Wu" and a name that begins with W alike.
function matchStudentInitials(name, parts) {
    const words = studentWords(name);

    for (let start = 0; start <= words.length - parts.length; start++) {
        const indexes = studentWordIndexes(words, start, parts);

        if (indexes) {
            return indexes;
        }
    }

    return null;
}

// The indexes the typed parts cover when they sit on the words beginning at
// `start`, or null when any part is not the first letters of its word. The indexes
// come out in order and next to each other inside a part, because a part is a run
// of letters at the front of one word.
function studentWordIndexes(words, start, parts) {
    const indexes = [];

    for (let step = 0; step < parts.length; step++) {
        const word = words[start + step];
        const head = word.text.slice(0, parts[step].length).toLowerCase();

        if (head !== parts[step]) {
            return null;
        }

        for (let letter = 0; letter < parts[step].length; letter++) {
            indexes.push(word.index + letter);
        }
    }

    return indexes;
}

// The accounts to offer for what has been typed, matched on the initials of the
// names only: every part of what was typed has to be the first letters of one word
// of a name, so "rong" finds "Rongrong Wu", "rong w" finds it as well, and "wu" or
// "w" find it by its last word. Anything that is not a letter or a digit splits
// what was typed into those parts, so "rong.wu" works like "rong wu". Accounts
// whose initials begin the name come first, the rest after them, and both groups
// keep the alphabetical order of the list. Each entry is { account, matchIndexes },
// the indexes of the letters the typed text covered, so they can be marked in the
// list.
function matchStudentAccounts(query) {
    const parts = query.toLowerCase().match(STUDENT_WORD_PATTERN) ?? [];

    if (!parts.length) {
        return []; // nothing typed yet, nothing to suggest
    }

    const first = [];
    const rest = [];

    for (const account of studentAccounts) {
        const matchIndexes = matchStudentInitials(account.name, parts);

        if (!matchIndexes) continue;

        (matchIndexes[0] === 0 ? first : rest).push({ account, matchIndexes });
    }

    return first.concat(rest);
}

// Text nodes with a <mark> over the letters the typed text matched, so the list
// shows which part of the name was typed. The matched letters sit next to each
// other inside a word — "rong" is one run — but a typed part per word leaves a gap
// between the runs, so "r w" is two, which is why this cannot be a single slice.
// Built as nodes rather than innerHTML, because the names come from the backend.
function markStudentMatch(name, matchIndexes) {
    const fragment = document.createDocumentFragment();

    if (!matchIndexes?.length) {
        fragment.append(document.createTextNode(name));
        return fragment;
    }

    let cursor = 0;

    for (const [start, end] of studentMatchRuns(matchIndexes)) {
        if (start < cursor) continue; // overlapping runs must not nest two marks

        fragment.append(document.createTextNode(name.slice(cursor, start)));

        const mark = document.createElement('mark');
        mark.textContent = name.slice(start, end + 1);
        fragment.append(mark);

        cursor = end + 1;
    }

    fragment.append(document.createTextNode(name.slice(cursor)));

    return fragment;
}

// The matched indexes grouped into the runs they form, each run as its first and
// last index: [0, 1, 2, 3, 9] gives [[0, 3], [9, 9]]. Indexes that repeat, or that
// carry on inside a run, are folded in so one run is marked once.
function studentMatchRuns(matchIndexes) {
    const runs = [];

    for (const index of [...matchIndexes].sort((a, b) => a - b)) {
        const run = runs[runs.length - 1];

        if (run && index <= run[1]) {
            continue;
        }

        if (run && index === run[1] + 1) {
            run[1] = index;
            continue;
        }

        runs.push([index, index]);
    }

    return runs;
}

// One <li role="option">: the name with the matched letters marked, plus the
// supervisor as a muted aside so two similar names can be told apart.
function makeStudentOption(account, matchIndexes, index) {
    const option = document.createElement('li');
    option.className = 'combo__option';
    option.id = `studentoption-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.setAttribute('data-student-name', account.name);

    const name = document.createElement('span');
    name.className = 'combo__option-name';
    name.append(markStudentMatch(account.name, matchIndexes));
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

// Fills the open list with the accounts whose initials match the typed text: the
// account name has to start with what was typed, word for word. The list stays shut
// when there is nothing to show, and the hint says what happened.
function renderStudentList() {
    if (!studentInput || !studentList) return;

    const query = studentInput.value.trim();
    const matches = matchStudentAccounts(query);
    const shown = matches.slice(0, STUDENT_LIST_LIMIT);

    studentActive = -1;
    studentInput.removeAttribute('aria-activedescendant');

    if (shown.length) {
        studentList.replaceChildren(...shown.map((match, index) =>
            makeStudentOption(match.account, match.matchIndexes, index)));
        openStudentList();

        setStudentHint(studentListHint(shown, matches.length));
        return;
    }

    closeStudentList();

    if (studentListFailed) {
        // No list to filter, so saying "nothing matches" would be a lie. The
        // backend is asked again about the username when Next is pressed, so a
        // name typed here can still be confirmed even without this list.
        setStudentHint(
            'The account list could not be loaded — the backend is asked again about the username when you press Next.',
            true
        );
        return;
    }

    if (!query) {
        return; // nothing typed and the list is fine: stay quiet
    }

    setStudentHint(
        `No account has the initials "${query}" — the list looks at the first letters of a name only, so "rong" finds "Rongrong Wu". A full username is still checked when you press Next.`,
        false
    );
}

// What the hint says while the list is open: nothing when the list speaks for
// itself, a count when it was cut short, and a nudge to pick when one account is
// left — initials are not a username, so Next would refuse them on their own.
function studentListHint(shown, total) {
    if (total === 1) {
        return `One account matches — press Enter or click "${shown[0].account.name}" to put that username in the field.`;
    }

    if (total > shown.length) {
        return `Showing ${shown.length} of ${total} matches — keep typing the initials to narrow them down.`;
    }

    return '';
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

