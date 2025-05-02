const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const twitchAuth = require('./twitchAuth');

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
  
  try {
    const authInitialized = await twitchAuth.initialize();
    
    if (!authInitialized) {
      console.log('Twitch authentication not initialized. Please authenticate with Twitch first.');
      twitchAuth.setupAuthRoutes(app);
      return false;
    }
    
    console.log('Twitch authentication initialized');
    
    userId = await getUserId(TWITCH_CHANNEL);
    console.log(`Resolved Twitch channel ${TWITCH_CHANNEL} to user ID: ${userId}`);
    
    webhookSecret = crypto.randomBytes(16).toString('hex');
    
    setupWebhookEndpoint(app);
    
    twitchAuth.setupAuthRoutes(app);
    
    console.log('Twitch EventSub integration initialized');
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
  app.post('/webhook/twitch', express.raw({ type: 'application/json' }), (req, res) => {
    // Verify the webhook signature
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const messageSignature = req.headers['twitch-eventsub-message-signature'];
    
    const body = req.body.toString();
    
    // Verify the signature
    const hmacMessage = messageId + timestamp + body;
    const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret)
      .update(hmacMessage)
      .digest('hex');
    
    if (messageSignature !== signature) {
      console.error('Invalid signature on webhook');
      return res.status(403).send('Invalid signature');
    }
    
    const notification = JSON.parse(body);
    
    const messageType = req.headers['twitch-eventsub-message-type'];
    
    if (messageType === 'webhook_callback_verification') {
      // Respond to the webhook verification challenge
      console.log('Received webhook verification challenge');
      return res.status(200).send(notification.challenge);
    } else if (messageType === 'notification') {
      // Handle the event notification
      handleEventNotification(notification);
      return res.status(204).end();
    } else if (messageType === 'revocation') {
      // Handle subscription revocation
      console.log('Subscription revoked:', notification.subscription.type);
      console.log('Reason:', notification.subscription.status);
      console.log('Condition:', JSON.stringify(notification.subscription.condition, null, 2));
      return res.status(204).end();
    }
    
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
      console.log(`Added song "${result.trackName}" by ${result.artistName} to queue`);
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
    // Use user access token for channel point redemptions
    const accessToken = twitchAuth.getAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch user access token available');
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
  
  const callbackUrl = `${baseUrl}/webhook/twitch`;
  
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
 * Subscribe to channel follows as a simpler alternative to chat messages
 * @param {string} callbackUrl - The webhook callback URL
 * @param {string} username - The username to listen for (not used for follows, just for logging)
 * @returns {string} The subscription ID
 */
async function subscribeToChannelFollows(callbackUrl, username = '7decibel') {
  try {
    // Use user access token for channel follows (requires moderator:read:followers scope)
    const accessToken = twitchAuth.getAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch user access token available');
    }
    
    // Ensure we have a webhook secret
    if (!webhookSecret) {
      webhookSecret = crypto.randomBytes(16).toString('hex');
      console.log('Generated new webhook secret for follow subscription');
    }
    
    console.log(`Attempting to subscribe to channel follows for testing purposes`);
    console.log(`Using callback URL: ${callbackUrl}`);
    
    // Check if userId is initialized
    if (!userId) {
      userId = await getUserId(TWITCH_CHANNEL);
      console.log(`Resolved Twitch channel ${TWITCH_CHANNEL} to user ID: ${userId}`);
    }
    
    const response = await axios.post(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        type: 'channel.follow',
        version: '2',
        condition: {
          broadcaster_user_id: userId,
          moderator_user_id: userId
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
    
    const followSubscriptionId = response.data.data[0].id;
    console.log(`Subscribed to channel follows with ID: ${followSubscriptionId}`);
    return followSubscriptionId;
  } catch (error) {
    console.error('Error subscribing to chat messages:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 400 && error.response.data.message) {
        console.error('Error message:', error.response.data.message);
      }
    } else {
      console.error(error);
    }
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
  } else if (eventType === 'channel.follow') {
    // For testing purposes, treat a follow from 7decibel as a song request trigger
    const follow = notification.event;
    const username = follow.user_name || follow.user_login;
    
    if (username && username.toLowerCase() === 'belbelbot') {
      // Use a default song or playlist when 7decibel follows
      const input = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'; // Default song
      
      console.log(`Follow from ${username} - triggering song request with default song`);
      await handleSongRequest(username, input);
    } else {
      console.log(`Follow from ${username} - not 7decibel, ignoring`);
    }
  }
}

module.exports = {
  initialize,
  setupEventSubForDeployment,
  subscribeToChannelPointRedemptions,
  subscribeToChannelFollows
};