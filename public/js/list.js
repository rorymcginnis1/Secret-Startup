function removeItem(index) {
    fetch(`/deleteItem/${index}`, {
        method: 'DELETE',
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderList(data.test);
        } else {
            console.error('Failed to delete item.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// Function to render updated list after item deletion
function renderList(test) {
    const list = document.querySelector('ul');
    list.innerHTML = '';
    test.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <strong>Name:</strong> ${item[0]}<br>
            <strong>Quantity:</strong> ${item[1]}<br>
            <strong>Price:</strong> ${item[2]}<br>
            <img src="${item[3]}" alt="${item[0]}">
            <button class="delete-btn" onclick="removeItem(${index})">Delete</button>
        `;
        list.appendChild(listItem);
    });
}


document.addEventListener('DOMContentLoaded', () => {
    fetch('/get_user_files')
      .then(response => response.json())
      .then(files => {
        console.log('Fetched files:', files); // Log fetched files
        const dropdownContent = document.getElementById('dropdown-content');
        files.forEach(file => {

          console.log('Appending file:', file); // Log each file being appended
          const a = document.createElement('a');
          a.href = `/closets?file=${encodeURIComponent(file)}`; // Include file name as query parameter
          a.textContent = file;
          dropdownContent.appendChild(a);
        
        });
      })
      .catch(error => console.error('Error fetching files:', error));
  });

  document.addEventListener('DOMContentLoaded', () => {
    const addClosetLink = document.getElementById('addClosetLink');
    const container = document.getElementById('container');
    let input, addButton; // Define variables in outer scope
  
    addClosetLink.addEventListener('click', (event) => {
      event.preventDefault(); // Prevent the default link behavior
  
      // Create input element
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter closet name';
      input.setAttribute('id', 'closetNameInput');
  
      // Create button element
      addButton = document.createElement('button');
      addButton.textContent = 'Add Closet';
      addButton.addEventListener('click', handleAddCloset);
  
      // Append input and button to container
      container.appendChild(input);
      container.appendChild(addButton);
  
      // Focus on the input field
      input.focus();
    });
  
    function handleAddCloset() {
      const closetName = input.value.trim(); // Get trimmed input value
  
      if (closetName) {
        // Make a server-side call to /add_closet with the closetName
        fetch('/add_closet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ closetName })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Error adding closet');
          }
          // Redirect to /home after successful addition
          window.location.href = '/';
        })
        .catch(error => {
          console.error('Error adding closet:', error.message);
          alert('Error adding closet. Please try again.'); // Notify user of error
        })
        .finally(() => {
          // Clean up DOM: Remove input and button
          if (input && input.parentNode) {
            input.parentNode.removeChild(input);
          }
          if (addButton && addButton.parentNode) {
            addButton.parentNode.removeChild(addButton);
          }
        });
      } else {
        alert('Please enter a closet name.');
      }
    }
  
    // Event listener for Enter key press on input field
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        handleAddCloset();
      }
    });
  });
  

  function sendSelectedItems() {
    const selectedItems = []; // Array to store selected items

    // Assuming you have a list of items with checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');

    checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.value); // Convert string to integer
        selectedItems.push(index); // Add the selected item to the array
    });

    // Make a fetch request to send selectedItems to the server
    fetch('/process_selected_items', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedItems }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to send selected items');
        }
        return response.json();
    })
    .then(data => {
        console.log('Response from server:', data);

        window.location.href = '/load';
    })
    .catch(error => {
        console.error('Error sending selected items:', error);
        window.location.href = '/load';
    });
}

