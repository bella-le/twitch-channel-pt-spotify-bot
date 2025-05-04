/**
 * Queue Manager - Maintains a shadow queue of songs added through the application
 * This helps overcome the limitation of Spotify's API not providing queue information
 */

const fs = require('fs');
const path = require('path');

// Path for storing the queue data
const QUEUE_DATA_PATH = process.env.QUEUE_DATA_PATH || path.join(__dirname, '..', 'queue-data.json');

// In-memory queue storage
let shadowQueue = [];
let currentlyPlaying = null;
let lastUpdated = null;

/**
 * Initialize the queue manager
 */
function initialize() {
  try {
    // Try to load existing queue data if available
    if (fs.existsSync(QUEUE_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_DATA_PATH, 'utf8'));
      shadowQueue = data.queue || [];
      currentlyPlaying = data.currentlyPlaying || null;
      lastUpdated = data.lastUpdated || new Date().toISOString();
      console.log('Loaded shadow queue data from file');
    } else {
      console.log('No existing shadow queue data found, starting fresh');
      shadowQueue = [];
      currentlyPlaying = null;
      lastUpdated = new Date().toISOString();
      saveQueueData();
    }
  } catch (error) {
    console.error('Error initializing queue manager:', error);
    shadowQueue = [];
    currentlyPlaying = null;
    lastUpdated = new Date().toISOString();
  }
}

/**
 * Save the current queue data to file
 */
function saveQueueData() {
  try {
    const data = {
      queue: shadowQueue,
      currentlyPlaying,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(QUEUE_DATA_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving queue data:', error);
  }
}

/**
 * Add a track to the shadow queue
 * @param {Object} track - Track information
 */
function addToQueue(track) {
  shadowQueue.push({
    ...track,
    addedAt: new Date().toISOString()
  });
  
  lastUpdated = new Date().toISOString();
  saveQueueData();
}

/**
 * Update the currently playing track
 * @param {Object} track - Currently playing track information
 */
function updateCurrentlyPlaying(spotifyData) {
  // If there's no track playing, just update and return
  if (!spotifyData || !spotifyData.item) {
    currentlyPlaying = null;
    lastUpdated = new Date().toISOString();
    saveQueueData();
    return;
  }
  
  const track = spotifyData.item;
  
  // If the track is the same as current, just update progress
  if (currentlyPlaying && currentlyPlaying.id === track.id) {
    currentlyPlaying = {
      ...currentlyPlaying,
      progress_ms: spotifyData.progress_ms,
      is_playing: spotifyData.is_playing
    };
    lastUpdated = new Date().toISOString();
    saveQueueData();
    return;
  }
  
  // New track is playing, update current and potentially remove from queue
  currentlyPlaying = {
    id: track.id,
    name: track.name,
    artists: track.artists.map(artist => artist.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    progress_ms: spotifyData.progress_ms,
    is_playing: spotifyData.is_playing,
    images: track.album.images,
    started_at: new Date().toISOString()
  };
  
  // Check if this track was in our shadow queue and remove it
  const trackIndex = shadowQueue.findIndex(item => item.trackId === track.id);
  if (trackIndex !== -1) {
    shadowQueue.splice(trackIndex, 1);
  }
  
  lastUpdated = new Date().toISOString();
  saveQueueData();
}

/**
 * Get the current shadow queue state
 * @returns {Object} The current queue state
 */
function getQueueState() {
  return {
    currentlyPlaying,
    queue: shadowQueue,
    lastUpdated
  };
}

/**
 * Clear the shadow queue
 */
function clearQueue() {
  shadowQueue = [];
  lastUpdated = new Date().toISOString();
  saveQueueData();
}

module.exports = {
  initialize,
  addToQueue,
  updateCurrentlyPlaying,
  getQueueState,
  clearQueue
};
