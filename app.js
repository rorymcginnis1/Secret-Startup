'use strict';

const dotenv = require('dotenv');
dotenv.config();

const path = require('path');
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const { authenticate } = require('@google-cloud/local-auth');
const { Base64 } = require('js-base64');
const openai = require('openai');
const fs = require('fs');

const { OAuth2 } = google.auth;
const app = express();
const port = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
var current_user="";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];



var strings =""

if (fs.existsSync("output.json")) {
    fs.unlinkSync("output.json");
    addOutput('File deleted successfully');
} else {
    addOutput('File does not exist');
}


// Function to create a new file

fs.writeFileSync("output.json", '', 'utf8');
addOutput('File created successfully');







// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Setting up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/email_info', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {

  const { code } = req.query;
  if (code) {
    try {
        if (fs.existsSync('info.json')) {
            deleteJSON();
          } else {
            addOutput("info.json does not exist. Skipping deletion.");
          }
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      addOutput('Access tokens:', tokens);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      addOutput('User profile:', profile.data);

      const messages = await gmail.users.messages.list({ userId: 'me', maxResults: 40 });
      const m = messages.data.messages;
      addOutput('Messages:', messages.data);

      let items = [];
      let total = 0;

      for (const message of m) {
        const messageId = message.id;
        const fullMessage = await gmail.users.messages.get({ userId: 'me', id: messageId });
        const headers = fullMessage.data.payload.headers;
        const subjectHeader = headers.find(header => header.name === 'Subject');

        addOutput("Email ID: ", messageId);

        if (subjectHeader) {
          const subject = subjectHeader.value;
          if (subject.toLowerCase().includes('order') || subject.toLowerCase().includes('receipt') || 
              subject.toLowerCase().includes('purchase') || subject.toLowerCase().includes('confirmation')) {

            const isReceipt = await confirmReceipt(subjectHeader.value);
            addOutput(subjectHeader.value);
            addOutput("Is this a receipt? ", isReceipt);

            if (isReceipt) {
              total += 1;
              const from = headers.find(header => header.name === 'From').value;
              const date = headers.find(header => header.name === 'Date').value;
              const snippet = fullMessage.data.snippet;

              const body = getBody(fullMessage.data.payload);
              const img = extractImageTags(fullMessage.data.payload);

              const startPattern = /Order summary|Thank you for your purchase!/i;
              const endPattern = /---------- Forwarded message ---------|<div|<\/body>/i;
              const part2 = extractSection(body, startPattern, endPattern);

              addOutput('Subject:', subject);
              addOutput('Body Character Count:', body.length);
              const total_body = body + img;
              const arr = extractReceiptData(total_body);
              for (let i = 0; i < arr.length; i++) {
                items.push(arr[i]);
              }
              addOutput("This line here");
              addOutput(items);

              if (body.toLowerCase().includes('hello there')) {
                const chatResponse = await getChatGPTResponse('hello there');
                addOutput('ChatGPT response:', chatResponse);
              }
            }
          }
        }
      }

      const test = [
        ['Deluxe Washable Wool Pillow', 2, 97.5, 'https://www.thewoolroom.com/images/email/Email-US-Bedding.png'],
        ['Exa Jump Start Smoothing Primer Deluxe Sample', 1, 28.0, 'https://cdn.shopify.com/s/files/1/0637/6147/products/Exa_PrimerMiniSilo_1_compact_cropped.png?v=1659535755'],
        ['Royal Tulip Cleansing Jelly', 1, 0.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Royal_Tulip_Cleansing_Jelly_01_compact_cropped.png?v=1712337770'],
        ['High Fidelity Brightening Concealer Stick', 1, 29.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Exa_ConcealerStick_01_078_compact_cropped.png?v=1711518699']
      ];

      addOutput("total = ", total);
      addOutput(items);
      for (let i = 0; i < test.length; i++) {
        items.push(test[i]);
      }
      addOutput(items);
      await get_info_array();
      addOutput("POP");
      res.redirect(`/populate`);
    } catch (error) {
      console.error('Error retrieving access token or making API request', error);
      res.send('Error retrieving access token or making API request');
    }
  } else {
    res.send('No code provided');
  }
});




app.use(express.static(path.join(__dirname)));  // Correctly serve static files
  
  
  app.get('/home', (req, res) => {
    add_to_output()

    res.render('home');
  });

  app.get('/terms', (req, res) => {
    res.render('terms_of_service');
  });

app.get('/createUser', (req, res) => {
  res.render('createUser');
});

