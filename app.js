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

// Bonus page ---------------------------------------------------------------
// transaction_bonus.html fills its dropdown with every bonus the backend knows
// about. No bonus route existed yet when this was written - every candidate
// (/getbonus, /getbonuses, /bonuses, /bonus, /get-bonus, /allbonus) answers
// 404 - so /getbonus follows the naming of /getuser, and the built-in list
// already in the page stays in place until the backend answers. Change this one
// constant when the real route lands.
const BONUS_URL = 'https://api.rongrongwu.com/reasons/bonus-bucks';

const bonusSelect = document.getElementById('bonus');
const bonusResults = document.getElementById('bonusresults');

// Accepts the shapes the API might use: ["X"], [{"name": "X"}], {"bonuses": []},
// {"data": []}, or a single object.
function bonusList(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    for (const key of ['bonuses', 'bonus', 'data', 'items']) {
        if (Array.isArray(payload?.[key])) {
            return payload[key];
        }
    }

    return payload ? [payload] : [];
}

// Plain strings are used as they are, objects give up their name (or title,
// label, id) and answer with their id when they have one.
function bonusEntry(entry) {
    if (entry === null || typeof entry !== 'object') {
        return { label: String(entry), value: String(entry) };
    }

    const label = entry.name ?? entry.title ?? entry.label ?? entry.id;

    return { label: String(label), value: String(entry.id ?? label) };
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
// "choose a bonus" entry at the top.
function fillBonusOptions(bonuses) {
    if (!bonusSelect) return;

    const placeholder = bonusSelect.options?.length ? bonusSelect.options[0].textContent : 'Choose a bonus…';
    const options = [makeOption('', placeholder, true)];

    for (const entry of bonuses) {
        const { label, value } = bonusEntry(entry);
        options.push(makeOption(value, label, false));
    }

    bonusSelect.replaceChildren(...options);
}

function setBonusEnabled(enabled) {
    if (!bonusSelect) return;

    if (enabled) {
        bonusSelect.removeAttribute('aria-disabled');
    } else {
        bonusSelect.setAttribute('aria-disabled', 'true');
    }
}

function showBonusMessage(text, isError) {
    if (!bonusResults) return;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    if (isError) {
        paragraph.className = 'results__error';
    }

    bonusResults.replaceChildren(paragraph);
}

async function loadBonuses() {
    if (!bonusSelect) return; // only transaction_bonus.html has the dropdown

    setBonusEnabled(false);

    try {
        const response = await fetch(BONUS_URL, {
            method: "GET",
            credentials: 'include' // the bonus list is admin data
        });

        if (!response.ok) {
            // 404 = the backend has no bonus route yet, so the built-in list the
            // page ships with stays in the dropdown.
            console.error('Bonus list error:', response.status, await response.text());
            setBonusEnabled(true);
            showBonusMessage(`The backend could not list the bonuses (${response.status}) — using the built-in list.`, true);
            return;
        }
        const bonus_json = await response.json()
        console.log("response json: ", bonus_json)
        const bonuses = bonusList(bonus_json);
        console.log(bonuses)
        if (bonuses.length === 0) {
            setBonusEnabled(true);
            showBonusMessage('The backend returned no bonuses — using the built-in list.', true);
            return;
        }

        fillBonusOptions(bonuses);
        setBonusEnabled(true);
        showBonusMessage(`Loaded ${bonuses.length} bonus${bonuses.length === 1 ? '' : 'es'} from the backend.`, false);
    } catch (error) {
        console.error('Network Error:', error);
        setBonusEnabled(true);
        showBonusMessage('Network error — the bonus list could not be loaded, using the built-in list.', true);
    }
}

loadBonuses();