const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:8888/twitch/callback';

// Token storage path
const TOKEN_PATH = path.join(__dirname, '..', 'twitch_tokens.json');

// Scopes needed for channel point redemptions
const SCOPES = ['channel:read:redemptions'];

let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = null;

/**
 * Initialize Twitch authentication
 */
async function initialize() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch client ID or client secret not set in environment variables');
  }

  try {
    // Check if we have stored tokens
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      
      // Set the access token
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      tokenExpiresAt = tokens.expiresAt;
      
      // Check if the access token is still valid
      try {
        await validateToken(accessToken);
        console.log('Successfully authenticated with Twitch using stored tokens');
        return true;
      } catch (error) {
        console.log('Stored Twitch access token expired, refreshing...');
        await refreshAccessToken();
        return true;
      }
    } else {
      console.log('No stored Twitch tokens found. Please authenticate with Twitch.');
      console.log(`Please visit: ${getAuthorizationUrl()}`);
      console.log('After authentication, the tokens will be stored automatically.');
      return false;
    }
  } catch (error) {
    console.error('Error initializing Twitch authentication:', error);
    throw error;
  }
}

/**
 * Get the Twitch authorization URL
 * @returns {string} The authorization URL
 */
function getAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' ')
  });
  
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

/**
 * Handle the Twitch callback after authorization
 * @param {string} code - The authorization code from Twitch
 */
async function handleCallback(code) {
  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: TWITCH_REDIRECT_URI
    });
    
    const response = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Save the access token and refresh token
    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
    
    // Store tokens for future use
    const tokens = {
      accessToken,
      refreshToken,
      expiresAt: tokenExpiresAt
    };
    
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Successfully authenticated with Twitch');
    
    // Set up EventSub subscription if in production
    if (process.env.NODE_ENV === 'production' && process.env.APP_URL) {
      try {
        const twitchEventSub = require('./twitchEventSub');
        const callbackUrl = `${process.env.APP_URL}/webhook/twitch`;
        
        // Subscribe to channel point redemptions
        // await twitchEventSub.subscribeToChannelPointRedemptions(callbackUrl);
        console.log(`Set up EventSub subscription for channel points with callback URL: ${callbackUrl}`);
        
        // Subscribe to chat messages from 7decibel
        await twitchEventSub.subscribeToChatMessages(callbackUrl, '7decibel');
        console.log(`Set up EventSub subscription for chat messages from 7decibel with callback URL: ${callbackUrl}`);
      } catch (error) {
        console.error('Failed to set up EventSub subscription after authentication:', error);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error handling Twitch callback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh the Twitch access token
 */
async function refreshAccessToken() {
  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    
    const response = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Update the access token
    accessToken = response.data.access_token;
    
    // Refresh token might be updated
    if (response.data.refresh_token) {
      refreshToken = response.data.refresh_token;
    }
    
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
    
    // Update the stored tokens
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = {
        accessToken,
        refreshToken,
        expiresAt: tokenExpiresAt
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    }
    
    console.log('Successfully refreshed Twitch access token');
    return true;
  } catch (error) {
    console.error('Error refreshing Twitch access token:', error);
    return false;
  }
}

/**
 * Validate a Twitch access token
 * @param {string} token - The access token to validate
 */
async function validateToken(token) {
  try {
    const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `OAuth ${token}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error validating Twitch token:', error);
    throw error;
  }
}

/**
 * Get the current access token
 * @returns {string} The access token
 */
function getAccessToken() {
  // Check if token is expired
  if (tokenExpiresAt && Date.now() > tokenExpiresAt) {
    console.log('Twitch token expired, refreshing...');
    refreshAccessToken();
  }
  
  return accessToken;
}

/**
 * Check if Twitch authentication is initialized
 * @returns {boolean} Whether authentication is initialized
 */
function isInitialized() {
  return !!accessToken;
}

/**
 * Set up authentication routes
 * @param {Object} app - The Express app
 */
function setupAuthRoutes(app) {
  // Route for initiating Twitch authorization
  app.get('/auth/twitch', (req, res) => {
    const authUrl = getAuthorizationUrl();
    res.redirect(authUrl);
  });
  
  // Callback route for Twitch authorization
  app.get('/twitch/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send('Authorization code not provided');
    }
    
    try {
      const result = await handleCallback(code);
      
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
                  color: #9146FF; /* Twitch purple */
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
                <h1>Twitch Authentication Successful!</h1>
                <p>You have successfully authenticated with Twitch. You can now close this window and return to the application.</p>
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
                <p>There was an error authenticating with Twitch: ${result.error}</p>
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
}

/**
 * Get an app access token (client credentials) for EventSub subscriptions
 * @returns {Promise<string>} The app access token
 */
async function getAppAccessToken() {
  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    });
    
    const response = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('Successfully obtained app access token for EventSub');
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting app access token:', error);
    throw error;
  }
}

module.exports = {
  initialize,
  getAuthorizationUrl,
  handleCallback,
  getAccessToken,
  getAppAccessToken,
  isInitialized,
  setupAuthRoutes
};
