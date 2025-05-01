const tmi = require('tmi.js');

const CHANNEL = process.env.TWITCH_CHANNEL;
const REDEMPTION_NAME = process.env.TWITCH_REDEMPTION_NAME || 'Song Request';

let spotifyClient = null;

/**
 * Initialize the Twitch bot
 * @param {Object} spotify - The initialized Spotify client
 */
async function initialize(spotify) {
  if (!CHANNEL) {
    throw new Error('TWITCH_CHANNEL environment variable is not set');
  }

  spotifyClient = spotify;

  // Create a new Twitch client
  const client = new tmi.Client({
    options: { debug: true },
    connection: {
      reconnect: true,
      secure: true
    },
    // For anonymous connection (no chat capabilities, but can listen for channel point redemptions)
    channels: [CHANNEL]
  });
  
  // Note: For full chat capabilities, you would need a proper OAuth token from
  // https://twitchapps.com/tmi/ and then use:
  // identity: {
  //   username: CHANNEL,
  //   password: 'oauth:your_oauth_token_here'
  // },

  // Connect to Twitch
  try {
    await client.connect();
    console.log(`Connected to Twitch channel: ${CHANNEL}`);
    
    // Set up event listeners
    setupEventListeners(client);
    
    return client;
  } catch (error) {
    console.error('Failed to connect to Twitch:', error);
    throw error;
  }
}

/**
 * Set up event listeners for the Twitch client
 * @param {Object} client - The Twitch client
 */
function setupEventListeners(client) {
  // Listen for redemption messages
  client.on('message', async (channel, tags, message, self) => {
    // Ignore messages from the bot itself
    if (self) return;

    // Check if this is a channel point redemption
    if (tags['custom-reward-id']) {
      console.log(`Channel point redemption detected: ${tags['custom-reward-id']}`);
      
      // Get the reward title from the tags
      const rewardTitle = tags['msg-param-displayName'] || 'Unknown Reward';
      
      // Check if this is a song request redemption
      if (rewardTitle.toLowerCase().includes(REDEMPTION_NAME.toLowerCase())) {
        await handleSongRequest(channel, tags.username, message);
      }
    }
  });

  // Listen for redemption events (alternative method)
  client.on('redeem', async (channel, username, rewardType, tags) => {
    console.log(`Redemption event: ${rewardType} by ${username}`);
    
    // Check if this is a song request redemption
    if (rewardType.toLowerCase().includes(REDEMPTION_NAME.toLowerCase())) {
      // The message is in tags['msg-param-message']
      const message = tags['msg-param-message'] || '';
      await handleSongRequest(channel, username, message);
    }
  });
}

/**
 * Handle a song request from a Twitch user
 * @param {string} channel - The Twitch channel
 * @param {string} username - The username of the requester
 * @param {string} message - The message containing the song request
 */
async function handleSongRequest(channel, username, message) {
  console.log(`Song request from ${username}: ${message}`);
  
  try {
    // Check if Spotify client is initialized
    if (!spotifyClient || !spotifyClient.isInitialized()) {
      throw new Error('Spotify client is not initialized');
    }
    
    // Process the song request
    const result = await spotifyClient.addSongToQueue(message);
    
    if (result.success) {
      console.log(`Added song "${result.trackName}" by ${result.artistName} to queue`);
      // Respond in chat
      // client.say(channel, `@${username} - Added "${result.trackName}" by ${result.artistName} to the queue!`);
    } else {
      console.error(`Failed to add song: ${result.error}`);
      // Respond in chat
      // client.say(channel, `@${username} - Sorry, I couldn't add your song: ${result.error}`);
    }
  } catch (error) {
    console.error('Error handling song request:', error);
    // client.say(channel, `@${username} - Sorry, there was an error processing your request.`);
  }
}

module.exports = {
  initialize
};
