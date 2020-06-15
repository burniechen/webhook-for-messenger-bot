import * as reply from "./reply.js";
import express from 'express';
import bodyParser from 'body-parser';
import request from 'request';
import axios from 'axios';
import dotenv from 'dotenv';
'use strict';

// Imports dependencies and set up http server
const app = express().use(bodyParser.json()); // creates express http server

//.env
dotenv.config();
const api = process.env.API_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook 
app.post('/profile', (req, res) => {  
 
    let body = req.body;
  
    // Checks this is an event from a page subscription
    if (body.object === 'page') {
  
        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function(entry) {
            // Gets the body of the webhook event
            let webhook_event = entry.messaging[0];
            console.log(webhook_event);
          
            // Get the sender PSID
            let sender_psid = webhook_event.sender.id;
			console.log('Sender PSID: ' + sender_psid);
          
            // Check if the event is a message or postback and
            // pass the event to the appropriate handler function
            if (webhook_event.message) {
                handleMessage(sender_psid, webhook_event.message);        
            } else if (webhook_event.postback) {
                handlePostback(sender_psid, webhook_event.postback);
            }
            
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
        } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
        }
  
});

// Adds support for GET requests to our webhook
app.get('/profile', (req, res) => {    
    // Parse the query params
    let mode = req.query['mode'];
    let token = req.query['verify_token'];
      
    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
      // Checks the mode and token sent is correct
      if (mode === 'all' && token === VERIFY_TOKEN) {
        
        // Responds with the challenge token from the request
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send('Hello World');
      
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);      
      }
    }
  });

// Handles messages events
function handleMessage(sender_psid, received_message) {

	let response;
	let msg_text;
	let reply_key;
	let send = true;
  
    // Check if the message contains text
	if(received_message.text) {    
		msg_text = received_message.text;
		let words = msg_text.split(']')

		reply_key = getKeyByValue(reply.init_msg, msg_text);

		if (reply_key) response = reply.init_reply[reply_key];
		else if (words[0] === '[Bot') {
			send = false;
		}
		else {
			console.log("received_message.text: callFastReply");
			send = false;
			callFastReply(sender_psid);
		}
	}  
	else if (received_message.attachments) {
		send = false;

        // Gets the URL of the message attachment
		let attachment_url = received_message.attachments[0].payload.url;
		console.log(attachment_url);
		axios.post(api+'rest/image', {
			"image": attachment_url
		})
		.then(function (res) {
			console.log(res.data);
			response = {
				"text": `[Bot]${res.data.data['text']}`,
			}
			
			callSendAPI(sender_psid, response); 
		})
		.catch(function (error) {
			console.log(error);
		});
        // response = {
        //     "attachment": {
        //         "type": "template",
        //         "payload": {
        //             "template_type": "generic",
        //             "elements": [{
        //                 "title": "Is this the right picture?",
        //                 "subtitle": "Tap a button to answer.",
        //                 "image_url": attachment_url,
        //                 "buttons": [
        //                     {
        //                         "type": "postback",
        //                         "title": "Yes!",
        //                         "payload": "yes",
        //                     },
        //                     {
        //                         "type": "postback",
        //                         "title": "No!",
        //                         "payload": "no",
        //                     }
        //                 ],
        //             }]
        //         }
        //     }
        // }
    }
    
    // Sends the response message
    if (send) callSendAPI(sender_psid, response);    
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
	let reply_key;
	let response;
	let send = true;
	  
    // Get the payload for the postback
	let payload = received_postback.payload;
	reply_key = getKeyByValue(reply.init_msg, payload);

    // Set the response based on the postback payload
	if (payload === '<GET_STARTED_PAYLOAD>') {
		console.log("GET_STARTED_PAYLOAD: callFastReply");
		send = false;
		callFastReply(sender_psid);
	}
	else if(payload === 'yes') {
        response = { "text": "Thanks!" }
	} 
	else if (payload === 'no') {
        response = { "text": "Oops, try sending another image." }
	}

	else if (reply_key) response = reply.init_reply[reply_key];

	else {
		console.log("else: callFastReply");
		send = false;
		callFastReply(sender_psid);
	}
	
    // Send the message to acknowledge the postback
    if (send) callSendAPI(sender_psid, response);
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
    console.log("res: " + response);

    // Construct the message body
    let request_body = {
      "recipient": {
        "id": sender_psid
      },
      "message": response
    }
	console.log(JSON.stringify(request_body))
    // Send the HTTP request to the Messenger Platform
    request({
      "uri": "https://graph.facebook.com/v2.6/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN},
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        console.log('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
}

function callFastReply(sender_psid) {
    // Construct the message body
    let request_body = {
		"recipient": {
			"id": sender_psid
		},
		"messaging_type": "RESPONSE",
		"message":{
			"text": "想知道：",
			"quick_replies":[
				{
					"content_type":"text",
					"title":"庫存查詢",
					"payload":"<POSTBACK_PAYLOAD>",
				},
				{
					"content_type":"text",
					"title":"圖表查詢",
					"payload":"<POSTBACK_PAYLOAD>",
				},
				{
					"content_type":"text",
					"title":"其他",
					"payload":"<POSTBACK_PAYLOAD>",
				}
			]
		}
    }
	console.log(JSON.stringify(request_body))
    // Send the HTTP request to the Messenger Platform
    request({
      "uri": "https://graph.facebook.com/v2.6/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN},
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        console.log('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
}

function getKeyByValue(object, value) {
	return Object.keys(object).find(key => object[key] === value);
}