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
const cheerio = require('cheerio');

const { OAuth2 } = google.auth;
const app = express();
const port = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
var current_user="r@t";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var body_length=0
var image_length=0
var strings =""

var current_user="";
var f_name = "main.json";
var temp_f_name="";
var count =0;


const apiKey = process.env.OPENAI_API_KEY;
const endpointUrl = 'https://api.openai.com/v1/chat/completions';

remove_file('output.json')


fs.writeFileSync("output.json", '', 'utf8');
//log.info('File created successfully');

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
     // log.info('info.json created successfully.');
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
       // log.info("Email ID: ", messageId);
        body_length = 0;
        image_length=0;
        if (subjectHeader) {
            const isReceipt = await confirmReceipt(subjectHeader.value);
            console.log(subjectHeader.value)
           // log.info(subjectHeader.value);
           // log.info("Is this a receipt? ", isReceipt);
            //if it is a receipt continue
            console.log(isReceipt)
            if (isReceipt) {
              //const info = await getEmailTextContent(fullMessage.data.payload)
              //console.log(info)

              //console.log(subjectHeader.value)
              //limits duplicate entries
              var {hash, order_num} = await unduplicate(subjectHeader.value, sender)
              if(!(sha.includes(hash) )){
                if(order_num!=-1){
                  sha.push(hash)
                }
                const testy = extractAndProcessHTML(fullMessage.data.payload.parts)
              const body = getBody(fullMessage.data.payload);
              //log.info('Subject:', subjectHeader.value);
              //log.info('Body Character Count:', body_length);
              
              if(body_length >=0 && image_length>=-1){
                console.log("yes")
                await extractReceiptData(testy);
              }
              else{
                console.log("negatively")
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


  app.post('/add_closet', (req, res) => {
    const { closetName } = req.body;
    const currentUser = current_user; // Assuming current_user is defined somewhere in your application
  
    // Directory where user's closets are stored
    const userDir = path.join(__dirname, 'user_info', currentUser);
  
    // File path for the closet JSON file
    const filePath = path.join(userDir, `${closetName}.json`);
  
    // Example: Save closetName to a JSON file
    //console.log('Adding new closet:', closetName);
    //console.log('Current User:', currentUser);
  
  
    fs.writeFileSync(filePath, '[]');
    //console.log(`Created new closet file: ${filePath}`);
  
    // Redirect to the index page after processing
    res.redirect('/'); // Assuming 'index' is the route or file you want to redirect to
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
      let name = email;
      //log.info(name)
      //good
      let folderPath = "user_info/"+name;
      if (!fs.existsSync(folderPath)) {
        try {
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
          }
          let filePath = path.join(folderPath, 'main.json');
          fs.writeFileSync(filePath, '[]');
          filePath = path.join(folderPath, 'for sale.json');
          fs.writeFileSync(filePath, '[]');
          //log.info(name, ' created successfully.');
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
              f_name="main.json"
              var fPath = 'user_info/'+current_user;
              count = getMaxItemCount(fPath,f_name)
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
  //good
  let name = f_name;
  let userDir = path.join(__dirname, 'user_info', current_user);
  let filePath = path.join(userDir, name);

  //log.info(filePath);

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
  //console.log(f_name)
  //console.log(temp_f_name)
    if(f_name=="main.json" && temp_f_name!=""){
      res.render('add_closet', { test: req.test });
    }
    else if(f_name=="temp.json"){
      res.render('add_closet', { test: req.test });
    }
    else if(f_name=="main.json"|| f_name=="pending.json"){
      res.render('index', { test: req.test });
    }
    else if(f_name=="for sale.json"){
      res.render('for_sale', { test: req.test });
    }
    else{
      res.render('closets', { test: req.test });
    }
});

//renders teh sample page
app.get('/sample', (req, res) => {
    f_name="pending.json"
    res.render('sample');
});


// renders the add items page
app.get('/add_items', (req, res) => {
    f_name="pending.json"
    res.render('add_items');
  });

app.post('/add_to_closet', (req,res)=>{
  create_temp();
  temp_f_name=f_name
  f_name="temp.json"
  res.redirect('/');
});

app.get ('/load', (req,res)=>{
  res.redirect('/')
})



//adds the items from sample.json to your home page and renders home page
app.get('/add_items_home', (req, res, next) => {
    f_name="pending.json"


    //maybe
    //log.info("line");
    //log.info(current_user)

    let actualPath = "/"+current_user+"/main.json"
    let pendingPath = "/"+current_user+"/pending.json"
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
      f_name="main.json"
      //log.info("here")
      //log.info(current_user)
      //good
        var currentJSON = "user_info/"+current_user+"/pending.json";

        try {
            fs.unlinkSync(currentJSON);
            log.info('info.json deleted successfully.');
        } catch (error) {
        console.error('Error deleting info.json:', error);
        }


        //log.info(current_user)

        res.redirect('/');
    });

    app.post('/process_selected_items', (req, res) => {
      const { selectedItems } = req.body;
      f_name = temp_f_name;
      temp_f_name = "";
  
      //console.log('Selected indices:', selectedItems);
  
      // Assuming f_name and current_user are defined elsewhere in your application
      const mainFilePath = path.join(__dirname, 'user_info', current_user, "temp.json");
      let mainData;
      

      try {
          const data = fs.readFileSync(mainFilePath, 'utf8');
          mainData = JSON.parse(data);
         //console.log("mainer");
         // console.log(mainData);
      } catch (err) {
          console.error('Error reading or parsing main.json:', err);
          return res.status(500).json({ success: false, message: 'Failed to read or parse main.json' });
      }
      //console.log("mainer")
      //console.log(mainData)
  
          // Filter selected items based on indices
          const itemsToAdd = selectedItems.map(index => mainData[index]);


  
          // Append selected items to f_name
          const f_nameFilePath = path.join(__dirname, 'user_info', current_user, f_name);
          fs.readFile(f_nameFilePath, 'utf8', (err, f_data) => {
              if (err) {
                  console.error('Error reading f_name:', err);
                  return res.status(500).json({ success: false, message: 'Failed to read f_name' });
              }
  
              let f_nameData;
              try {
                  f_nameData = JSON.parse(f_data);
              } catch (parseError) {
                  console.error('Error parsing f_name:', parseError);
                  return res.status(500).json({ success: false, message: 'Failed to parse f_name' });
              }
  
              // Add selected items to f_nameData array
              itemsToAdd.forEach(item => {
                  f_nameData.push(item);
              });
              //console.log("items")
              //console.log(f_nameData)
  
              // Write updated data back to f_name
              fs.writeFile(f_nameFilePath, JSON.stringify(f_nameData, null, 2), 'utf8', (err) => {
                  if (err) {
                      console.error('Error writing to f_name:', err);
                      return res.status(500).json({ success: false, message: 'Failed to write to f_name' });
                  }
                  //console.log('Selected items added to f_name');
                  res.redirect('/');
              });
          });
      
  });
  
  

  //populates sample.json and redirects to /pending and displays the populated info
  app.get('/populate', async (req, res, next) => {
    f_name="pending.json"
        //maybe
        let name="/"+current_user+"/pending.json";
        const fPath = path.join(__dirname, 'sample.json');
        //log.info("P")
        fs.readFile('sample.json', (err, data) => {
          if (err) {
              console.error('Error reading sample.json:', err);
              return res.status(500).send({ message: 'Internal Server Error 3' });
          }
      
          try {
              const jsonData = JSON.parse(data);
      
              // Iterate through each array in jsonData and add an element
              jsonData.forEach(array => {
                  const newItem = count + 1; // Generate new item based on count
                  array.push(newItem);
                  count++; // Add newItem to the end of the array
              });
      
              // Increment count after adding elements to arrays
              
      
              const targetFilePath = path.join(__dirname, 'user_info', name);
              fs.writeFile(targetFilePath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
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

app.get('/for_sale', (req, res, next) => {

  res.render('for_sale'); 

});
  
  // renders page with items waiting for you to add them to your home page
  app.get('/pending', (req, res, next) => {

    //good
    f_name = "pending.json"
    //console.log("pending")
    //console.log(f_name)
    let name = "pending.json";
    let userDir = path.join(__dirname, 'user_info', current_user);
    let filePath = path.join(userDir, name);
  
    //log.info(filePath);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next(err);
        }
        const fileData = JSON.parse(data); 
        res.render('sample', { test: fileData });
    });
});
  
  // redirects to the page where you add your items
  app.get('/redirect-to-add-items', (req, res) => {

    res.redirect('/add_items');
  });

  app.get('/closets', (req, res) => {
    const { file } = req.query; // Extract file name from query parameters
    temp_f_name=""
    if (!file) {
      return res.status(400).send('File name is required'); // Handle case where file is missing
    }
  
    //console.log('File name received:', file); // Log file name received
  
    // Example: Check if file exists or handle redirection accordingly
    // This is just an example, adjust based on your actual logic
  
      f_name=file+".json";
      res.redirect("/")
    
  });
  
  
  //logs out of the application
  app.post('/logout', (req, res) => {
    //log.info("logout")

        current_user="";
        f_name="main.json"
  
        res.redirect('/home');
  
  });

  app.get('/delete_closet', (req,res) =>{

    const userDir = path.join(__dirname, 'user_info', current_user);


    const filePath = path.join(userDir, f_name);


    fs.unlink(filePath, (err) => {
    if (err) {
        console.error('Error deleting file:', err);
        return;
    }
    //console.log(`Deleted file: ${filePath}`);
    });
    f_name="main.json"
    res.redirect('/');

  });

  //logs out from the items page, redirects to home
  app.post('/logout_ofItems', (req, res) => {
    f_name="main.json"
    //log.info("logout")
    var currentJSON = "user_info/"+current_user+"/pending.json";

    try {
        fs.unlinkSync(currentJSON);
       // log.info('info.json deleted successfully.');
    } catch (error) {
    console.error('Error deleting info.json:', error);
    }
    current_user="";

    res.redirect('/home');

});
  
  
  // Define a route to delete an item
  app.delete('/deleteItem/:index', (req, res) => {
      const index = req.params.index;
      let name="/"+current_user+"/"+f_name;
     // console.log("name")
      //console.log(name)

      const filePath = path.join(__dirname, 'user_info', name);
      if (index < 0 || index >= req.test.length) {
          return res.status(400).json({ success: false, message: 'Invalid index' });
      }
      if(f_name=="main.json"){
        var ind = (req.test[index][4])
        req.test.splice(index, 1);
        fs.writeFile(filePath, JSON.stringify(req.test, null, 2), 'utf8', (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to write file' });
            }
            res.json({ success: true, test: req.test });
        });
        const directoryPath = 'user_info/'+current_user;

        fs.readdir(directoryPath, (err, files) => {
          if (err) {
            console.error('Error reading directory:', err);
            return;
          }
        
          // Process each file
          files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                console.error(`Error reading file ${file}:`, err);
                return;
              }
        
              // Parse the file content as JSON
              let content;
              try {
                content = JSON.parse(data);
              } catch (error) {
                console.error(`Error parsing JSON in file ${file}:`, error);
                return;
              }
        
              // Check each array in the file content
              content.forEach((innerArray, index) => {
                //console.log("teree")
                //console.log(innerArray)
                //console.log(ind)
                if (Array.isArray(innerArray) && innerArray[4] === ind) {
                  // Remove the matching inner array
                  content.splice(index, 1);
                }
              });
        
              // Write the modified content back to the file
              fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8', (err) => {
                if (err) {
                  console.error(`Error writing file ${file}:`, err);
                  return;
                }
                //console.log(`Successfully modified file ${file}`);
              });
            });
          });
        });
    }
      else{
        req.test.splice(index, 1);
        fs.writeFile(filePath, JSON.stringify(req.test, null, 2), 'utf8', (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to write file' });
            }
            res.json({ success: true, test: req.test });
        });
      }

      
  });


  app.get('/get_user_files', (req, res) => {
    let folderPath = path.join(__dirname, 'user_info', current_user);
  
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        return res.status(500).send('Unable to scan directory: ' + err);
      }
      const filteredFiles = files.filter(file => file !== 'temp.json');
    
    // Modify file names as needed (e.g., removing extension `.json`)
    const modifiedFiles = filteredFiles.map(file => file.slice(0, -5));
      res.json(modifiedFiles);
    });
  });


