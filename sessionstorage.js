// Session storage for the transaction flow.
//
// transaction1.html stores the student username here before moving on, and the
// later pages read it back so every following step knows which account is being
// changed. Loaded by transaction1.html and transaction-middle.html.

const STUDENT_USERNAME_KEY = 'student_username';
const TRANSACTION_NEXT_URL = '/transaction-middle.html';

const transactionForm = document.getElementById('transactionform');
const transactionNext = document.getElementById('transactionnext');
const transactionStudent = document.getElementById('transactionstudent');

// Stores the trimmed username and returns whether that worked.
function storeStudentUsername() {
    const field = transactionForm?.elements.namedItem('student_username');
    const username = field ? field.value.trim() : '';

    if (!username) {
        alert('Enter a student username first.');
        return false;
    }

    sessionStorage.setItem(STUDENT_USERNAME_KEY, username);
    console.log('Stored student username in sessionStorage:', username);
    return true;
}

// transaction1.html: Next is a plain link, so only the empty-username case has
// to cancel the navigation.
transactionNext?.addEventListener('click', function (event) {
    if (!storeStudentUsername()) {
        event.preventDefault();
    }
});

// Pressing Enter inside the single input submits the form, not the link.
transactionForm?.addEventListener('submit', function (event) {
    event.preventDefault();

    if (storeStudentUsername()) {
        window.location.href = TRANSACTION_NEXT_URL;
    }
});

// transaction-middle.html: show who the transaction is for.
if (transactionStudent) {
    transactionStudent.textContent = sessionStorage.getItem(STUDENT_USERNAME_KEY) || 'no student selected';
}

