require('dotenv').config();
const express = require('express');
const path = require('path');
const twitchEventSub = require('./src/twitchEventSub');
const spotifyClient = require('./src/spotifyClient');
const blacklistManager = require('./src/blacklistManager');
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

// Home route (now the queue view)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth streamer route
app.get('/auth-streamer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth-streamer.html'));
});

// Status endpoint
app.get('/api/status', (req, res) => {
  const twitchAuth = require('./src/twitchAuth');
  res.json({
    spotify: spotifyClient.isInitialized() ? 'connected' : 'disconnected',
    twitch: twitchAuth.isInitialized() ? 'connected' : 'disconnected'
  });
});

// Queue view route
app.get('/queue', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'queue.html'));
});

// API endpoint to get the current song and queue
app.get('/api/spotify/queue', async (req, res) => {
  try {
    if (!spotifyClient.isInitialized()) {
      return res.json({
        success: false,
        error: 'Spotify client is not initialized',
        authUrl: spotifyClient.getAuthorizationUrl()
      });
    }

    // Get currently playing track
    const currentlyPlaying = await spotifyClient.getCurrentlyPlaying();
    
    // Get our local queue
    const queueStore = require('./src/queueStore');
    const localQueue = queueStore.getQueue();
    
    // Check if current song matches first in queue and remove if needed
    // Also handle skipped songs in the queue
    let queueResult = { matched: false, skipped: [] };
    if (currentlyPlaying && currentlyPlaying.item) {
      queueResult = queueStore.checkAndRemoveCurrentlyPlaying(currentlyPlaying);
    }
    
    // Get the requester info for the currently playing song
    const currentSongInfo = queueStore.getCurrentlyPlaying();
    
    // Add requester info to the response
    const response = {
      success: true,
      currentlyPlaying,
      currentSongInfo,
      shadowQueue: localQueue
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting queue:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to get the blacklist
app.get('/api/blacklist', (req, res) => {
  try {
    const blacklist = blacklistManager.getBlacklist();
    res.json({
      success: true,
      blacklist
    });
  } catch (error) {
    console.error('Error getting blacklist:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to update the blacklist
app.post('/api/blacklist', express.json(), (req, res) => {
  try {
    const { blacklist } = req.body;
    
    if (!Array.isArray(blacklist)) {
      return res.status(400).json({
        success: false,
        error: 'Blacklist must be an array of usernames'
      });
    }
    
    // Save the blacklist
    const success = blacklistManager.saveBlacklist(blacklist);
    
    if (success) {
      res.json({
        success: true,
        message: 'Blacklist updated successfully',
        blacklist
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save blacklist'
      });
    }
  } catch (error) {
    console.error('Error updating blacklist:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to clear the queue
app.post('/api/spotify/queue/clear', (req, res) => {
  try {
    const queueStore = require('./src/queueStore');
    const result = queueStore.clearQueue();
    res.json({
      success: true,
      message: 'Queue cleared successfully',
      queue: result.queue
    });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint to add a song to the queue
app.post('/api/test/song-request', express.json(), async (req, res) => {
  try {
    const { song, username } = req.body;
    
    if (!song) {
      return res.status(400).json({
        success: false,
        error: 'Song parameter is required'
      });
    }
    
    // Use the requester's username or default to 'TestUser'
    const requester = username || 'TestUser';
    
    // Process the song request
    const result = await spotifyClient.addSongToQueue(song, requester);
    
    if (result.success) {
      console.log(`Test API: Added "${result.trackName}" by ${result.artistName} to queue (requested by ${requester})`);
      res.json({
        success: true,
        message: `Added "${result.trackName}" by ${result.artistName} to queue`,
        track: result
      });
    } else {
      console.error(`Test API: Failed to add song: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error processing test song request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running'
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
    
    // Initialize Google Sheets for leaderboards
    // This is now handled in twitchEventSub.initialize() to ensure proper sequencing
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start the services
initializeServices();
