/**
 * Queue Store Module
 * 
 * Manages the local queue of song requests with the following features:
 * - Stores song requests in order with user information
 * - Allows checking if the current song matches the first in queue
 * - Automatically clears the queue at 8 AM Eastern Time daily
 */

// In-memory queue store
let songRequestQueue = [];

// Schedule for clearing the queue (8 AM Eastern Time)
let clearQueueTimeout = null;

/**
 * Add a song to the queue
 * @param {Object} songRequest - The song request object
 * @param {string} songRequest.trackId - Spotify track ID
 * @param {string} songRequest.trackName - Track name
 * @param {string} songRequest.artistName - Artist name
 * @param {string} songRequest.albumName - Album name (optional)
 * @param {string} songRequest.albumImage - Album image URL (optional)
 * @param {string} songRequest.requestedBy - Username of the requester
 * @returns {Object} The updated queue
 */
function addToQueue(songRequest) {
  // Ensure the song request has all required fields
  if (!songRequest.trackId || !songRequest.trackName || !songRequest.artistName || !songRequest.requestedBy) {
    throw new Error('Invalid song request: missing required fields');
  }

  // Add timestamp to the request
  songRequest.requestedAt = new Date().toISOString();
  
  // Add to queue
  songRequestQueue.push(songRequest);
  
  // Ensure the daily clear is scheduled
  scheduleDailyClear();
  
  return { queue: songRequestQueue };
}

/**
 * Get the current queue
 * @returns {Array} The current queue
 */
function getQueue() {
  return songRequestQueue;
}

/**
 * Check if the currently playing song matches the first item in the queue
 * If it does, remove it from the queue
 * @param {Object} currentlyPlaying - The currently playing track from Spotify API
 * @returns {boolean} Whether a match was found and removed
 */
function checkAndRemoveCurrentlyPlaying(currentlyPlaying) {
  // If queue is empty, nothing to do
  if (songRequestQueue.length === 0 || !currentlyPlaying || !currentlyPlaying.item) {
    return false;
  }
  
  // Get the first item in the queue
  const firstInQueue = songRequestQueue[0];
  
  // Check if the currently playing track matches the first in queue
  if (firstInQueue.trackId === currentlyPlaying.item.id) {
    // Remove the first item from the queue
    songRequestQueue.shift();
    return true;
  }
  
  return false;
}

/**
 * Clear the queue
 * @returns {Object} Empty queue
 */
function clearQueue() {
  songRequestQueue = [];
  return { queue: songRequestQueue };
}

/**
 * Schedule the daily queue clear at 8 AM Eastern Time
 */
function scheduleDailyClear() {
  // Clear any existing timeout
  if (clearQueueTimeout) {
    clearTimeout(clearQueueTimeout);
  }
  
  // Calculate time until next 8 AM Eastern Time
  const now = new Date();
  const targetTime = new Date(now);
  
  // Set to 8 AM ET (which is UTC-4 or UTC-5 depending on DST)
  // We'll use UTC-4 (EDT) for simplicity
  targetTime.setUTCHours(12); // 8 AM ET is 12 UTC during EDT
  targetTime.setUTCMinutes(0);
  targetTime.setUTCSeconds(0);
  targetTime.setUTCMilliseconds(0);
  
  // If it's already past 8 AM ET today, schedule for tomorrow
  if (now > targetTime) {
    targetTime.setUTCDate(targetTime.getUTCDate() + 1);
  }
  
  // Calculate milliseconds until target time
  const timeUntilClear = targetTime - now;
  
  // Schedule the clear
  clearQueueTimeout = setTimeout(() => {
    clearQueue();
    // Reschedule for the next day
    scheduleDailyClear();
  }, timeUntilClear);
  
  console.log(`Queue clear scheduled for ${targetTime.toLocaleString()} (in ${Math.floor(timeUntilClear / 60000)} minutes)`);
}

// Initialize the queue clear schedule when the module is loaded
scheduleDailyClear();

module.exports = {
  addToQueue,
  getQueue,
  checkAndRemoveCurrentlyPlaying,
  clearQueue
};