app.post('/createUser', (req, res) => {
  const { email, password, confirmPassword, terms } = req.body;

  if (password !== confirmPassword) {
      return res.status(400).send('Passwords do not match');
  }

  if (!terms) {
      return res.status(400).send('You must agree to the terms of service');
  }

  // Read existing credentials from creds.json
  fs.readFile('creds.json', (err, data) => {
      if (err && err.code !== 'ENOENT') {
          return res.status(500).send('Internal Server Error');
      }

      let creds = [];
      if (!err) {
          creds = JSON.parse(data);
      }

      // Add new credentials
      creds.push({ email, password });

      let name = "";
      name +=email;
      name+=".json"
      addOutput(name)
      
      let folderPath = "user_info";
      name = path.join(folderPath, name)
      if (!fs.existsSync(name)) {
        try {
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
          }
          fs.writeFileSync(name, '[]');
          addOutput(name, ' created successfully.');
        } catch (error) {
          console.error('Error creating ', name, " ", error);
          return;
        }
      }

      // Write updated credentials to creds.json
      fs.writeFile('creds.json', JSON.stringify(creds, null, 2), (err) => {
          if (err) {
              return res.status(500).send('Internal Server Error');
          }

          res.redirect('/login');
      });
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/invalid_login', (req, res) => {
    res.render('invalid_login');
  });

app.post('/login', (req, res) => {
  const { login, password } = req.body;

  // Read credentials from creds.json
  fs.readFile('creds.json', (err, data) => {
      if (err) {
          console.error('Error reading creds.json:', err);
          return res.status(500).send({ message: 'Internal Server Error' });
      }

      try {
          const creds = JSON.parse(data);
          const user = creds.find(user => user.email === login && user.password === password);

          if (user) {
              current_user = user.email;
              res.redirect('/')
          } else {
              res.redirect("/invalid_login");
          }
      } catch (error) {
          console.error('Error parsing creds.json:', error);
          res.status(500).send({ message: 'Internal Server Error' });
      }
  });
});


// Middleware to read the JSON file for each request
app.use((req, res, next) => {
      let name="";
      name+=current_user;
      name+=".json"
      addOutput(name)
      const filePath = path.join(__dirname, 'user_info', name);

      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next(err);
        }
        req.test = JSON.parse(data);
        next();
    });
});



// Define a route to render the items
app.get('/', (req, res) => {
    addOutput(req.test)
    res.render('index', { test: req.test });
});

app.get('/sample', (req, res) => {
    addOutput(req.test)
    res.render('sample');
});



app.get('/add_items', (req, res) => {
    res.render('add_items');
  });

app.get('/terms', (req, res) => {
    res.render('home');
  });