app.listen(port, () => {
  //log.info(`Server running at http://localhost:${port}`);
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
  //log.info("confirmReceipt")
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
  //log.info("extractReceiptData")
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

  //log.info(information);

  addToJSON(information);

 }



// Function to prompt OpenAI and get result
async function promptOpenAI(prompt) {
  //log.info("promptOpenAI")
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
      //log.info('API response:'+ data.choices[0].message.content.trim());
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
         // log.info('info.json created successfully.');
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
      //log.info("Data appended to info.json successfully.\n\n\n\n");
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
          //log.info(chat);
          const outputFilePath = path.join(__dirname, 'sample.json');
          fs.writeFile(outputFilePath, chat, 'utf8', (err) => {
            if (err) {
              console.error(`Error writing file: ${err}`);
              return reject(err); 
            }
            //log.info('Chat response has been written to sample.json');
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
   // log.info(file_name,' deleted successfully.');
  } else {
    //log.info('File does not exist');
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
 // log.info('Access tokens: ', tokens)



  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

 // log.info('User Profile: ', profile.data);


  const messages = await gmail.users.messages.list({
    userId: 'me',
    q: 'subject:order OR subject:confirmation OR subject:receipt OR subject:purchase',
    maxResults: 5
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

function getMaxItemCount(userDir, fileName) {
  const filePath = path.join(userDir, fileName);
  try {
      const data = fs.readFileSync(filePath, 'utf8');
      const mainJson = JSON.parse(data);
      let maxCount = 0;

      // Iterate through each array in main.json
      mainJson.forEach(array => {
          if (Array.isArray(array) && array.length >= 5 && !isNaN(array[4])) {
              maxCount = Math.max(maxCount, array[4]);
          }
      });

      return maxCount;
  } catch (err) {
      console.error('Error reading or parsing main.json:', err);
      return 0; // Default value if there's an error
  }
}

function create_temp(){
  const mainFilePath = 'user_info/'+current_user+'/main.json';
  const f_nameFilePath = 'user_info/'+current_user+'/'+f_name;
  const tempFilePath = 'user_info/'+current_user+'/temp.json';
 // console.log("tempy")
  //console.log(mainFilePath)
  //console.log(f_nameFilePath)
  //console.log(tempFilePath)
  fs.readFile(mainFilePath, 'utf8', (err, mainData) => {
    if (err) {
      console.error('Error reading main.json:', err);
      return;
    }
  
    // Read f_name.json
    fs.readFile(f_nameFilePath, 'utf8', (err, f_nameData) => {
      if (err) {
        console.error('Error reading f_name.json:', err);
        return;
      }
  
      try {
        const mainContent = JSON.parse(mainData);
        const f_nameContent = JSON.parse(f_nameData);
  
        // Filter main.json content
        const tempContent = mainContent.filter(item => {
          // Assuming each item in main.json has a unique identifier, check if it exists in f_name.json
          // Modify this condition based on your actual data structure
          return !f_nameContent.some(f_item => f_item[4] === item[4]);
        });
  
        // Write tempContent to temp.json
        fs.writeFile(tempFilePath, JSON.stringify(tempContent, null, 2), 'utf8', (err) => {
          if (err) {
            console.error('Error writing temp.json:', err);
            return;
          }
          //console.log('Successfully created temp.json');
        });
  
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    });
  });
}


function testgetBody(payload) {
  let body = '';
  
  if (payload.parts) {
      for (let part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.parts) {
              body += getBody(part);
          }
      }
  } else if (payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  
   console.log(body);
}

async function getMessageInfo(message) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const messageId = message.id;
  const fullMessage = await gmail.users.messages.get({ userId: 'me', id: messageId });
  const headers = fullMessage.data.payload.headers;
  const subjectHeader = headers.find(header => header.name === 'Subject');
  const fromHeader = headers.find(header => header.name === 'From');
  let sender = fromHeader ? fromHeader.value : 'Unknown sender';
  const emailMatch = sender.match(/<([^>]+)>/);

  // Function to decode base64url encoded data
  const decodeBase64Url = (data) => {
      return Buffer.from(data, 'base64').toString('utf-8');
  };

  // Extract and decode the HTML or plain text body
  let emailTextContent = '';
  const parts = fullMessage.data.payload.parts || [];

  for (let part of parts) {
      if (part.mimeType === 'text/html') {
          emailTextContent = decodeBase64Url(part.body.data);
          break;
      } else if (part.mimeType === 'text/plain') {
          emailTextContent = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'multipart/alternative') {
          for (let subPart of part.parts) {
              if (subPart.mimeType === 'text/html') {
                  emailTextContent = decodeBase64Url(subPart.body.data);
                  break;
              } else if (subPart.mimeType === 'text/plain') {
                  emailTextContent = decodeBase64Url(subPart.body.data);
              }
          }
      }
  }

  if (parts.length === 0 && fullMessage.data.payload.body.data) {
      // If there are no parts, check the main body
      emailTextContent = decodeBase64Url(fullMessage.data.payload.body.data);
  }

  if (fullMessage.data.payload.mimeType === 'text/html') {
      const $ = cheerio.load(emailTextContent);
      emailTextContent = $('body').text();
  }

  return {emailTextContent };
}
async function getEmailTextContent(payload) {
  try {
    const decodeBase64Url = (data) => {
      return Buffer.from(data, 'base64').toString('utf-8');
    };

    const getTextContent = (parts) => {
      for (const part of parts) {
        //console.log('Processing part:', part);
        if (part.mimeType === 'text/plain') {
          return decodeBase64Url(part.body.data || '');
        }
        if (part.parts && part.parts.length) {
          const text = getTextContent(part.parts);
          if (text) return text;
        }
      }
      return '';
    };

    let emailTextContent = '';

    //const html_content = processParts(payload.parts);
    extractAndProcessHTML(payload.parts)

    if (payload && payload.mimeType === 'text/plain') {
      emailTextContent = decodeBase64Url(payload.body.data || '');
    } else if (payload && (payload.mimeType === 'multipart/alternative' || payload.mimeType === 'multipart/mixed')) {
      emailTextContent = getTextContent(payload.parts);
    }

    //console.log('Email Text Content:', emailTextContent);
    //processPayload(payload)
    return emailTextContent;
  } catch (error) {
    console.error('Error in getEmailTextContent:', error);
    throw error;
  }
}


function decodeBase64Url(data) {
  const buff = Buffer.from(data, 'base64');
  return buff.toString('utf-8');
}
function processMixedParts(parts) {
  parts.forEach((part, index) => {
      console.log(`Processing mixed part ${index}:`, part);

      switch (part.mimeType) {
          case 'multipart/alternative':
              // If the part is multipart/alternative, process its parts recursively
              processAlternativeParts(part.parts);
              break;
          case 'text/plain':
              // Process plain text content
              console.log('Plain Text Content:', part.body.data.toString('utf-8'));
              break;
          case 'text/html':
              // Process HTML content
              console.log('HTML Content:', part.body.data.toString('utf-8'));
              break;
          case 'image/jpeg':
          case 'image/png':
              // Process image attachments
              console.log(`Image Attachment (${part.mimeType}):`, part.body.data);
              // Save or process the image data as needed
              break;
          case 'application/pdf':
              // Process PDF attachments
              console.log(`PDF Attachment (${part.filename}):`, part.body.data);
              // Save or process the PDF data as needed
              break;
          default:
              console.log(`Unhandled MIME type (${part.mimeType})`);
              break;
      }
  });
}

function processAlternativeParts(parts) {
  parts.forEach((part) => {
      switch (part.mimeType) {
          case 'text/plain':
              // Process plain text content
              console.log('Plain Text Content:', part.body.data.toString('utf-8'));
              break;
          case 'text/html':
              // Process HTML content
              console.log('HTML Content:', part.body.data.toString('utf-8'));
              break;
          default:
              console.log(`Unhandled MIME type (${part.mimeType})`);
              break;
      }
  });
}

function processPayload(payload) {
  switch (payload.mimeType) {
      case 'multipart/mixed':
          // Process each part in the multipart/mixed
          processMixedParts(payload.parts);
          break;
      case 'multipart/alternative':
          // Process each part in the multipart/alternative
          processAlternativeParts(payload.parts);
          break;
      default:
          console.log(`Unhandled MIME type (${payload.mimeType})`);
          break;
  }

}

function processParts(parts) {
  let htmlContent = ''; // Variable to store decoded HTML content

  parts.forEach(part => {
    if (part.mimeType === 'text/html') {
      const rawBody = part.body.data;
      const decodedBody = Buffer.from(rawBody, 'base64').toString('utf-8');
      htmlContent += decodedBody; // Concatenate HTML content
    } else if (part.mimeType === 'multipart/mixed') {
      // Recursively process parts of nested multipart/mixed content
      htmlContent += processParts(part.parts); // Concatenate HTML content recursively
    } else {
      // Handle other types of content as needed
      console.log('Skipping part with mimeType:', part.mimeType);
    }
  });

  return htmlContent; // Return concatenated HTML content
}

function extractAndProcessHTML(parts) {
  const htmlContent = processParts(parts);

  const $ = cheerio.load(htmlContent);
  const allText = $('body').text().trim();
  let imgTagsLog = '';
  $('img').each((index, element) => {
    imgTagsLog += $.html(element); // Append the HTML of each <img> element
  });
  


  console.log('Order Details:');
  //console.log(htmlContent)
  console.log(allText);
  console.log(imgTagsLog);

  return allText+"\n\n"+imgTagsLog; // Optionally return the extracted details
}

