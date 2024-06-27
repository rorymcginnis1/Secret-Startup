'use strict';

const dotenv = require('dotenv');
dotenv.config();

var bunyan = require('bunyan');
var log = bunyan.createLogger({
  name: "SS",       
  streams: [
    {
      level: 'info',
      path: 'bunout.json'
    },
    {
      level:'info',
      stream: process.stdout
    }
  ]
  //</string>level: <level name or number>,      // Optional, see "Levels" section
  /*streams: [
    {
      level: 'info',
      stream: process.stdout            // log INFO and above to stdout
    },
    {
      level: 'error',
      path: '/var/tmp/myapp-error.log'  // log ERROR and above to a file
    }
  ]*/
  //</level>stream: <node.js stream>,           // Optional, see "Streams" section
  //</node.js>streams: [<bunyan streams>, ...],   // Optional, see "Streams" section
  //</bunyan>serializers: <serializers mapping>, // Optional, see "Serializers" section
  //</serializers>src: <boolean>,                     // Optional, see "src" section
});

const path = require('path');
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const { authenticate } = require('@google-cloud/local-auth');
const { Base64 } = require('js-base64');
const openai = require('openai');
const fs = require('fs');
const crypto = require('crypto');
const { info } = require('console');

const { OAuth2 } = google.auth;
const app = express();
const port = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
var current_user="";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var body_length=0
var image_length=0
var strings =""

var current_user="";


const apiKey = process.env.OPENAI_API_KEY;
const endpointUrl = 'https://api.openai.com/v1/chat/completions';

remove_file('output.json')


fs.writeFileSync("output.json", '', 'utf8');
log.info('File created successfully');

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Setting up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


//starts getting email info, allows login through .env credentials
app.get('/email_info', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});


/* START HERE */
// function used for reading email info and updating files with that info
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (code) {
    try {
      remove_file('info.json');
      fs.writeFileSync('info.json', '[]');
      log.info('info.json created successfully.');
      var sha = [];
      var m = await email_credentials(code);
      // for each message loop through
      for (const message of m) {
        //get the message info
        let { messageId, fullMessage, headers, subjectHeader, fromHeader, sender, emailMatch } = await get_message_info(message);
        if (emailMatch) {
          sender = emailMatch[1];
        } else {
        sender = sender.split(' ').pop();
        }
        sender = sender.split('@')
        log.info("Email ID: ", messageId);
        body_length = 0;
        image_length=0;
        if (subjectHeader) {
            const isReceipt = await confirmReceipt(subjectHeader.value);
            log.info(subjectHeader.value);
            log.info("Is this a receipt? ", isReceipt);
            //if it is a receipt continue
            if (isReceipt) {
              //limits duplicate entries
              var {hash, order_num} = await unduplicate(subjectHeader.value, sender)
              if(!(sha.includes(hash) )){
                if(order_num!=-1){
                  sha.push(hash)
                }

              const body = getBody(fullMessage.data.payload);
              log.info('Subject:', subjectHeader.value);
              log.info('Body Character Count:', body_length);
              
              if(body_length >=1 && image_length>=1){
                await extractReceiptData(body);
              }
              else{
                sha = sha.filter(item => item !== hash);
              }
          }}
        }
      }
      await get_info_array();

      res.redirect(`/populate`);
    } catch (error) {
      console.error('Error retrieving access token or making API request', error);
      res.send('Error retrieving access token or making API request');
    }
  } else {
    res.send('No code provided');
  }
});




app.use(express.static(path.join(__dirname))); 
  
//renders home page
app.get('/home', (req, res) => {

    res.render('home');
  });

  //renders terms page
  app.get('/terms', (req, res) => {
    res.render('terms_of_service');
  });


//renders create user page
app.get('/createUser', (req, res) => {
  res.render('createUser');
});


