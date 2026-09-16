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
      body: formData
    });

    // 5. Handle the server's response
    if (response.ok) {
      const result = await response.json(); // Assuming the server responds with JSON
      console.log('Success:', result);
      if (result.message == "user already exists") {
          alert("user already exists")
      } else {
          alert('Form submitted successfully!');
      }
    } else {
      console.error("Validation error:", await response.json());
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
                    `Name: ${user.name} | Balance: ${user.balance} | Supervisor: ${user.supervisor}`;

                results.appendChild(paragraph);
            }
    } catch (error) {
        console.error('Network error:', error);
    }
});