app.get('/add_items_home', (req, res, next) => {
    let name="";
    if (current_user.length > 7) {
        current_user = current_user.slice(0, -7);
    } else {
        current_user = ""; // If current_user has less than 2 characters, set it to an empty string
    }
    addOutput("line");
    addOutput(current_user)
    name+=current_user;
    let actualPath = name+".json"
    let pendingPath = name+"pending.json"
    current_user+="pending"
    const spendingPath = path.join(__dirname, 'user_info', pendingPath);
    const sPath = path.join(__dirname, 'user_info', actualPath);

    fs.readFile(spendingPath, 'utf8', (err, spendingData) => {
        if (err) {
            return next(err); // Pass the error to the next middleware
        }

        fs.readFile(sPath, 'utf8', (err, sData) => {
            if (err) {
                return next(err); // Pass the error to the next middleware
            }

            let spendingJson;
            let sJson;
            
            try {
                spendingJson = JSON.parse(spendingData);
                sJson = JSON.parse(sData);
            } catch (parseErr) {
                return next(parseErr); // Pass JSON parsing errors to the next middleware
            }

            // Assuming both JSON files contain arrays, merge them
            const mergedData = sJson.concat(spendingJson);

            // Write the merged data back to s.json
            fs.writeFile(sPath, JSON.stringify(mergedData, null, 2), (err) => {
                if (err) {
                    return next(err); // Pass the error to the next middleware
                }

                // Delete spending.json


                    // Render the home page

                    res.redirect('/go');
                
            });
        });
    });
});


    app.get('/go', (req, res) => {
        addOutput("here")
        addOutput(current_user)
        var currentJSON = "user_info/"+current_user+".json";

        try {
            fs.unlinkSync(currentJSON);
            addOutput('info.json deleted successfully.');
        } catch (error) {
        console.error('Error deleting info.json:', error);
        }

        if (current_user.length > 7) {
            current_user = current_user.slice(0, -7);
        } else {
            current_user = ""; // If current_user has less than 2 characters, set it to an empty string
        }
        addOutput(current_user)
        


        
        res.redirect('/');
    });

  
  app.get('/populate', async (req, res, next) => {
        // Read sample.json file
        
  
        let name="";
        name+=current_user;
        name+="pending.json"
        const fPath = path.join(__dirname, 'sample.json');
        addOutput("P")
  
        fs.readFile('sample.json', (err, data) => {
          if (err) {
              console.error('Error reading creds.json:', err);
              return res.status(500).send({ message: 'Internal Server Error' });
          }
          addOutput("P")
    
          try {
              const creds = JSON.parse(data);
  
              const targetFilePath = path.join(__dirname, 'user_info', name);
              addOutput(name);
  
              fs.writeFile(targetFilePath, JSON.stringify(creds, null, 2), 'utf8', (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Failed to write file' });
                }
                res.redirect('/pending');
            });
              
  
              
  
              
  
          } catch (error) {
              console.error('Error parsing creds.json:', error);
              res.status(500).send({ message: 'Internal Server Error' });
          }
  
  
  
  });
  });

  app.get('/pending', (req, res, next) => {
    let name = `${current_user}pending.json`;
    addOutput(name);

    const filePath = path.join(__dirname, 'user_info', name);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next(err); // Passing the error to the next middleware
        }

        const fileData = JSON.parse(data); // Parsing the file data

        current_user+="pending"

        res.render('sample', { test: fileData }); // Rendering the response with file data
    });
});
  
  // Route to handle the redirect
  app.get('/redirect-to-add-items', (req, res) => {
    // Redirect to the '/add_items' page
    res.redirect('/add_items');
  });
  
  app.post('/logout', (req, res) => {
    addOutput("logout")

        current_user="";
  
        res.redirect('/home');
  
  });

  app.post('/logout_ofItems', (req, res) => {
    addOutput("logout")
    var currentJSON = "user_info/"+current_user+".json";

    try {
        fs.unlinkSync(currentJSON);
        addOutput('info.json deleted successfully.');
    } catch (error) {
    console.error('Error deleting info.json:', error);
    }
    current_user="";

    res.redirect('/home');

});
  
  
  
  // Define a route to delete an item
  app.delete('/deleteItem/:index', (req, res) => {
      const index = req.params.index;
      let name="";
      name+=current_user;
      name+=".json";
      const filePath = path.join(__dirname, 'user_info', name);
      if (index < 0 || index >= req.test.length) {
          return res.status(400).json({ success: false, message: 'Invalid index' });
      }
      req.test.splice(index, 1);
      fs.writeFile(filePath, JSON.stringify(req.test, null, 2), 'utf8', (err) => {
          if (err) {
              return res.status(500).json({ success: false, message: 'Failed to write file' });
          }
          res.json({ success: true, test: req.test });
      });
  });





app.listen(port, () => {
    addOutput(`Server running at http://localhost:${port}`);
});
























var current_user="";

//RF: It seems like semicolons at the end are optional here?
var total = 0;
//var count = 0; //RF: This variable is unused.
//RF: Does this need to be initialized? 
var items =[]

const apiKey = process.env.OPENAI_API_KEY;
const endpointUrl = 'https://api.openai.com/v1/chat/completions';


/* This code allows the file to be both executed directly as a script (running runSample()), 
and imported as a module in another file (by exporting runSample). When executed directly, 
it runs runSample(), and when imported, it makes the runSample function available to the importing module. */

//This condition checks if the current module is being executed directly as the main module by Node.js (require.main).

//This exports the runSample function as the main export of the module. 
//This allows other modules to import and use the runSample function if needed.



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


function addOutput(newLine) {

    strings+=newLine;
    strings+="\n"
}

function add_to_output(){
    var filePath = "output.json"





        // Write the updated content back to the file
        fs.writeFile(filePath, strings, 'utf8', (err) => {
            if (err) {
                console.error('Error writing file:', err);
            } else {
                console.log('File updated successfully');
            }
        });
    };






