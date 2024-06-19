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
