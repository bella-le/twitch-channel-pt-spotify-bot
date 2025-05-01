require('dotenv').config();
const express = require('express');
const path = require('path');
const twitchBot = require('./src/twitchBot');
const spotifyClient = require('./src/spotifyClient');
const authRoutes = require('./src/authRoutes');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Setup authentication routes
app.use('/', authRoutes);

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize Twitch bot and Spotify client
async function initializeServices() {
  try {
    // Initialize Spotify client first to ensure authentication
    await spotifyClient.initialize();
    
    // Then initialize Twitch bot with the Spotify client
    await twitchBot.initialize(spotifyClient);
    
    console.log('Bot initialized and ready to receive song requests!');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start the services
initializeServices();