//Ask ChatGPT if the email is a receipt or not.
async function confirmReceipt(subject) {
    addOutput("confirmReceipt")
  const str = `Do you think this is a receipt or order confirmation for something that 
  has been purchased? Answer only with the word yes or no in lower case with no punctuation. Exclude subscriptions.\n`+subject


  const ans = await promptOpenAI(str);

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
    addOutput("extractReceiptData")
  const prompt =`based on this code can you tell me what was bought, the full price of the individual item(discounts should not be included), how many of each item were purchased and provide the image for each item?
 
  can you put it in an array so that I can use it in html
  
  the array should be this
  
  <name of item, quantity of item, price of individual item, image of item>
  
  If there is more than one different kind of item then return more than 1 different array
  
  If there is multiple of 1 item then that item need only be represented by a single array
  
  Please only display the array const items, nothing else, but please do not display the code for the const items just the array for example [...,...,...,...] only. do not set the array = to anything, just display the array in javascript
  
  Please do not have any other text display only the array
  
  if there is no info please return an empty array\n\n`+text_body; 
 

  
  const information = await promptOpenAI(prompt);
  addOutput(information)
  addToJSON(information);
 
  return []
 }



// Function to recursively extract the result tokens from ChatGPT
async function promptOpenAI(prompt) {
    addOutput("promptOpenAI")
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
              max_tokens: 3000,
              temperature: 0,  
              top_p: 1
          })
      });

      if (!response.ok) {
          const errorDetails = await response.json();
          throw new Error(`Failed to fetch response from OpenAI API. HTTP status: ${response.status}, Error: ${JSON.stringify(errorDetails)}`);
      }

      const data = await response.json();
      addOutput('API response:', data.choices[0].message.content.trim());
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
    addOutput("getBody")
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
    addOutput('Prompt:', prompt); // Log the prompt being sent to ChatGPT

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
    addOutput('ChatGPT Response:', chatResponse); // Log the response received from ChatGPT
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




//Append new data to the json file.
function addToJSON(data) {
  let existingData = [];

  // Check if info.json exists, if not, create an empty file
  if (!fs.existsSync('info.json')) {
      try {
          fs.writeFileSync('info.json', '[]');
          addOutput('info.json created successfully.');
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
      addOutput("Data appended to info.json successfully.\n\n\n\n");
  } catch (error) {
      console.error('Error writing to info.json:', error);
  }
}



async function get_info_array() {
    var chatGPT_array = `I have the following array, I want it to be the item name, the quantity, the price and then the link for the image
  
    can you edit the following so that it is clean and follows that format
    
    please return nothing but the correct array
    please put all of it in 1 array []\n\n`;
  
    const filePath = path.join(__dirname, 'info.json');
  
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
          console.error(`Error reading file: ${err}`);
          return reject(err); // Reject the promise if there's an error
        }
  
        chatGPT_array += data.toString();
  
        addOutput("WE OUT");
        addOutput(chatGPT_array);
  
        try {
          var chat = await promptOpenAI(chatGPT_array);
          addOutput(chat);
  
          const outputFilePath = path.join(__dirname, 'sample.json');
  
          fs.writeFile(outputFilePath, chat, 'utf8', (err) => {
            if (err) {
              console.error(`Error writing file: ${err}`);
              return reject(err); // Reject the promise if there's an error
            }
            addOutput('Chat response has been written to sample.json');
            resolve(); // Resolve the promise once writing is complete
          });
        } catch (error) {
          console.error(`Error processing chat response: ${error}`);
          reject(error); // Reject the promise if there's an error
        }
      });
    });
  }

//Delete the json file.
function deleteJSON() {
  try {
      fs.unlinkSync('info.json');
      addOutput('info.json deleted successfully.');
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
  
          addOutput(itemsArray);
    return itemsArray;
}




     /*(['Deluxe Washable Wool Pillow',2, 97.5, 'https://www.thewoolroom.com/images/email/Email-US-Bedding.png'])
   ['Exa Jump Start Smoothing Primer Deluxe Sample', 1, 28.0, 'https://cdn.shopify.com/s/files/1/0637/6147/products/Exa_PrimerMiniSilo_1_compact_cropped.png?v=1659535755'],
 ['Royal Tulip Cleansing Jelly' , 1, 0.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Royal_Tulip_Cleansing_Jelly_01_compact_cropped.png?v=1712337770'],
 ['High Fidelity Brightening Concealer Stick', 1, 29.00, 'https://cdn.shopify.com/s/files/1/0637/6147/files/Exa_ConcealerStick_01_078_compact_cropped.png?v=1711518699'])
    */



//RF: When do these bits of code outside of functions get run? On exit?



function readSample(){
    const path = './sample.json';

// Read the file asynchronously
fs.readFile(path, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }
  try {
    const jsonData = JSON.parse(data);
    addOutput('File content:', jsonData);
  } catch (error) {
    console.error('Error parsing JSON:', error);
  }
});
}