'use strict';

const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const path = require('path');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const { Base64 } = require('js-base64'); // Import js-base64 package
const openai = require('openai'); // Import OpenAI package
const fs = require('fs');
const gmail = google.gmail('v1');

const express = require('express');
const app = express();
const port = 3001;

//RF: It seems like semicolons at the end are optional here?
var total = 0
//var count = 0; //RF: This variable is unused.
//RF: Does this need to be initialized? 
var items =[]

const apiKey = process.env.OPENAI_API_KEY;
const endpointUrl = 'https://api.openai.com/v1/chat/completions';


/* This code allows the file to be both executed directly as a script (running runSample()), 
and imported as a module in another file (by exporting runSample). When executed directly, 
it runs runSample(), and when imported, it makes the runSample function available to the importing module. */

//This condition checks if the current module is being executed directly as the main module by Node.js (require.main).
if (module === require.main) {
  runSample().catch(console.error);
}

//This exports the runSample function as the main export of the module. 
//This allows other modules to import and use the runSample function if needed.
module.exports = runSample;


/*
Rachel's notes

Order of operations:

TODO: Suggestion - create a "main" type function and flatten out calls, calling as much as possible from this main function.
That will make the code more readable and easy to contribute to.
TODO: Create a landing page. Have a login option. Login option has a pop-up about our security measures. 
TODO: Can we move all console logs to a file so it's easier to search through?
TODO: Try to do "real" google auth so any user can connect without doing the email key
TODO: Figure out how to make the message body fit without hard coding email contents

//Connect to Google, auth in, request emails, and send them for processing.
Entry -> async function runSample()

-> //Ask ChatGPT if the email is a receipt or not.
async function confirmReceipt(subject)

-> //Recursive function used to get the main body of the email
function getBody(payload) {

-> //Get the images from the email body to display later.
function extractImageTags(payload) {
 
-> Prime chatGPT via getChatGPTResponse('hello there');

// Function to recursively extract the result tokens from ChatGPT
async function promptOpenAI(Prompt)



//Generic ChatGPT function to capture a response given a variable prompt
async function getChatGPTResponse(prompt) {

*/

/*RF: Does javascript define all variables in the file before executing any code? 
How does is treat code outside of functions? */



