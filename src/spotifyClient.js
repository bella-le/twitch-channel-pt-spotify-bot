const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const path = require('path');
const open = require('open');

// Token storage path - use environment variable if available for cloud deployment
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, '..', 'tokens.json');

// For cloud deployment, we can also store tokens in environment variables
let storedAccessToken = process.env.SPOTIFY_ACCESS_TOKEN || null;
let storedRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN || null;
let tokenExpiresAt = process.env.TOKEN_EXPIRES_AT ? parseInt(process.env.TOKEN_EXPIRES_AT) : null;

// Spotify API scopes needed for our application
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing'
];

// Create a new Spotify API client
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

let initialized = false;

/**
 * Initialize the Spotify client
 */
async function initialize() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify client ID or client secret not set in environment variables');
  }

  try {
    // First check if we have tokens in environment variables (for cloud deployment)
    if (storedAccessToken && storedRefreshToken) {
      console.log('Found Spotify tokens in environment variables');
      spotifyApi.setAccessToken(storedAccessToken);
      spotifyApi.setRefreshToken(storedRefreshToken);
      
      // Check if the access token is still valid
      try {
        await spotifyApi.getMe();
        console.log('Successfully authenticated with Spotify using environment tokens');
        initialized = true;
        return;
      } catch (error) {
        console.log('Environment access token expired, refreshing...');
        await refreshAccessToken();
        initialized = true;
        return;
      }
    }
    // Then check if we have stored tokens in file
    else if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      
      // Set the access token
      spotifyApi.setAccessToken(tokens.accessToken);
      spotifyApi.setRefreshToken(tokens.refreshToken);
      
      // Check if the access token is still valid
      try {
        await spotifyApi.getMe();
        console.log('Successfully authenticated with Spotify using stored tokens');
        initialized = true;
        return;
      } catch (error) {
        console.log('Stored access token expired, refreshing...');
        await refreshAccessToken();
        initialized = true;
        return;
      }
    } else {
      console.log('No stored tokens found. Please authenticate with Spotify.');
      console.log(`Please visit: ${getAuthorizationUrl()}`);
      console.log('After authentication, the tokens will be stored automatically.');
    }
  } catch (error) {
    console.error('Error initializing Spotify client:', error);
    throw error;
  }
}

/**
 * Get the Spotify authorization URL
 * @returns {string} The authorization URL
 */
function getAuthorizationUrl() {
  return spotifyApi.createAuthorizeURL(SCOPES, 'state');
}

/**
 * Handle the Spotify callback after authorization
 * @param {string} code - The authorization code from Spotify
 */
async function handleCallback(code) {
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    
    // Save the access token and refresh token
    spotifyApi.setAccessToken(data.body.access_token);
    spotifyApi.setRefreshToken(data.body.refresh_token);
    
    // Store tokens for future use
    const tokens = {
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      expiresAt: Date.now() + (data.body.expires_in * 1000)
    };
    
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Successfully authenticated with Spotify');
    
    initialized = true;
    return { success: true };
  } catch (error) {
    console.error('Error handling Spotify callback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh the Spotify access token
 */
async function refreshAccessToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    
    // Update the access token
    spotifyApi.setAccessToken(data.body.access_token);
    
    // Update the stored tokens
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      tokens.accessToken = data.body.access_token;
      tokens.expiresAt = Date.now() + (data.body.expires_in * 1000);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    }
    
    console.log('Successfully refreshed Spotify access token');
    return true;
  } catch (error) {
    console.error('Error refreshing Spotify access token:', error);
    return false;
  }
}

/**
 * Check if the Spotify client is initialized
 * @returns {boolean} Whether the client is initialized
 */
function isInitialized() {
  return initialized;
}

/**
 * Add a song to the Spotify queue
 * @param {string} query - The song query (can be a Spotify URI, URL, or search term)
 * @returns {Object} The result of the operation
 */
async function addSongToQueue(query) {
  try {
    if (!initialized) {
      throw new Error('Spotify client is not initialized');
    }
    
    // Check if we need to refresh the token
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (Date.now() > tokens.expiresAt) {
      await refreshAccessToken();
    }
    
    // Check if the query is a Spotify URI or URL
    if (query.includes('spotify.com') || query.includes('spotify:track:')) {
      // Extract the track ID from the URI or URL
      let trackId;
      
      if (query.includes('spotify:track:')) {
        // Format: spotify:track:1234567890
        trackId = query.split(':')[2];
      } else if (query.includes('spotify.com/track/')) {
        // Format: https://open.spotify.com/track/1234567890
        trackId = query.split('/track/')[1].split('?')[0];
      } else {
        throw new Error('Invalid Spotify URI or URL');
      }
      
      // Get track info
      const track = await spotifyApi.getTrack(trackId);
      
      // Add the track to the queue
      await spotifyApi.addToQueue(`spotify:track:${trackId}`);
      
      return {
        success: true,
        trackName: track.body.name,
        artistName: track.body.artists.map(artist => artist.name).join(', ')
      };
    } else {
      // Treat as a search query
      const searchResults = await spotifyApi.searchTracks(query, { limit: 1 });
      
      if (searchResults.body.tracks.items.length === 0) {
        throw new Error('No tracks found matching the query');
      }
      
      const track = searchResults.body.tracks.items[0];
      
      // Add the track to the queue
      await spotifyApi.addToQueue(`spotify:track:${track.id}`);
      
      return {
        success: true,
        trackName: track.name,
        artistName: track.artists.map(artist => artist.name).join(', ')
      };
    }
  } catch (error) {
    console.error('Error adding song to queue:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initialize,
  getAuthorizationUrl,
  handleCallback,
  isInitialized,
  addSongToQueue
};
