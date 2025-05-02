require('dotenv').config();
const express = require('express');
const path = require('path');
const twitchEventSub = require('./src/twitchEventSub');
const spotifyClient = require('./src/spotifyClient');
const authRoutes = require('./src/authRoutes');
const setupTestRoutes = require('./src/testRoutes');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
// Note: We don't use express.json() here because we need the raw body for EventSub signature verification
// The EventSub handler will parse the JSON itself
app.use(express.urlencoded({ extended: true }));

// For routes that need parsed JSON
app.use('/api', express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Setup authentication routes
app.use('/', authRoutes);

// Setup test routes
setupTestRoutes(app);

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Status endpoint
app.get('/api/status', (req, res) => {
  const twitchAuth = require('./src/twitchAuth');
  res.json({
    spotify: spotifyClient.isInitialized() ? 'connected' : 'disconnected',
    twitch: twitchAuth.isInitialized() ? 'connected' : 'disconnected'
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize Twitch integration
let twitchInitialized = false;
if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && process.env.TWITCH_CHANNEL) {
  if (process.env.USE_EVENTSUB === 'true') {
    console.log('Using Twitch EventSub for channel point redemptions');
    
    // Initialize Twitch EventSub
    twitchEventSub.initialize(spotifyClient, app)
      .then((initialized) => {
        if (initialized) {
          twitchInitialized = true;
          console.log('Twitch EventSub initialized');
          
          // Get the callback URL based on environment
          const callbackUrl = process.env.NODE_ENV === 'production'
            ? `${process.env.APP_URL}/webhook/twitch`
            : `http://localhost:${PORT}/webhook/twitch`;
          
          // Check if we have a valid Twitch auth token
          const twitchAuth = require('./src/twitchAuth');
          if (twitchAuth.isInitialized()) {
            // Subscribe to channel point redemptions
            twitchEventSub.subscribeToChannelPointRedemptions(callbackUrl)
              .then(subscriptionId => {
                console.log(`Subscribed to channel point redemptions with ID: ${subscriptionId}`);
              })
              .catch(error => {
                console.error('Failed to subscribe to channel point redemptions:', error);
                console.log('Please authenticate with Twitch at /auth/twitch to enable channel point redemptions');
              });
          } else {
            console.log('Twitch authentication required. Please visit /auth/twitch to authenticate.');
          }
        } else {
          console.log('Twitch EventSub not fully initialized. Please authenticate with Twitch at /auth/twitch');
        }
      })
      .catch(error => {
        console.error('Failed to initialize Twitch EventSub:', error);
      });
  } else {
    console.log('Using Twitch IRC for channel point redemptions');
    // twitchBot.initialize(spotifyClient)
    //   .then(() => {
    //     twitchInitialized = true;
    //     console.log('Twitch IRC bot initialized');
    //   })
    //   .catch(error => {
    //     console.error('Failed to initialize Twitch IRC bot:', error);
    //   });
  }
}

// Initialize services
async function initializeServices() {
  try {
    // Initialize Spotify client first to ensure authentication
    await spotifyClient.initialize();
    
    // Note: Twitch EventSub is now initialized separately with proper user authentication
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start the services
initializeServices();
