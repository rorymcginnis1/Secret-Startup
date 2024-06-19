async function validateForm(event) {
    event.preventDefault(); // Prevent the form from submitting immediately

    const email = document.getElementById('email').value.toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;

    if (!terms) {
        alert('You must agree to the terms of service.');
        return false;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return false;
    }

    try {
        const response = await fetch('/creds.json');
        const data = await response.json();

        const emailExists = data.some(user => user.email.toLowerCase() === email);
        if (emailExists) {
            alert('Email already has an account.');
            return false;
        }

        // If validation passes, submit the form programmatically
        document.getElementById('createUserForm').submit();
    } catch (error) {
        console.error('Error fetching or parsing JSON:', error);
        alert('An error occurred. Please try again later.');
        return false;
    }
}
