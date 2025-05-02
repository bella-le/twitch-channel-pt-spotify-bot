/**
 * Test routes for debugging Twitch EventSub
 */
const express = require('express');
const twitchEventSub = require('./twitchEventSub');
const twitchAuth = require('./twitchAuth');

/**
 * Setup test routes for the application
 * @param {Object} app - Express app instance
 */
function setupTestRoutes(app) {
  // Test endpoint to verify webhook is accessible
  app.get('/webhook/twitch/test', (req, res) => {
    console.log('Test endpoint accessed');
    res.status(200).json({ 
      status: 'ok', 
      message: 'Webhook endpoint is accessible', 
      timestamp: new Date().toISOString() 
    });
  });

  // Endpoint to check subscription status
  app.get('/webhook/twitch/status', async (req, res) => {
    try {
      console.log('Checking subscription status with Twitch...');
      const subscriptions = await twitchEventSub.checkSubscriptionStatus();
      console.log(`Found ${subscriptions.length} active subscriptions`);
      res.status(200).json({ status: 'ok', subscriptions });
    } catch (error) {
      console.error('Error checking subscription status:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Test endpoint to simulate webhook events (for testing only)
  app.post('/webhook/twitch/test-event', express.json(), (req, res) => {
    console.log('Received test webhook event');
    console.log('Test event body:', JSON.stringify(req.body, null, 2));
    
    try {
      // Process the test event
      twitchEventSub.handleEventNotification(req.body);
      res.status(200).json({ status: 'ok', message: 'Test event processed' });
    } catch (error) {
      console.error('Error processing test event:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  console.log('Test routes initialized');
}

module.exports = setupTestRoutes;