//Connect to Google, auth in, request emails, and send them for processing.
async function runSample() {
  try {
    // Obtain user credentials to use for the request
    const auth = await authenticate({
      keyfilePath: path.join(__dirname, process.env.EMAIL_KEY),
      scopes: 'https://www.googleapis.com/auth/gmail.readonly',
    });
    google.options({ auth });

    //RF: TODO: I can't figure out how the number of messages is being limited to 100.
    //RF: TODO: Where is userId being defined? This seems to be used without a variable definition. 
    const res = await gmail.users.messages.list({ userId: 'me' });
    const messages = res.data.messages;
    //console.log("Total number of messages: ", messages) //TODO: Figure out how to get the size of this list

    for (const message of messages) {
      const messageId = message.id;
      const fullMessage = await gmail.users.messages.get({ userId: 'me', id: messageId });
      const headers = fullMessage.data.payload.headers;
      const subjectHeader = headers.find(header => header.name === 'Subject');

      console.log("Email ID: ", messageId)
      if (subjectHeader) {
        
        const subject = subjectHeader.value;

        // Check if the subject matches the specific string
        if (subject.toLowerCase().includes('order') || subject.toLowerCase().includes('receipt') || 
            subject.toLowerCase().includes('purchase') || subject.toLowerCase().includes('confirmation')) {

          const isReceipt = await confirmReceipt(subjectHeader.value)
          console.log(subjectHeader.value)
          console.log("Is this a receipt? ", isReceipt)
          if (isReceipt) {
          
            total+=1 //RF: This variable doesn't seem to get used other than printing it to the console?
            const from = headers.find(header => header.name === 'From').value;
            const date = headers.find(header => header.name === 'Date').value;
            const snippet = fullMessage.data.snippet;

            // Extract the message body using the recursive function
            const body = getBody(fullMessage.data.payload);
            const img = extractImageTags(fullMessage.data.payload);

            /*RF: Do we have to do this part? I assume it's to cut down the size of the body so we don't hit
            token limits with ChatGPT, but this is pretty specifc. */
            // Define patterns to extract the desired part of the body
            const startPattern = /Order summary|Thank you for your purchase!/i;
            const endPattern = /---------- Forwarded message ---------|<div|<\/body>/i;

            // Extract the relevant section of the body
            const part2 = extractSection(body, startPattern, endPattern);

            console.log('Subject:', subject);
            console.log('Body Character Count:', body.length);
            const total_body=body+img;
            //console.log(total_body);
            var arr = extractReceiptData(total_body)
            for (let i =0; i<arr.length; i++){
              items.push(arr[i])
            }

            //RF: I assume this is to prime ChatGPT to be ready for a task?
            // Check if the message body contains "hello there"
            if (body.toLowerCase().includes('hello there')) {
              const chatResponse = await getChatGPTResponse('hello there');
              console.log('ChatGPT response:', chatResponse);
            }
          }
        }
      }
    }
    var test=[['Deluxe Washable Wool Pillow',2, 97.5, 'https://www.thewoolroom.com/images/email/Email-US-Bedding.png'],
   ['Exa Jump Start Smoothing Primer Deluxe Sample', 1, 28.0, 'https://cdn.shopify.com/s/files/1/0637/6147/products/Exa_PrimerMiniSilo_1_compact_cropped.png?v=1659535755'],
   ['Royal Tulip Cleansing Jelly' , 1, 0.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Royal_Tulip_Cleansing_Jelly_01_compact_cropped.png?v=1712337770'],
   ['High Fidelity Brightening Concealer Stick', 1, 29.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Exa_ConcealerStick_01_078_compact_cropped.png?v=1711518699']]

    console.log("total = ", total);
    console.log(items);
    for (let i=0; i<test.length; i++){
      items.push(test[i])
    }
    console.log(items);

    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}


//Ask ChatGPT if the email is a receipt or not.
async function confirmReceipt(subject) {
  console.log("confirmReceipt")
  const str = `Do you think this is a receipt or order confirmation for something that 
  has been purchased? Answer only with the word yes or no in lower case with no punctuation. Exclude subscriptions.\n`+subject

  //console.log(str)
  const ans = await promptOpenAI(str);
  //console.log(ans)
  if (ans=='yes'){
    return true;
  }
  else{
    return false;
  }
}


  /*
  chatgpt(string body)
  body = based on this code can you tell me what was bought, how much it was purchased for, how many of each item were purchased and provide the image for each item?
  */

//Extract the receipt data via ChatGPT and put the result into an array.
async function extractReceiptData(text_body) {
  console.log("extractReceiptData")
  const prompt =`based on this code can you tell me what was bought, the full price of the individual item(discounts should not be included), how many of each item were purchased and provide the image for each item?
 
  can you put it in an array so that I can use it in html
  
  the array should be this
  
  <name of item, quantity of item, price of individual item, image of item>
  
  If there is more than one different kind of item then return more than 1 different array
  
  If there is multiple of 1 item then that item need only be represented by a single array
  
  Please only display the array const items, nothing else, but please do not display the code for the const items just the array for example [...,...,...,...] only. do not set the array = to anything, just display the array in javascript
  
  Please do not have any other text display only the array
  
  if there is no info please return an empty array\n\n`+text_body; 
 
  //console.log("This here")
  //console.log(prompt)
  
  const information = await promptOpenAI(prompt);
  console.log(information)
  addToJSON(information);
 
  return []
 }



// Function to recursively extract the result tokens from ChatGPT
async function promptOpenAI(prompt) {
  console.log("promptOpenAI")
  try {
      const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}` //RF: Are there different tick marks here on purpose?
          },
          body: JSON.stringify({
            
              model: 'gpt-3.5-turbo', // Using gpt-3.5-turbo model
              messages: [
                {"role": "system", "content": "You are an AI that answers questions with high accuracy and consistency."},
    
                //RF: content seems to be a variable, but I don't see where this is getting defined or filled??
                { "role": 'user', content: prompt }], // Provide the user's message
              max_tokens: 500,
              temperature: 0,  
              top_p: 1
          })
      });

      if (!response.ok) {
          const errorDetails = await response.json();
          throw new Error(`Failed to fetch response from OpenAI API. HTTP status: ${response.status}, Error: ${JSON.stringify(errorDetails)}`);
      }

      const data = await response.json();
      console.log('API response:', data.choices[0].message.content.trim());
      const responseString = data.choices[0].message.content.trim();

      // The processing of the responseString is omitted here as it is not used in the main logic
      return responseString;
  } catch (error) {
      console.error('Error:', error);
      return null; // Return null in case of error
  }
}




//Recursive function used to get the main body of the email
function getBody(payload) {
  console.log("getBody")
  let body = '';

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body.data) {
        body += Base64.decode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } else if (part.parts) {
        body += getBody(part);
      }
    }
  } else if (payload.body.data) {
    if (payload.mimeType === 'text/html') {
      body += Base64.decode(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
  }

  return body;
}


// Function to extract a section of the email body based on start and end patterns
function extractSection(body, startPattern, endPattern) {
  const startIndex = body.search(startPattern);
  if (startIndex === -1) return ''; // Start pattern not found

  const startPart = body.slice(startIndex);
  const endIndex = startPart.search(endPattern);
  if (endIndex === -1) return startPart.trim(); // End pattern not found

  return startPart.slice(0, endIndex).trim();
}



//Generic ChatGPT function to capture a response given a variable prompt
async function getChatGPTResponse(prompt) {
  console.log('Prompt:', prompt); // Log the prompt being sent to ChatGPT

  //RF: apiKey is defined as process.env.OPENAI_API_KEY at the top of the file. What is this call doing?
  //I couldn't find anything on this configuration class in the openai documentation and 
  //This page implies you no longer need to use the configuration class: https://community.openai.com/t/getting-an-error-when-importing-configuration-and-openaiapi-from-openai/325012

  const configuration = new openai.Configuration({ 
    apiKey: process.env.OPENAI_API_KEY, // Ensure you set the API key in your environment
  });

  const openaiClient = new openai.OpenAIApi(configuration);

  try {
    const response = await openaiClient.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 50,
    });

    const chatResponse = response.data.choices[0].text.trim();
    console.log('ChatGPT Response:', chatResponse); // Log the response received from ChatGPT
    return chatResponse;
  } catch (error) {
    console.error('Error fetching response from OpenAI:', error);
    return 'Error fetching response from ChatGPT';
  }
}



function cropText(text) {
    // Define a regular expression pattern to match text within <>
    var pattern = /<[^>]*>/g;
    // Use replace() method to replace all matches of the pattern with an empty string
    var croppedText = text.replace(pattern, '');
    return croppedText.trim();
}


//RF: I assume this is global just because this is a recursive function and you needed the variable to not get set multiple times?
let bod = '';

//Get the images from the email body to display later.
function extractImageTags(payload) {
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body.data) {
        const htmlContent = Base64.decode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        const imageTags = htmlContent.match(/<img[^>]+>/g);
        if (imageTags) {
          bod += imageTags.join('');
        }
      } else if (part.parts) {
        extractImageTags(part);
      }
    }
  } else if (payload.body.data) {
    if (payload.mimeType === 'text/html') {
      const htmlContent = Base64.decode(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      const imageTags = htmlContent.match(/<img[^>]+>/g);
      if (imageTags) {
        bod += imageTags.join('');
      }
    }
  }

  return bod;
}

//RF: Does this called from anywhere? I can't find a function call.
function chatGPT(str) {
  //needs to be written
  const yes = 'yes'
  const no = 'no'
  return yes
}



//Append new data to the json file.
function addToJSON(data) {
  let existingData = [];

  // Check if info.json exists, if not, create an empty file
  if (!fs.existsSync('info.json')) {
      try {
          fs.writeFileSync('info.json', '[]');
          console.log('info.json created successfully.');
      } catch (error) {
          console.error('Error creating info.json:', error);
          return;
      }
  } else {
      // Read the existing data from info.json
      try {
          existingData = JSON.parse(fs.readFileSync('info.json'));
      } catch (error) {
          console.error('Error reading info.json:', error);
          return;
      }
  }

  // Append the new data to the existing array
  existingData.push(data);

  // Write the updated data back to info.json
  try {
      fs.unlinkSync('info.json'); // Delete the file
      fs.writeFileSync('info.json', JSON.stringify(existingData, null, 2));
      console.log("Data appended to info.json successfully.\n\n\n\n");
  } catch (error) {
      console.error('Error writing to info.json:', error);
  }
}

//Delete the json file.
function deleteJSON() {
  try {
      fs.unlinkSync('info.json');
      console.log('info.json deleted successfully.');
  } catch (error) {
      console.error('Error deleting info.json:', error);
  }
}


//TODO
function getBody(payload) {
  let body = '';

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Base64.decode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } else if (part.parts) {
        body += getBody(part);
      }
    }
  } else if (payload.body.data) {
    if (payload.mimeType === 'text/plain') {
      body += Base64.decode(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
  }
  const ct= cropText(body)

  return ct;
}


function parseTextArray() {
  // Initialize an empty array to store the arrays of items
  const itemsArray = [];

  // Loop through the response array and group the items into arrays of arrays
          for (let i = 0; i < responseArray.length; i += 4) {
      // Extract the name, quantity, price, and image URL from each chunk of the response array
              const name = responseArray[i].replace(/[\[\]"\n\s-]/g, ' ').trim(); // Remove square brackets, quotes, newlines, whitespace, and hyphens
              const quantity = parseInt(responseArray[i + 1]);
              const price = parseFloat(responseArray[i + 2]);
              const imageURL = responseArray[i + 3].replace(/[\[\]"\n\s]/g, ''); // Remove square brackets, quotes, newlines, and whitespace
      
      // Create an array representing each item and push it to the itemsArray
              itemsArray.push([name, quantity, price, imageURL]);
          }
  
    console.log(itemsArray);
    return itemsArray;
}




     /*(['Deluxe Washable Wool Pillow',2, 97.5, 'https://www.thewoolroom.com/images/email/Email-US-Bedding.png'])
   ['Exa Jump Start Smoothing Primer Deluxe Sample', 1, 28.0, 'https://cdn.shopify.com/s/files/1/0637/6147/products/Exa_PrimerMiniSilo_1_compact_cropped.png?v=1659535755'],
 ['Royal Tulip Cleansing Jelly' , 1, 0.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Royal_Tulip_Cleansing_Jelly_01_compact_cropped.png?v=1712337770'],
 ['High Fidelity Brightening Concealer Stick', 1, 29.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Exa_ConcealerStick_01_078_compact_cropped.png?v=1711518699'])
    */

function infoExists() {
  return fs.existsSync('info.json');
}

//RF: When do these bits of code outside of functions get run? On exit?
if (infoExists()) {
  deleteJSON();
} else {
  console.log("info.json does not exist. Skipping deletion.");
}




// Existing data
var tester = "['Deluxe Washable Wool Pillow', 2, 97.5, 'https://www.thewoolroom.com/images/email/Email-US-Bedding.png'],['Exa Jump Start Smoothing Primer Deluxe Sample', 1, 28.0, 'https://cdn.shopify.com/s/files/1/0637/6147/products/Exa_PrimerMiniSilo_1_compact_cropped.png?v=1659535755']]";

// New data to add (input string)


// Parse the existing data string into an array
const parsedExistingData = tester.split("],[")
                                .map(str => str.replace("[", "").replace("]", ""))
                                .map(str => str.split(",").map(s => s.trim()));

// Parse the new data string into an array


// Concatenate the parsed existing data and new data arrays
const concatenatedData = parsedExistingData;

// Write the concatenated data to a JSON file
//fs.writeFileSync('test.json', JSON.stringify(concatenatedData, null, 2), 'utf8');
var test= [
  [
    'Lava Pumice Stone with Cotton Hanging Loop',
    1,
    7.49,
    'undefined'
  ],
  [ 'Dishwashing Soap Bars', 1, 11.98, 'undefined' ],
  [ 'Conditioner Bars', 1, 10.99, 'undefined' ],
  [ 'Bottle Scrub Brush', 1, 7.99, 'undefined' ],
  [
    'Biodegradable Charcoal Dental Floss 2 Pack',
    1,
    11.99,
    'undefined'
  ],
  [ 'Konjac Facial Cleansing Sponge', 1, 4.99, 'undefined' ]
] 
const jsonData = JSON.stringify(test);
fs.writeFile('test.json', jsonData, (err) => {
  if (err) throw err;
  console.log('Data written to file');
});
// Set the view engine to EJS
app.set('view engine', 'ejs');

// Middleware to read the JSON file for each request
app.use((req, res, next) => {
    fs.readFile('test.json', 'utf8', (err, data) => {
        if (err) {
            return next(err);
        }
        req.test = JSON.parse(data);
        next();
    });
});

// Define a route to render the items
app.get('/', (req, res) => {
    res.render('index', { test: req.test });
});

// Define a route to delete an item
app.delete('/deleteItem/:index', (req, res) => {
    const index = req.params.index;
    if (index < 0 || index >= req.test.length) {
        return res.status(400).json({ success: false, message: 'Invalid index' });
    }
    req.test.splice(index, 1);
    fs.writeFile('test.json', JSON.stringify(req.test, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to write file' });
        }
        res.json({ success: true, test: req.test });
    });
});

//RF: Reading online it seems like javascripts executes from the top of the file, so why is this at the bottom?
// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});