// checks to make sure user has fullfilled the create user requirements and then creates the user
// and adds it to creds.json if it is a new user name
app.post('/createUser', (req, res) => {
  const { email, password, confirmPassword, terms } = req.body;

  if (password !== confirmPassword) {
      return res.status(400).send('Passwords do not match');
  }
  if (!terms) {
      return res.status(400).send('You must agree to the terms of service');
  }

  fs.readFile('creds.json', (err, data) => {
      if (err && err.code !== 'ENOENT') {
          return res.status(500).send('Internal Server Error 1');
      }

      let creds = [];
      if (!err) {
          creds = JSON.parse(data);
      }

      creds.push({ email, password });
      let name = email+".json";
      log.info(name)
      
      let folderPath = "user_info";
      name = path.join(folderPath, name)
      if (!fs.existsSync(name)) {
        try {
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
          }
          fs.writeFileSync(name, '[]');
          log.info(name, ' created successfully.');
        } catch (error) {
          console.error('Error creating ', name, " ", error);
          return;
        }
      }

      fs.writeFile('creds.json', JSON.stringify(creds, null, 2), (err) => {
          if (err) {
              return res.status(500).send('Internal Server Error 6');
          }

          res.redirect('/login');
      });
  });
});


//renders login page
app.get('/login', (req, res) => {
  res.render('login');
});

//renders invalid login page
app.get('/invalid_login', (req, res) => {
    res.render('invalid_login');
  });

//login submission, if valid login will redirect to home page otherwise will redirect to not valid login page
app.post('/login', (req, res) => {
  const { login, password } = req.body;

  // Read credentials from creds.json
  fs.readFile('creds.json', (err, data) => {
      if (err) {
          console.error('Error reading creds.json:', err);
          return res.status(500).send({ message: 'Internal Server Erro 5' });
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
          res.status(500).send({ message: 'Internal Server Error 4' });
      }
  });
});


// Read the JSON file for each request and update current user
app.use((req, res, next) => {
  let name=current_user+".json";
  log.info(name)
      const filePath = path.join(__dirname, 'user_info', name);

      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next(err);
        }
        req.test = JSON.parse(data);
        next();
    });
});



// renders the home page
app.get('/', (req, res) => {
    res.render('index', { test: req.test });
});

//renders teh sample page
app.get('/sample', (req, res) => {
    res.render('sample');
});


// renders the add items page
app.get('/add_items', (req, res) => {
    res.render('add_items');
  });

//adds the items from sample.json to your home page and renders home page
app.get('/add_items_home', (req, res, next) => {
    if (current_user.length > 7) {
        current_user = current_user.slice(0, -7);
    } else {
        current_user = ""; 
    }
    log.info("line");
    log.info(current_user)

    let actualPath = current_user+".json"
    let pendingPath = current_user+"pending.json"
    current_user+="pending"
    const spendingPath = path.join(__dirname, 'user_info', pendingPath);
    const sPath = path.join(__dirname, 'user_info', actualPath);

    fs.readFile(spendingPath, 'utf8', (err, spendingData) => {
        if (err) {
            return next(err); 
        }

        fs.readFile(sPath, 'utf8', (err, sData) => {
            if (err) {
                return next(err);
            }

            let spendingJson;
            let sJson;
            try {
                spendingJson = JSON.parse(spendingData);
                sJson = JSON.parse(sData);
            } catch (parseErr) {
                return next(parseErr); 
            }

            const mergedData = sJson.concat(spendingJson);

            fs.writeFile(sPath, JSON.stringify(mergedData, null, 2), (err) => {
                if (err) {
                    return next(err); 
                }
                    res.redirect('/go');
                
            });
        });
    });
});

  //renders your home page from the populating page
    app.get('/go', (req, res) => {
      log.info("here")
      log.info(current_user)
        var currentJSON = "user_info/"+current_user+".json";

        try {
            fs.unlinkSync(currentJSON);
            log.info('info.json deleted successfully.');
        } catch (error) {
        console.error('Error deleting info.json:', error);
        }

        if (current_user.length > 7) {
            current_user = current_user.slice(0, -7);
        } else {
            current_user = "";
        }
        log.info(current_user)

        res.redirect('/');
    });

  //populates sample.json and redirects to /pending and displays the populated info
  app.get('/populate', async (req, res, next) => {
        let name=current_user+"pending.json";
        const fPath = path.join(__dirname, 'sample.json');
        log.info("P")
        fs.readFile('sample.json', (err, data) => {
          if (err) {
              console.error('Error reading creds.json:', err);
              return res.status(500).send({ message: 'Internal Server Error 3' });
          }
          log.info("P")
          try {
              const creds = JSON.parse(data);
              const targetFilePath = path.join(__dirname, 'user_info', name);
              log.info(name);
              fs.writeFile(targetFilePath, JSON.stringify(creds, null, 2), 'utf8', (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Failed to write file' });
                }
                res.redirect('/pending');
            });
              
          } catch (error) {
            res.redirect('/no_items')
          }
  });
  });

  //renders the no items page if no items appear in your email
  app.get('/no_items', (req, res, next) => {

    res.render('no_items'); 

});
  
  // renders page with items waiting for you to add them to your home page
  app.get('/pending', (req, res, next) => {
    let name = `${current_user}pending.json`;
    log.info(name);
    const filePath = path.join(__dirname, 'user_info', name);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next(err);
        }
        const fileData = JSON.parse(data); 
        current_user+="pending"
        res.render('sample', { test: fileData });
    });
});
  
  // redirects to the page where you add your items
  app.get('/redirect-to-add-items', (req, res) => {

    res.redirect('/add_items');
  });
  
  //logs out of the application
  app.post('/logout', (req, res) => {
    log.info("logout")

        current_user="";
  
        res.redirect('/home');
  
  });

  //logs out from the items page, redirects to home
  app.post('/logout_ofItems', (req, res) => {
    log.info("logout")
    var currentJSON = "user_info/"+current_user+".json";

    try {
        fs.unlinkSync(currentJSON);
        log.info('info.json deleted successfully.');
    } catch (error) {
    console.error('Error deleting info.json:', error);
    }
    current_user="";

    res.redirect('/home');

});
  
  
  // Define a route to delete an item
  app.delete('/deleteItem/:index', (req, res) => {
      const index = req.params.index;
      let name=current_user+".json";

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
  log.info(`Server running at http://localhost:${port}`);
});


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

