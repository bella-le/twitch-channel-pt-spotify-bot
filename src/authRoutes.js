const express = require('express');
const router = express.Router();
const spotifyClient = require('./spotifyClient');
const twitchAuth = require('./twitchAuth');
const twitchEventSub = require('./twitchEventSub');
const { v4: uuidv4 } = require('uuid');
const { getSongLeaderboard, getUserLeaderboard } = require('./sheetsManager');

// Route for initiating Spotify authorization
router.get('/auth/spotify', (req, res) => {
  const authUrl = spotifyClient.getAuthorizationUrl();
  res.redirect(authUrl);
});

// Callback route for Spotify authorization
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }
  
  try {
    const result = await spotifyClient.handleCallback(code);
    
    if (result.success) {
      res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
              }
              .container {
                background-color: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                max-width: 600px;
                margin: 0 auto;
              }
              h1 {
                color: #1DB954; /* Spotify green */
              }
              p {
                margin: 20px 0;
                line-height: 1.5;
              }
              .success-icon {
                font-size: 48px;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Authentication Successful!</h1>
              <p>You have successfully authenticated with Spotify. You can now close this window and return to the application.</p>
              <p>Your Twitch channel points song request bot is now ready to use!</p>
            </div>
          </body>
        </html>
      `);
    } else {
      res.status(500).send(`
        <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
              }
              .container {
                background-color: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                max-width: 600px;
                margin: 0 auto;
              }
              h1 {
                color: #e74c3c;
              }
              p {
                margin: 20px 0;
                line-height: 1.5;
              }
              .error-icon {
                font-size: 48px;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Authentication Failed</h1>
              <p>There was an error authenticating with Spotify: ${result.error}</p>
              <p>Please try again later.</p>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    res.status(500).send('An error occurred during authentication');
  }
});

// Status endpoint to check if the bot is authenticated
router.get('/status', (req, res) => {
  const isAuthenticated = spotifyClient.isInitialized();
  res.json({ 
    status: isAuthenticated ? 'authenticated' : 'not_authenticated',
    authUrl: isAuthenticated ? null : spotifyClient.getAuthorizationUrl()
  });
});

// Route for initiating Twitch authorization
router.get('/auth/twitch', (req, res) => {
  const authUrl = twitchAuth.getAuthorizationUrl();
  res.redirect(authUrl);
});

// Callback route for Twitch authorization
router.get('/twitch/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }
  
  try {
    const result = await twitchAuth.handleCallback(code);
    
    if (result.success) {
      // After successful authentication, recreate the EventSub subscription
      try {
        // Get the base URL from the request
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;
        
        console.log('Authentication successful. Recreating EventSub subscriptions...');
        await twitchEventSub.setupEventSubForDeployment(baseUrl, true);
        console.log('EventSub subscriptions recreated successfully');
      } catch (subscriptionError) {
        console.error('Error recreating EventSub subscriptions:', subscriptionError);
        // Continue with the authentication flow even if subscription recreation fails
      }
      res.send(`
        <html>
          <head>
            <title>Twitch Authentication Successful</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
              }
              .container {
                background-color: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                max-width: 600px;
                margin: 0 auto;
              }
              h1 {
                color: #6441a5; /* Twitch purple */
              }
              p {
                margin: 20px 0;
                line-height: 1.5;
              }
              .success-icon {
                font-size: 48px;
                margin-bottom: 20px;
              }
              .button {
                display: inline-block;
                background-color: #6441a5;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin-top: 20px;
              }
              .button:hover {
                background-color: #7d5bbe;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Twitch Authentication Successful!</h1>
              <p>Your bot is now authenticated with Twitch and can listen for channel point redemptions.</p>
              <p>You can close this window and return to the bot dashboard.</p>
              <a href="/" class="button">Return to Dashboard</a>
            </div>
          </body>
        </html>
      `);
    } else {
      res.status(500).send(`
        <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
              }
              .container {
                background-color: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                max-width: 600px;
                margin: 0 auto;
              }
              h1 {
                color: #e74c3c;
              }
              p {
                margin: 20px 0;
                line-height: 1.5;
              }
              .error-icon {
                font-size: 48px;
                margin-bottom: 20px;
                color: #e74c3c;
              }
              .button {
                display: inline-block;
                background-color: #6441a5;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin-top: 20px;
              }
              .button:hover {
                background-color: #7d5bbe;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Authentication Failed</h1>
              <p>There was an error authenticating with Twitch.</p>
              <p>Error: ${result.error || 'Unknown error'}</p>
              <a href="/" class="button">Return to Dashboard</a>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error handling Twitch callback:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              background-color: white;
              border-radius: 10px;
              padding: 30px;
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
              max-width: 600px;
              margin: 0 auto;
            }
            h1 {
              color: #e74c3c;
            }
            p {
              margin: 20px 0;
              line-height: 1.5;
            }
            .error-icon {
              font-size: 48px;
              margin-bottom: 20px;
              color: #e74c3c;
            }
            .button {
              display: inline-block;
              background-color: #6441a5;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
              margin-top: 20px;
            }
            .button:hover {
              background-color: #7d5bbe;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Authentication Error</h1>
            <p>There was an error processing your authentication with Twitch.</p>
            <p>Please try again later.</p>
            <a href="/" class="button">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `);
  }
});

module.exports = router;
