// 1. Select the form
const form = document.getElementById('adduserform');

// 2. Listen for the submit event
form.addEventListener('submit', async function(event) {
  // Prevent the default browser behavior (reloading the page)
  event.preventDefault(); 

  // 3. Gather the form data
  const formData = new FormData(form);
  
  // Convert the FormData into a standard JavaScript object

  try {
    // 4. Send the request to your server
    const response = await fetch('http://192.168.4.29:8000/adduser', {
      method: 'POST', // Use POST to send data
      body: formData
    });

    // 5. Handle the server's response
    if (response.ok) {
      const result = await response.json(); // Assuming the server responds with JSON
      console.log('Success:', result);
      alert('Form submitted successfully!');
    } else {
      console.error("Validation error:", await response.json());
    }
    
  } catch (error) {
    // This catches network errors (e.g., the server is down or unreachable)
    console.error('Network Error:', error);
  }
});

const form1 = document.getElementById('getuserform');