//stores the output so it can be added to output.json file


//Ask ChatGPT if the email is a receipt or not.
async function confirmReceipt(subject) {
  log.info("confirmReceipt")
  //prompt
  const str = `Do you think this is a receipt or order confirmation for something that 
  has been purchased? Answer only with the word yes or no in lower case with no punctuation. Exclude subscriptions.\n`+subject
  const ans = await promptOpenAI(str);
  //answer can only be yes or no
  if (ans=='yes'){
    return true;
  }
  else{
    return false;
  }
}

//Extract the receipt data via ChatGPT and put the result into an array.
async function extractReceiptData(text_body) {
  log.info("extractReceiptData")
  //prompt
  const prompt =`based on this code can you tell me what was bought, the full price of the individual item(discounts should not be included), how many of each item were purchased and provide the image for each item?
  can you put it in an array so that I can use it in html
  the array should be this
  <name of item, quantity of item, price of individual item, image of item>
  make sure the image is the entire image (just the link, the css for displaying the image is unneccesary) if there is no valid image tag just put a sample.png
  If there is more than one different kind of item then return more than 1 different array
  If there is multiple of 1 item then that item need only be represented by a single array
  Please only display the array const items, nothing else, but please do not display the code for the const items just the array for example [...,...,...,...] only. do not set the array = to anything, just display the array in javascript
  Please do not have any other text display only the array
  if there is no info please return an empty array\n\n`+text_body; 
  const information = await promptOpenAI(prompt)

  log.info(information);

  addToJSON(information);

 }



