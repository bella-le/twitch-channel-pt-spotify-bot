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
    
    // Update our in-memory variables
    storedAccessToken = tokens.accessToken;
    storedRefreshToken = tokens.refreshToken;
    tokenExpiresAt = tokens.expiresAt;
    
    // Store to file if possible (may not work in cloud environments with ephemeral filesystems)
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('Successfully stored tokens to file');
    } catch (error) {
      console.log('Could not store tokens to file, but they are stored in memory:', error.message);
    }
    
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
    
    // Update in-memory tokens
    storedAccessToken = data.body.access_token;
    tokenExpiresAt = Date.now() + (data.body.expires_in * 1000);
    
    // Update the stored tokens in file if possible
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        tokens.accessToken = data.body.access_token;
        tokens.expiresAt = tokenExpiresAt;
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      }
    } catch (error) {
      console.log('Could not update token file, but tokens are updated in memory:', error.message);
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
 * Get available Spotify devices
 * @returns {Array} List of available devices
 */
async function getDevices() {
  try {
    const response = await spotifyApi.getMyDevices();
    return response.body.devices;
  } catch (error) {
    console.error('Error getting devices:', error);
    return [];
  }
}

/**
 * Transfer playback to a specific device
 * @param {string} deviceId - The Spotify device ID
 * @returns {boolean} Whether the transfer was successful
 */
async function transferPlayback(deviceId) {
  try {
    await spotifyApi.transferMyPlayback([deviceId]);
    console.log(`Transferred playback to device: ${deviceId}`);
    return true;
  } catch (error) {
    console.error('Error transferring playback:', error);
    return false;
  }
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
    
    // Get track info based on query type
    let trackId, trackName, artistName;
    
    // Extract Spotify track link from the query (which might contain additional text)
    let spotifyLink = null;
    
    // Check for Spotify URI format (spotify:track:1234567890)
    const uriMatch = query.match(/spotify:track:([a-zA-Z0-9]+)/);
    if (uriMatch && uriMatch[1]) {
      spotifyLink = uriMatch[0]; // The full URI
      trackId = uriMatch[1]; // The ID portion
      console.log(`Found Spotify URI in message: ${spotifyLink}`);
    }
    
    // Check for Spotify URL format (https://open.spotify.com/track/1234567890)
    if (!spotifyLink) {
      const urlMatch = query.match(/https?:\/\/open\.spotify\.com\/(intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)(\?[^\s]*)?/);
      if (urlMatch && urlMatch[2]) {
        spotifyLink = urlMatch[0].split('?')[0]; // The URL without query parameters
        trackId = urlMatch[2]; // The ID portion is now in capture group 2
        console.log(`Found Spotify URL in message: ${spotifyLink}`);
      }
    }
    
    // If we found a Spotify link, proceed with getting track info
    if (trackId) {
      
      // Get track info
      const track = await spotifyApi.getTrack(trackId);
      trackName = track.body.name;
      artistName = track.body.artists.map(artist => artist.name).join(', ');
    } else {
      // Treat as a search query
      const searchResults = await spotifyApi.searchTracks(query, { limit: 1 });
      
      if (searchResults.body.tracks.items.length === 0) {
        throw new Error('No tracks found matching the query');
      }
      
      const track = searchResults.body.tracks.items[0];
      trackId = track.id;
      trackName = track.name;
      artistName = track.artists.map(artist => artist.name).join(', ');
    }
    
    // Try to add the track to the queue
    try {
      await spotifyApi.addToQueue(`spotify:track:${trackId}`);
    } catch (error) {
      // If no active device is found, try to transfer playback to the last active device
      if (error.body && error.body.error && error.body.error.reason === 'NO_ACTIVE_DEVICE') {
        console.log('No active device found. Attempting to transfer playback...');
        
        // Get available devices
        const devices = await getDevices();
        
        if (devices.length === 0) {
          throw new Error('No Spotify devices available. Please open Spotify on a device.');
        }
        
        // Find the first available device (preferably one that was recently active)
        const availableDevice = devices.find(device => device.is_active) || devices[0];
        
        // Transfer playback to the device
        const transferred = await transferPlayback(availableDevice.id);
        
        if (!transferred) {
          throw new Error('Failed to transfer playback to available device');
        }
        
        // Try adding to queue again after transfer
        await spotifyApi.addToQueue(`spotify:track:${trackId}`);
        console.log(`Successfully transferred playback to ${availableDevice.name} and added song to queue`);
      } else {
        // If it's a different error, rethrow it
        throw error;
      }
    }
    
    return {
      success: true,
      trackName,
      artistName
    };
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
  addSongToQueue,
  getDevices,
  transferPlayback
};
