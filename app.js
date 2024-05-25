'use strict';

const path = require('path');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');

const gmail = google.gmail('v1');

async function runSample() {
  let skippedCount = 0;
  const skippedSubjects = [];

  try {
    
    const auth = await authenticate({
      keyfilePath: path.join(__dirname, 'client_secret_303458804679-0ap9sqmj8kfsi7p588b14c313k50g599.apps.googleusercontent.com.json'),
      scopes: 'https://www.googleapis.com/auth/gmail.readonly',
    });
    google.options({ auth });

    const res = await gmail.users.messages.list({ userId: 'me' });
    const messages = res.data.messages;

   
    for (const message of messages) {
      const messageId = message.id;
      const fullMessage = await gmail.users.messages.get({ userId: 'me', id: messageId });
      const headers = fullMessage.data.payload.headers;
      const subject = headers.find(header => header.name === 'Subject').value;
      const from = headers.find(header => header.name === 'From').value;
      const date = headers.find(header => header.name === 'Date').value;

     
      let body = '';
      try {
        body = fullMessage.data.payload.parts.find(part => part.mimeType === 'text/html').body.data;

        
        const decodedBody = Buffer.from(body, 'base64').toString();

        
        console.log('Subject:', subject);
        console.log('From:', from);
        console.log('Date:', date);
        console.log('Body:', decodedBody);
        console.log('---');
      } catch (error) {
        console.error('Error fetching message body:', error);
        console.error('Skipping message:', subject);
        skippedCount++; 
        skippedSubjects.push(subject); 
      }
    }

    console.log(`Skipped ${skippedCount} emails.`);
    console.log('Subjects of skipped emails:', skippedSubjects);
    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}

if (module === require.main) {
  runSample().catch(console.error);
}

module.exports = runSample;