// Function to prompt OpenAI and get result
async function promptOpenAI(prompt) {
  log.info("promptOpenAI")
  try {
      const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
          },
          //model specs
          body: JSON.stringify({
            
              model: 'gpt-3.5-turbo',
              messages: [
                {"role": "system", "content": "You are an AI that answers questions with high accuracy and consistency."},
                { "role": 'user', content: prompt }], 
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
      log.info('API response:'+ data.choices[0].message.content.trim());
      const responseString = data.choices[0].message.content.trim();
      // The processing of the responseString is omitted here as it is not used in the main logic
      return responseString;
  } catch (error) {
      console.error('Error:', error);
      return null;
  }
}

// crops out unnecessary characters
function cropText(text) {
    var pattern = /<[^>]*>/g;
    var croppedText = text.replace(pattern, '');
    return croppedText.trim();
}


//Append new data to the info.json file.
function addToJSON(data) {
  let existingData = [];

  if (!fs.existsSync('info.json')) {
      try {
          fs.writeFileSync('info.json', '[]');
          log.info('info.json created successfully.');
      } catch (error) {
          console.error('Error creating info.json:', error);
          return;
      }
  } else {

      try {
          existingData = JSON.parse(fs.readFileSync('info.json'));
      } catch (error) {
          console.error('Error reading info.json:', error);
          return;
      }
  }
  existingData.push(data);

  try {
      fs.unlinkSync('info.json');
      fs.writeFileSync('info.json', JSON.stringify(existingData, null, 2));
      log.info("Data appended to info.json successfully.\n\n\n\n");
  } catch (error) {
      console.error('Error writing to info.json:', error);
  }
}


// function to have chatGPT parse the info.json into usable data
async function get_info_array() {
    //promt
    var chatGPT_array = `I have the following array, I want it to be the item name, the quantity, the price and then the link for the image
    can you edit the following so that it is clean and follows that format
    please return nothing but the correct array
    please also look at the array and if any of the elements have the same name delete all but one, 
    please put all of it in 1 array []\n\n`;

    //getting info.json to add to the prompt
    const filePath = path.join(__dirname, 'info.json');
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
          console.error(`Error reading file: ${err}`);
          return reject(err); 
        }
        chatGPT_array += data.toString();
        try {
          // calling the prompt into the openAIprompt
          var chat = await promptOpenAI(chatGPT_array);
          log.info(chat);
          const outputFilePath = path.join(__dirname, 'sample.json');
          fs.writeFile(outputFilePath, chat, 'utf8', (err) => {
            if (err) {
              console.error(`Error writing file: ${err}`);
              return reject(err); 
            }
            log.info('Chat response has been written to sample.json');
            resolve(); 
          });
        } catch (error) {
          console.error(`Error processing chat response: ${error}`);
          reject(error); 
        }
      });
    });
  }

//Delete the info.json file.


// returns the text body of an email
function getBody(payload) {
  let body = '';
  let image = '';

  if (payload.parts) 
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Base64.decode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      else if(part.mimeType ==='text/html' && part.body.data ){
        const htmlContent = Base64.decode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        const imgTags = htmlContent.match(/<img[^>]+>/g);
        if (imgTags) {
          image += imgTags.join('');
        }

      }
      else if (part.parts) {
        body += getBody(part);
      }
    }

  const ct= cropText(body)
  body_length=ct.length;
  image_length=image.length

  return `${ct}\n\n\n${image}`;
}

//function to remove files
function remove_file(file_name){
  if (fs.existsSync(file_name)) {
    fs.unlinkSync(file_name);
    log.info(file_name,' deleted successfully.');
  } else {
    log.info('File does not exist');
  }


} 
//displays the order number of a receipt
async function find_order_num(subject) {
  const str = `Can you display the order number from this email subject? Answer only with theorder number with no punctuation. If there is no order number display the number -1.\n`+subject
  const ans = await promptOpenAI(str);
  return ans;
}

// function for email access and credentials
async function email_credentials(code){
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  log.info('Access tokens: ', tokens)



  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  log.info('User Profile: ', profile.data);


  const messages = await gmail.users.messages.list({
    userId: 'me',
    q: 'subject:order OR subject:confirmation OR subject:receipt OR subject:purchase',
    maxResults: 150
  });
  const m = messages.data.messages;
  return m;
}

async function get_message_info(message){
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageId = message.id;
    const fullMessage = await gmail.users.messages.get({ userId: 'me', id: messageId });
    const headers = fullMessage.data.payload.headers;
    const subjectHeader = headers.find(header => header.name === 'Subject');
    const fromHeader = headers.find(header => header.name === 'From');
    let sender = fromHeader ? fromHeader.value : 'Unknown sender';
    const emailMatch = sender.match(/<([^>]+)>/);
    return {messageId, fullMessage, headers, subjectHeader, fromHeader, sender, emailMatch};
  
}

//function to use sha 256 to not allow duplicate emails to be read
async function unduplicate(subject, sender){
  const order_num = await find_order_num(subject);
  var hash = "-1"

  if (order_num != -1){

    const dataToHash = sender[1] + order_num;

    hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    
  }
  return {hash,order_num};

}