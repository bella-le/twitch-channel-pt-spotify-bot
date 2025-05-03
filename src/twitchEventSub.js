const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const twitchAuth = require('./twitchAuth');
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
  
  // Set up the webhook endpoint
  webhookSecret = crypto.randomBytes(16).toString('hex');
  setupWebhookEndpoint(app);
  
  // Initialize Google Sheets for tracking song requests
  try {
    const sheetsInitialized = await sheetsManager.initialize();
    if (sheetsInitialized) {
      console.log('Google Sheets integration initialized successfully');
    } else {
      console.warn('Google Sheets integration initialization failed');
    }
  } catch (error) {
    console.error('Error initializing Google Sheets:', error);
    // Continue with initialization even if Google Sheets fails
  }
  
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
  // Add a test endpoint to verify webhook is accessible
  app.get('/webhook/twitch/test', (req, res) => {
    console.log('Test endpoint accessed');
    res.status(200).json({ status: 'ok', message: 'Webhook endpoint is accessible', timestamp: new Date().toISOString() });
  });

  // Add an endpoint to check subscription status
  app.get('/webhook/twitch/status', async (req, res) => {
    try {
      console.log('Checking subscription status with Twitch...');
      const subscriptions = await checkSubscriptionStatus();
      console.log(`Found ${subscriptions.length} active subscriptions`);
      res.status(200).json({ status: 'ok', subscriptions });
    } catch (error) {
      console.error('Error checking subscription status:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Add a test endpoint to simulate webhook events (for testing only)
  app.post('/webhook/twitch/test-event', express.json(), (req, res) => {
    console.log('Received test webhook event');
    console.log('Test event body:', JSON.stringify(req.body, null, 2));
    
    try {
      // Process the test event
      handleEventNotification(req.body);
      res.status(200).json({ status: 'ok', message: 'Test event processed' });
    } catch (error) {
      console.error('Error processing test event:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  // Add an endpoint to force recreate subscriptions
  app.post('/webhook/twitch/recreate-subscriptions', express.json(), async (req, res) => {
    console.log('Received request to recreate subscriptions');
    
    try {
      // Get the base URL from the request
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      
      console.log(`Using base URL: ${baseUrl}`);
      
      // Delete all existing subscriptions and create new ones
      await setupEventSubForDeployment(baseUrl, true);
      
      res.status(200).json({ 
        status: 'ok', 
        message: 'Subscriptions recreated successfully',
        webhookSecret: webhookSecret
      });
    } catch (error) {
      console.error('Error recreating subscriptions:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
  
  // Handle GET requests for webhook verification
  app.get('/webhook/twitch', (req, res) => {
    // Handle Twitch verification challenge
    if (req.query && req.query['hub.challenge']) {
      // Legacy WebSub verification
      const challenge = req.query['hub.challenge'];
      res.status(200).send(challenge);
    } else if (req.headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
      // EventSub verification
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
    
    console.log('Computed signature:', signature);
    console.log('Received signature:', messageSignature);
    
    // Verify the signature
    if (signature !== messageSignature) {
      console.error('Signature verification failed');
      return res.status(403).send('Signature verification failed');
    }
    
    // Handle the notification based on message type
    if (messageType === 'notification') {
      try {
        console.log('Processing event notification');
        await handleEventNotification(notification);
        console.log('Successfully processed event notification');
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
      console.log(`Added song "${result.trackName}" by ${result.artistName} to queue`);
      
      // Update Google Sheets leaderboards
      if (sheetsManager.isInitialized()) {
        try {
          // Update song leaderboard
          await sheetsManager.updateSongLeaderboard({
            trackId: result.trackId,
            trackName: result.trackName,
            artistName: result.artistName
          });
          
          // Update user leaderboard
          await sheetsManager.updateUserLeaderboard(username, new Date().toLocaleString());
          
          console.log(`Updated leaderboards for song request by ${username}`);
        } catch (sheetsError) {
          console.error('Error updating leaderboards:', sheetsError);
        }
      } else {
        console.warn('Google Sheets not initialized, skipping leaderboard updates');
      }
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
 * @param {boolean} forceRecreate - Whether to force delete and recreate the subscription
 * @returns {string} The subscription ID
 */
async function subscribeToChannelPointRedemptions(callbackUrl, forceRecreate = false) {
  try {
    // Use app access token for EventSub subscriptions as required by Twitch API
    const accessToken = await twitchAuth.getAppAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch app access token available');
    }
    
    // Check if userId is initialized
    if (!userId) {
      userId = await getUserId(TWITCH_CHANNEL);
      console.log(`Resolved Twitch channel ${TWITCH_CHANNEL} to user ID: ${userId}`);
    }
    
    // If forceRecreate is true, delete any existing subscriptions first
    if (forceRecreate) {
      console.log('Force recreate flag is set. Deleting any existing channel point subscriptions...');
      await deleteAllChannelPointSubscriptions();
    } else {
      // Check if we already have an active subscription for this event type
      console.log('Checking for existing EventSub subscriptions...');
      const existingSubscriptions = await checkSubscriptionStatus();
      
      // Look for an existing subscription for channel point redemptions
      const existingSubscription = existingSubscriptions.find(sub => 
        sub.type === 'channel.channel_points_custom_reward_redemption.add' && 
        sub.condition.broadcaster_user_id === userId
      );
      
      if (existingSubscription) {
        console.log(`Found existing subscription with ID: ${existingSubscription.id}`);
        console.log('Using existing subscription instead of creating a new one');
        
        // Use the existing subscription ID
        subscriptionId = existingSubscription.id;
        
        // Important: We need to use the same webhook secret that was used when creating this subscription
        // Unfortunately, Twitch doesn't return the secret in the API response for security reasons
        // So we'll continue using our current webhook secret and hope it matches
        // If it doesn't match, we'll need to delete the subscription and create a new one
        console.log('Note: Using existing webhook secret. If signature verification fails, you may need to delete the subscription.');
        
        return subscriptionId;
      }
    }
    
    // No existing subscription found or we're forcing recreation, create a new one
    console.log('Creating a new subscription...');
    
    // Generate a new webhook secret for the new subscription
    webhookSecret = crypto.randomBytes(16).toString('hex');
    console.log('Generated new webhook secret for channel point redemption subscription');
    
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
    console.log(`Using webhook secret: ${webhookSecret}`);
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
      
      // If we get a 409 Conflict (subscription already exists), try to delete and recreate
      if (error.response.status === 409) {
        console.log('Subscription already exists but we got a conflict. Deleting and recreating...');
        await deleteAllChannelPointSubscriptions();
        // Try again with forceRecreate=true to avoid infinite recursion
        return subscribeToChannelPointRedemptions(callbackUrl, true);
      }
    }
    throw error;
  }
}

/**
 * Set up the EventSub subscription for a deployed application
 * @param {string} baseUrl - The base URL of the deployed application
 * @param {boolean} forceRecreate - Whether to force delete and recreate the subscription
 */
async function setupEventSubForDeployment(baseUrl, forceRecreate = false) {
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
    await subscribeToChannelPointRedemptions(callbackUrl, forceRecreate);
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
  } else if (eventType === 'channel.follow') {
    // For testing purposes, treat a follow from belbelbot as a song request trigger
    
    const event = notification.event;
    const username = event.user_login;
    const userId = event.user_id;
    const followedAt = event.followed_at;
    const broadcasterName = event.broadcaster_user_name;
    
    console.log(`Follow event details: User ${username} (ID: ${userId}) followed ${broadcasterName} at ${followedAt}`);
    
    // For testing, only process follows from belbelbot
    if (username === 'belbelbot') {
      console.log(`Follow from test user ${username} detected, adding default song`);
      try {
        // Use a default song when belbelbot follows
        const input = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'; // Default song
        await handleSongRequest(username, input);
        console.log('Successfully added song to queue after follow event');
      } catch (error) {
        console.error('Error adding song to queue after follow event:', error);
      }
    } else {
      console.log(`Follow from ${username} detected, but not test user. Ignoring.`);
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
    
    console.log(`Found ${response.data.data.length} active subscriptions`);
    response.data.data.forEach(sub => {
      console.log(`- Subscription ID: ${sub.id}, Type: ${sub.type}, Status: ${sub.status}`);
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return [];
  }
}

/**
 * Delete an EventSub subscription
 * @param {string} subscriptionId - The ID of the subscription to delete
 * @returns {boolean} Whether the deletion was successful
 */
async function deleteSubscription(subscriptionId) {
  try {
    const accessToken = await twitchAuth.getAppAccessToken();
    
    if (!accessToken) {
      throw new Error('No Twitch app access token available');
    }
    
    console.log(`Attempting to delete subscription with ID: ${subscriptionId}`);
    
    await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log(`Successfully deleted subscription with ID: ${subscriptionId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting subscription ${subscriptionId}:`, error);
    return false;
  }
}

/**
 * Delete all existing EventSub subscriptions for channel point redemptions
 * @returns {boolean} Whether the deletion was successful
 */
async function deleteAllChannelPointSubscriptions() {
  try {
    const subscriptions = await checkSubscriptionStatus();
    
    // Filter for channel point redemption subscriptions
    const channelPointSubs = subscriptions.filter(sub => 
      sub.type === 'channel.channel_points_custom_reward_redemption.add'
    );
    
    if (channelPointSubs.length === 0) {
      console.log('No existing channel point subscriptions found to delete');
      return true;
    }
    
    console.log(`Found ${channelPointSubs.length} channel point subscriptions to delete`);
    
    // Delete each subscription
    for (const sub of channelPointSubs) {
      await deleteSubscription(sub.id);
    }
    
    console.log('Successfully deleted all channel point subscriptions');
    return true;
  } catch (error) {
    console.error('Error deleting channel point subscriptions:', error);
    return false;
  }
}

module.exports = {
  initialize,
  setupEventSubForDeployment,
  subscribeToChannelPointRedemptions,
  checkSubscriptionStatus,
  handleEventNotification
};