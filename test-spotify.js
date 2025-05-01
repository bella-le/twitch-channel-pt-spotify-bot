require('dotenv').config();
const spotifyClient = require('./src/spotifyClient');

/**
 * Test the Spotify authentication and search functionality
 */
async function testSpotify() {
  try {
    console.log('Initializing Spotify client...');
    await spotifyClient.initialize();
    
    if (!spotifyClient.isInitialized()) {
      console.log('Please authenticate with Spotify first by running the main app (npm start)');
      return;
    }
    
    console.log('Spotify client initialized successfully!');
    console.log('Your Spotify authentication is working correctly.');
    
    // Test getting currently playing track (if any)
    console.log('\nChecking if Spotify is currently playing...');
    const SpotifyWebApi = require('spotify-web-api-node');
    const fs = require('fs');
    const path = require('path');
    
    // Token storage path
    const TOKEN_PATH = path.join(__dirname, 'tokens.json');
    
    // Create a new Spotify API client
    const spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI
    });
    
    // Load tokens
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      spotifyApi.setAccessToken(tokens.accessToken);
      spotifyApi.setRefreshToken(tokens.refreshToken);
      
      try {
        const currentlyPlaying = await spotifyApi.getMyCurrentPlayingTrack();
        
        if (currentlyPlaying.body && currentlyPlaying.body.item) {
          const track = currentlyPlaying.body.item;
          console.log(`Currently playing: "${track.name}" by ${track.artists.map(a => a.name).join(', ')}`);
        } else {
          console.log('No track currently playing');
        }
      } catch (error) {
        console.log('Error getting currently playing track:', error.message);
      }
    }
    
    console.log('\nYour Spotify integration is ready to use with the song request bot!');
    
  } catch (error) {
    console.error('Error testing Spotify:', error);
  }
}

// Run the test
testSpotify()
  .then(() => {
    console.log('\nTest completed!');
  })
  .catch(error => {
    console.error('Test failed:', error);
  });
