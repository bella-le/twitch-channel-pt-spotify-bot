const express = require('express');
const router = express.Router();
const spotifyClient = require('./spotifyClient');

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

module.exports = router;
