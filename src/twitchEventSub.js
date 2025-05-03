const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const twitchAuth = require('./twitchAuth');
const queueStore = require('./queueStore');
const sheetsManager = require('./sheetsManager');

// Configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;
const REDEMPTION_NAME = process.env.TWITCH_REDEMPTION_NAME || 'Song Request';

let spotifyClient = null;
let userId = null;
let webhookSecret = null;
let subscriptionId = null;

/**
 * Initialize the Twitch EventSub integration
 * @param {Object} spotify - The initialized Spotify client
 * @param {Object} app - The Express app instance
 */
async function initialize(spotify, app) {
  if (!TWITCH_CLIENT_ID || !TWITCH_CHANNEL) {
    throw new Error('Twitch client ID or channel name not set in environment variables');
  }

  spotifyClient = spotify;
  
  // Always set up the webhook endpoint regardless of authentication status
  webhookSecret = crypto.randomBytes(16).toString('hex');
  setupWebhookEndpoint(app);
  
  try {
    const authInitialized = await twitchAuth.initialize();
    
    if (!authInitialized) {
      twitchAuth.setupAuthRoutes(app);
      return false;
    }
    
    userId = await getUserId(TWITCH_CHANNEL);
    twitchAuth.setupAuthRoutes(app);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Twitch EventSub:', error);
    throw error;
  }
}

/**
 * Set up the webhook endpoint for EventSub notifications
 * @param {Object} app - The Express app instance
 */
