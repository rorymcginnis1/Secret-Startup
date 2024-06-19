document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const formData = new FormData(this);
    console.log('Form Data:', formData); // Check FormData in console

    fetch('/login', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('Response:', data); // Log server response for debugging

        if (data.message === 'Invalid credentials') {
            alert('Invalid credentials'); // Show alert for invalid credentials
        } else if (data.message === 'Login successful') {
            alert('Login successful!'); // Display alert for successful login
            window.location.href = '/'; // Redirect to homepage or desired page
        } else {
            alert('Unexpected response from server'); // Handle unexpected response
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error logging in. Please try again later.');
    });
});