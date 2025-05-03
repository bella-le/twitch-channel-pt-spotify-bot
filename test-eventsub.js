/**
 * Test script to simulate a Twitch EventSub notification for a channel point redemption
 * Run this with: node test-eventsub.js
 */
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const WEBHOOK_URL = 'http://localhost:8888/webhook/twitch';
const TEST_ENDPOINT = 'http://localhost:8888/webhook/twitch/test-event';
const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '14319243f95e1c594a66df36817d5572'; // Use the secret from your .env file or the one returned from recreate-subscriptions

// Create a sample channel point redemption event
const createSampleEvent = (songUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT') => {
  return {
    subscription: {
      id: 'f1c2a387-161a-49f9-a165-0f21d7a4e1c4',
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      status: 'enabled',
      condition: {
        broadcaster_user_id: '12345678'
      },
      transport: {
        method: 'webhook',
        callback: WEBHOOK_URL
      }
    },
    event: {
      id: 'b1341343-b84d-4d42-b8b9-33f4080e4ecc',
      broadcaster_user_id: '12345678',
      broadcaster_user_login: process.env.TWITCH_CHANNEL || 'exampleChannel',
      broadcaster_user_name: process.env.TWITCH_CHANNEL || 'ExampleChannel',
      user_id: '87654321',
      user_login: 'testuser',
      user_name: 'TestUser',
      user_input: songUrl,
      status: 'unfulfilled',
      reward: {
        id: '9001',
        title: process.env.TWITCH_REDEMPTION_NAME || 'Song Request',
        prompt: 'Request a song to be played on stream',
        cost: 1000
      },
      redeemed_at: new Date().toISOString()
    }
  };
};

// Function to sign the message with HMAC
const signMessage = (message, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return `sha256=${hmac.digest('hex')}`;
};

// Send a test webhook notification
const sendTestNotification = async () => {
  try {
    // Create a sample event
    const event = createSampleEvent();
    const messageId = crypto.randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();
    
    // Convert the event to a JSON string
    const messageBody = JSON.stringify(event);
    
    // Create the message to sign (messageId + timestamp + messageBody)
    const message = messageId + timestamp + messageBody;
    
    // Sign the message
    const signature = signMessage(message, WEBHOOK_SECRET);
    
    console.log('Sending test notification to:', WEBHOOK_URL);
    console.log('Using webhook secret:', WEBHOOK_SECRET);
    console.log('Generated signature:', signature);
    
    // Send the notification to the webhook endpoint
    const response = await axios.post(WEBHOOK_URL, messageBody, {
      headers: {
        'Content-Type': 'application/json',
        'Twitch-Eventsub-Message-Id': messageId,
        'Twitch-Eventsub-Message-Timestamp': timestamp,
        'Twitch-Eventsub-Message-Signature': signature,
        'Twitch-Eventsub-Message-Type': 'notification',
        'Twitch-Eventsub-Subscription-Type': 'channel.channel_points_custom_reward_redemption.add'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('Test notification sent successfully!');
  } catch (error) {
    console.error('Error sending test notification:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
};

// Send a test event to the test endpoint (no signature verification)
const sendTestEvent = async () => {
  try {
    // Create a sample event
    const event = createSampleEvent();
    
    console.log('Sending test event to:', TEST_ENDPOINT);
    
    // Send the event to the test endpoint
    const response = await axios.post(TEST_ENDPOINT, event);
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('Test event sent successfully!');
  } catch (error) {
    console.error('Error sending test event:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
};

// Ask the user which test to run
console.log('Which test would you like to run?');
console.log('1. Send a test notification to the webhook endpoint (with signature verification)');
console.log('2. Send a test event to the test endpoint (no signature verification)');

process.stdin.once('data', (data) => {
  const choice = data.toString().trim();
  
  if (choice === '1') {
    sendTestNotification();
  } else if (choice === '2') {
    sendTestEvent();
  } else {
    console.log('Invalid choice. Please run the script again and enter 1 or 2.');
    process.exit(1);
  }
});
