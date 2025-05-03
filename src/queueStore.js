/**
 * Queue store to track song requests and their positions
 */

// In-memory store for the queue
let queueData = {
  currentlyPlaying: null,
  queue: []
};

/**
 * Add a song to the queue
 * @param {Object} songData - The song data
 * @param {string} songData.username - The username of the requester
 * @param {string} songData.trackName - The name of the track
 * @param {string} songData.artistName - The name of the artist
 * @param {string} songData.trackId - The Spotify track ID
 * @param {Date} songData.requestedAt - When the song was requested
 * @returns {number} The position in the queue (1-based)
 */
function addSongToQueue(songData) {
  // Add the song to the queue
  queueData.queue.push(songData);
  
  // Return the position (1-based index)
  return queueData.queue.length;
}

/**
 * Update the currently playing song
 * @param {Object} songData - The song data
 */
function updateCurrentlyPlaying(songData) {
  queueData.currentlyPlaying = songData;
}

/**
 * Get the entire queue data
 * @returns {Object} The queue data
 */
function getQueueData() {
  return queueData;
}

/**
 * Clear the queue data
 */
function clearQueue() {
  queueData = {
    currentlyPlaying: null,
    queue: []
  };
}

module.exports = {
  addSongToQueue,
  updateCurrentlyPlaying,
  getQueueData,
  clearQueue
};
