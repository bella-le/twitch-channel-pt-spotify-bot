/**
 * Test script to simulate Twitch's verification challenge
 */
const axios = require('axios');
const crypto = require('crypto');

// Configuration
const webhookUrl = 'https://web-production-6fc25.up.railway.app/webhook/twitch';
const localWebhookUrl = 'http://localhost:8888/webhook/twitch';
const webhookSecret = 'testsecret'; // This doesn't need to match your actual secret for this test

// Generate a test message ID and timestamp
const messageId = crypto.randomUUID();
const timestamp = new Date().toISOString();

// Create a verification challenge payload
const verificationPayload = {
  challenge: 'test-challenge-' + Math.random().toString(36).substring(2, 15),
  subscription: {
    id: crypto.randomUUID(),
    status: 'webhook_callback_verification_pending',
    type: 'channel.follow',
    version: '2',
    condition: {
      broadcaster_user_id: '56111682',
      moderator_user_id: '56111682'
    },
    transport: {
      method: 'webhook',
      callback: webhookUrl
    },
    created_at: timestamp
  }
};

// Convert payload to string
const messagePayload = JSON.stringify(verificationPayload);

// Create signature
const hmacMessage = messageId + timestamp + messagePayload;
const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret)
  .update(hmacMessage)
  .digest('hex');

// Headers
const headers = {
  'Content-Type': 'application/json',
  'Twitch-Eventsub-Message-Id': messageId,
  'Twitch-Eventsub-Message-Timestamp': timestamp,
  'Twitch-Eventsub-Message-Signature': signature,
  'Twitch-Eventsub-Message-Type': 'webhook_callback_verification',
  'Twitch-Eventsub-Subscription-Type': 'channel.follow'
};

// Test against production URL
console.log(`Testing verification challenge against: ${webhookUrl}`);
console.log('Challenge value:', verificationPayload.challenge);
console.log('Headers:', JSON.stringify(headers, null, 2));
console.log('Payload:', messagePayload);

axios.post(webhookUrl, verificationPayload, { headers })
  .then(response => {
    console.log('Response status:', response.status);
    console.log('Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('Response data:', response.data);
    
    // Check if the response matches the challenge
    if (response.data === verificationPayload.challenge) {
      console.log('✅ SUCCESS: Response matches challenge!');
    } else {
      console.log('❌ FAILURE: Response does not match challenge!');
      console.log('Expected:', verificationPayload.challenge);
      console.log('Received:', response.data);
    }
  })
  .catch(error => {
    console.error('Error sending verification challenge:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
  });

// Optionally test against local URL
if (process.argv.includes('--local')) {
  console.log(`\nTesting verification challenge against local: ${localWebhookUrl}`);
  
  axios.post(localWebhookUrl, verificationPayload, { headers })
    .then(response => {
      console.log('Local response status:', response.status);
      console.log('Local response data:', response.data);
      
      if (response.data === verificationPayload.challenge) {
        console.log('✅ SUCCESS: Local response matches challenge!');
      } else {
        console.log('❌ FAILURE: Local response does not match challenge!');
      }
    })
    .catch(error => {
      console.error('Error sending verification challenge to local:');
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else {
        console.error(error.message);
      }
    });
}