function setupWebhookEndpoint(app) {
  // Add a test endpoint to verify webhook is accessible
  app.get('/webhook/twitch/test', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Webhook endpoint is accessible', timestamp: new Date().toISOString() });
  });

  // Add an endpoint to check subscription status
  app.get('/webhook/twitch/status', async (req, res) => {
    try {
      const subscriptions = await checkSubscriptionStatus();
      res.status(200).json({ status: 'ok', subscriptions });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Add a test endpoint to simulate webhook events (for testing only)
  app.post('/webhook/twitch/test-event', express.json(), (req, res) => {
    try {
      handleEventNotification(req.body);
      res.status(200).json({ status: 'ok', message: 'Test event processed' });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  // Handle GET requests for webhook verification
  app.get('/webhook/twitch', (req, res) => {
    if (req.query && req.query['hub.challenge']) {
      const challenge = req.query['hub.challenge'];
      res.status(200).send(challenge);
    } else if (req.headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
      try {
        const body = req.body;
        
        if (body && body.challenge) {
          res.status(200).send(body.challenge);
        } else {
          console.error('No challenge found in EventSub verification request');
          res.status(400).send('No challenge found');
        }
      } catch (error) {
        console.error('Error handling EventSub verification:', error);
        res.status(500).send('Error processing verification');
      }
    } else {
      res.status(200).send('Webhook endpoint is ready');
    }
  });

  // Use raw body parser for all webhook requests to properly verify signatures
  app.post('/webhook/twitch', express.raw({ type: 'application/json' }), async (req, res) => {
    // For all requests, req.body is a Buffer
    const body = req.body.toString();
    // Parse the JSON body
    let notification;
    try {
      notification = JSON.parse(body);
    } catch (error) {
      console.error('Error parsing request body:', error);
      return res.status(400).send('Invalid request body');
    }
    
    // Get the message type
    const messageType = req.headers['twitch-eventsub-message-type'];
    // Handle verification challenge
    if (messageType === 'webhook_callback_verification') {
      if (notification.challenge) {
        // Return the challenge exactly as specified by Twitch
        return res.set('Content-Type', 'text/plain').status(200).send(notification.challenge);
      } else {
        console.error('No challenge found in verification request');
        return res.status(400).send('No challenge found');
      }
    }
    
    // For other message types, verify the signature
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const messageSignature = req.headers['twitch-eventsub-message-signature'];
    
    if (!messageId || !timestamp || !messageSignature) {
      console.error('Missing required headers for signature verification');
      return res.status(403).send('Missing required headers');
    }
    
    // Create the signature
    const hmacMessage = messageId + timestamp + body;
    const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret)
      .update(hmacMessage)
      .digest('hex');
    
    // Verify the signature
    if (signature !== messageSignature) {
      return res.status(403).send('Signature verification failed');
    }
    
    // Handle the notification based on message type
    if (messageType === 'notification') {
      try {
        await handleEventNotification(notification);
      } catch (error) {
        console.error('Error handling notification:', error);
        // Still return 200 to acknowledge receipt
      }
    } else if (messageType === 'revocation') {
      console.log('Subscription revoked:', notification.subscription.type);
      console.log('Reason:', notification.subscription.status);
      console.log('Condition:', JSON.stringify(notification.subscription.condition, null, 2));
    } else {
      console.log('Unhandled message type:', messageType);
    }
    
    // Return a 204 No Content to acknowledge receipt
    return res.status(204).end();
  });
}


/**
 * Handle a song request from a Twitch user
 * @param {string} username - The username of the requester
 * @param {string} message - The message containing the song request
 */
async function handleSongRequest(username, message) {
  try {
    // Check if Spotify client is initialized
    if (!spotifyClient || !spotifyClient.isInitialized()) {
      throw new Error('Spotify client is not initialized');
    }
    
    // Process the song request
    const result = await spotifyClient.addSongToQueue(message);
    
    if (result.success) {
      // Create song data object
      const songData = {
        username,
        trackName: result.trackName,
        artistName: result.artistName,
        trackId: result.trackId,
        requestedAt: new Date()
      };
      
      // Add to in-app queue tracking system
      const position = queueStore.addSongToQueue(songData);
      
      // Add to Google Sheets leaderboards if initialized
      if (sheetsManager.isInitialized()) {
        try {
          // Update user leaderboard in Google Sheets
          await sheetsManager.updateUserLeaderboard(username, songData.requestedAt.toLocaleString());
          
          // Update song leaderboard in Google Sheets when queued
          await sheetsManager.updateSongLeaderboard(songData);
          
          console.log('Updated Google Sheets leaderboards');
        } catch (sheetsError) {
          console.error('Error updating Google Sheets:', sheetsError);
          // Continue even if Google Sheets update fails
        }
      }
      
      console.log(`Added song "${result.trackName}" by ${result.artistName} to queue at position ${position}`);
    } else {
      console.error(`Failed to add song: ${result.error}`);
    }
  } catch (error) {
    console.error('Error handling song request:', error);
  }
}



/**
 * Get a user ID from a username
 * @param {string} username - The Twitch username
 * @returns {string} The user ID
 */
async function getUserId(username) {
  try {
    const accessToken = twitchAuth.getAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch access token available');
    }
    
    const response = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.data.data.length === 0) {
      throw new Error(`User ${username} not found`);
    }
    
    return response.data.data[0].id;
  } catch (error) {
    console.error('Error getting user ID:', error);
    throw error;
  }
}

/**
 * Subscribe to channel point redemption events
 * @param {string} callbackUrl - The webhook callback URL
 * @returns {string} The subscription ID
 */
async function subscribeToChannelPointRedemptions(callbackUrl) {
  try {
    // Use app access token for EventSub subscriptions as required by Twitch API
    const accessToken = await twitchAuth.getAppAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch app access token available');
    }
    
    // Ensure we have a webhook secret
    if (!webhookSecret) {
      webhookSecret = crypto.randomBytes(16).toString('hex');
      console.log('Generated new webhook secret for channel point redemption subscription');
    }
    
    // Check if userId is initialized
    if (!userId) {
      userId = await getUserId(TWITCH_CHANNEL);
      console.log(`Resolved Twitch channel ${TWITCH_CHANNEL} to user ID: ${userId}`);
    }
    
    console.log(`Attempting to subscribe to channel point redemptions for user ID: ${userId}`);
    console.log(`Using callback URL: ${callbackUrl}`);
    
    const response = await axios.post(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: {
          broadcaster_user_id: userId
        },
        transport: {
          method: 'webhook',
          callback: callbackUrl,
          secret: webhookSecret
        }
      },
      {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    subscriptionId = response.data.data[0].id;
    console.log(`Subscribed to channel point redemptions with ID: ${subscriptionId}`);
    return subscriptionId;
  } catch (error) {
    console.error('Error subscribing to channel point redemptions:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 403) {
        console.error('403 Forbidden: This usually means your Twitch token does not have the necessary permissions.');
        console.error('Make sure you have authenticated with the channel:read:redemptions scope.');
      }
    }
    throw error;
  }
}

/**
 * Set up the EventSub subscription for a deployed application
 * @param {string} baseUrl - The base URL of the deployed application
 */
async function setupEventSubForDeployment(baseUrl) {
  if (!baseUrl) {
    throw new Error('Base URL is required for EventSub setup');
  }
  
  // Fix double slash in URL if present
  let cleanBaseUrl = baseUrl;
  // Remove trailing slash if present
  if (cleanBaseUrl.endsWith('/')) {
    cleanBaseUrl = cleanBaseUrl.slice(0, -1);
  }
  const callbackUrl = `${cleanBaseUrl}/webhook/twitch`;
  
  try {
    // Subscribe to channel point redemption events
    await subscribeToChannelPointRedemptions(callbackUrl);
    console.log(`EventSub webhook set up with callback URL: ${callbackUrl}`);
    return true;
  } catch (error) {
    console.error('Error setting up EventSub for deployment:', error);
    throw error;
  }
}

/**
 * Handle event notifications from Twitch
 * @param {Object} notification - The event notification
 */
async function handleEventNotification(notification) {
  const eventType = notification.subscription.type;
  
  if (eventType === 'channel.channel_points_custom_reward_redemption.add') {
    const redemption = notification.event;
    const rewardTitle = redemption.reward.title;
    
    // Check if this is the song request redemption
    if (rewardTitle === REDEMPTION_NAME) {
      const username = redemption.user_name;
      const input = redemption.user_input;
      
      console.log(`Song request from ${username}: ${input}`);
      await handleSongRequest(username, input);
    }
  }
}

/**
 * Check the status of EventSub subscriptions with Twitch
 * @returns {Promise<Array>} List of active subscriptions
 */
async function checkSubscriptionStatus() {
  try {
    const accessToken = await twitchAuth.getAppAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch app access token available');
    }
    
    const response = await axios.get(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error('Error checking subscription status:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error);
    }
    throw error;
  }
}

module.exports = {
  initialize,
  setupEventSubForDeployment,
  subscribeToChannelPointRedemptions,
  checkSubscriptionStatus,
  handleEventNotification
};