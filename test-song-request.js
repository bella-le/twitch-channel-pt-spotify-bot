require('dotenv').config();
const spotifyClient = require('./src/spotifyClient');

// Mock channel point redemption data based on Twitch's example format
const mockRedemption = {
  user: {
    id: '12345678',
    login: 'testuser',
    display_name: 'TestUser'
  },
  reward: {
    id: 'abcdef',
    title: process.env.TWITCH_REDEMPTION_NAME || 'Song Request',
    prompt: 'Request a song to be played on stream',
    cost: 1000
  },
  user_input: '' // This will be filled with the song request
};

/**
 * Process a song request using the mock redemption data
 * @param {string} songRequest - The song request (name, URL, or URI)
 */
async function processSongRequest(songRequest) {
  console.log(`\n--- Processing test song request: "${songRequest}" ---`);
  
  // Update the mock data with the song request
  mockRedemption.user_input = songRequest;
  
  try {
    // Initialize Spotify client
    await spotifyClient.initialize();
    
    // Check if Spotify client is initialized
    if (!spotifyClient.isInitialized()) {
      console.log('Please authenticate with Spotify first by running the main app (npm start)');
      process.exit(1);
    }
    
    console.log(`Mock redemption from ${mockRedemption.user.display_name}: ${mockRedemption.user_input}`);
    
    // Process the song request
    const result = await spotifyClient.addSongToQueue(mockRedemption.user_input);
    
    if (result.success) {
      console.log(`✅ Success! Added "${result.trackName}" by ${result.artistName} to queue`);
    } else {
      console.error(`❌ Failed to add song: ${result.error}`);
    }
  } catch (error) {
    console.error('Error processing song request:', error);
  }
}

// Get the song request from command line arguments
const songRequest = process.argv.slice(2).join(' ');

if (!songRequest) {
  console.log('Please provide a song request as a command line argument');
  console.log('Example: node test-song-request.js "Bohemian Rhapsody"');
  console.log('Example: node test-song-request.js https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv');
  process.exit(1);
}

// Process the song request
processSongRequest(songRequest)
  .then(() => {
    console.log('\nTest completed!');
  })
  .catch(error => {
    console.error('Test failed:', error);
  })
  .finally(() => {
    process.exit(0);
  });
