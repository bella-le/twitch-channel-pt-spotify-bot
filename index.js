require('dotenv').config();
const express = require('express');
const path = require('path');
const twitchEventSub = require('./src/twitchEventSub');
const spotifyClient = require('./src/spotifyClient');
const authRoutes = require('./src/authRoutes');

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

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    spotify: spotifyClient.isInitialized() ? 'connected' : 'disconnected',
    twitch: process.env.TWITCH_CLIENT_ID ? 'configured' : 'not configured'
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize services
async function initializeServices() {
  try {
    // Initialize Spotify client first to ensure authentication
    await spotifyClient.initialize();
    
    // Then initialize Twitch EventSub with the Spotify client
    await twitchEventSub.initialize(spotifyClient, app);
    
    // If we're in a production environment, set up EventSub for the deployed URL
    if (process.env.NODE_ENV === 'production' && process.env.APP_URL) {
      await twitchEventSub.setupEventSubForDeployment(process.env.APP_URL);
    } else {
      console.log('Running in development mode. EventSub webhook requires a public URL.');
      console.log('Set NODE_ENV=production and APP_URL=your-app-url to enable EventSub in production.');
    }
    
    console.log('Bot initialized and ready to receive song requests!');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start the services
initializeServices();
