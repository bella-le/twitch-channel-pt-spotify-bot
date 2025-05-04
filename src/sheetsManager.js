/**
 * Google Sheets integration for tracking song requests
 */
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Spreadsheet ID from the URL
let SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// Google service account credentials
let GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

// Sheet names
const SONG_LEADERBOARD_SHEET_NAME = 'Song Leaderboard';
const USER_LEADERBOARD_SHEET_NAME = 'User Leaderboard';

// Spreadsheet document
let doc = null;
let initialized = false;

// Sheet references
let songLeaderboardSheet = null;
let userLeaderboardSheet = null;

// Cache for song and user stats
const songStats = {};  // trackId -> play count
const userStats = {};  // username -> request count

/**
 * Initialize the Google Sheets integration
 * @returns {Promise<boolean>} Whether initialization was successful
 */
async function initialize() {
  if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('Google Sheets credentials not set in environment variables');
    return false;
  }

  try {
    // Initialize auth with JWT
    const serviceAccountAuth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Create a new document with the auth
    doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

    // Load the document properties and sheets
    await doc.loadInfo();
    console.log(`Loaded document: ${doc.title}`);

    // Get or create the necessary sheets
    await setupSheets();

    // Load existing data into memory
    await loadExistingData();

    initialized = true;
    return true;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error);
    return false;
  }
}

/**
 * Set up the necessary sheets in the spreadsheet
 */
async function setupSheets() {
  // Check if the song leaderboard sheet exists, create it if not
  songLeaderboardSheet = doc.sheetsByTitle[SONG_LEADERBOARD_SHEET_NAME];
  if (!songLeaderboardSheet) {
    songLeaderboardSheet = await doc.addSheet({
      title: SONG_LEADERBOARD_SHEET_NAME,
      headerValues: ['Song', 'Artist', 'Play Count', 'Last Played', 'Track ID', 'Last Queued By']
    });
    console.log(`Created ${SONG_LEADERBOARD_SHEET_NAME} sheet`);
  } else {
    // Ensure the sheet has headers
    try {
      // Try to load the header row
      await songLeaderboardSheet.loadHeaderRow();
      console.log(`Loaded headers for ${SONG_LEADERBOARD_SHEET_NAME} sheet`);
    } catch (error) {
      // If there's an error, set the header row
      await songLeaderboardSheet.setHeaderRow(['Song', 'Artist', 'Play Count', 'Last Played', 'Track ID', 'Last Queued By']);
      console.log(`Set headers for ${SONG_LEADERBOARD_SHEET_NAME} sheet`);
    }
  }

  // Check if the user leaderboard sheet exists, create it if not
  userLeaderboardSheet = doc.sheetsByTitle[USER_LEADERBOARD_SHEET_NAME];
  if (!userLeaderboardSheet) {
    userLeaderboardSheet = await doc.addSheet({
      title: USER_LEADERBOARD_SHEET_NAME,
      headerValues: ['Username', 'Songs Requested', 'Last Request']
    });
    console.log(`Created ${USER_LEADERBOARD_SHEET_NAME} sheet`);
  } else {
    // Ensure the sheet has headers
    try {
      // Try to load the header row
      await userLeaderboardSheet.loadHeaderRow();
      console.log(`Loaded headers for ${USER_LEADERBOARD_SHEET_NAME} sheet`);
    } catch (error) {
      // If there's an error, set the header row
      await userLeaderboardSheet.setHeaderRow(['Username', 'Songs Requested', 'Last Request']);
      console.log(`Set headers for ${USER_LEADERBOARD_SHEET_NAME} sheet`);
    }
  }
}

/**
 * Load existing data from the spreadsheet into memory
 */
async function loadExistingData() {
  try {
    // Force reload the header rows to ensure proper column mapping
    await songLeaderboardSheet.loadHeaderRow();
    await userLeaderboardSheet.loadHeaderRow();
    
    // Load song leaderboard data
    await songLeaderboardSheet.loadCells();
    const songRows = await songLeaderboardSheet.getRows();
    
    console.log('Loading song data from spreadsheet...');
    for (let i = 0; i < songRows.length; i++) {
      
      // Access by index based on the header order: [Song, Artist, Play Count, Last Played, Track ID]
      const trackId = songRows[i]._rawData[4]; // Track ID is the 5th column (index 4)
      const playCount = parseInt(songRows[i]._rawData[2], 10) || 0; // Play Count is the 3rd column (index 2)
      
      if (trackId) {
        songStats[trackId] = playCount;
      }
    }

    // Load user leaderboard data
    await userLeaderboardSheet.loadCells();
    const userRows = await userLeaderboardSheet.getRows();
    
    console.log('Loading user data from spreadsheet...');
    for (let i = 0; i < userRows.length; i++) {
      // Access by index based on the header order: [Username, Songs Requested, Last Request]
      const username = userRows[i]._rawData[0]; // Username is the 1st column (index 0)
      const requestCount = parseInt(userRows[i]._rawData[1], 10) || 0; // Songs Requested is the 2nd column (index 1)
      
      if (username) {
        userStats[username] = requestCount;
      }
    }

    console.log(`Loaded ${Object.keys(songStats).length} songs and ${Object.keys(userStats).length} users from leaderboards`);
  } catch (error) {
    console.error('Error loading existing data:', error);
  }
}

/**
 * Update the song leaderboard
 * @param {Object} songData - The song data
 * @param {string} username - The username of the requester
 * @returns {Promise<boolean>} Whether the update was successful
 */
async function updateSongLeaderboard(songData, username = 'Unknown') {
  if (!initialized || !songData || !songData.trackId) {
    console.error('Invalid song data or sheets not initialized');
    return false;
  }

  try {
    console.log(`Updating song leaderboard for track: ${songData.trackId} - ${songData.trackName}`);
    
    // Force reload the header row to ensure proper column mapping
    await songLeaderboardSheet.loadHeaderRow();
    
    // Get the current leaderboard
    await songLeaderboardSheet.loadCells();
    const rows = await songLeaderboardSheet.getRows();
    
    // Check if the song is already in the leaderboard by exact track ID match
    let existingRow = null;
    let existingRowIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
      // Access the Track ID directly from raw data (5th column, index 4)
      const rowTrackId = rows[i]._rawData[4];
      
      // Debug logging to see what's happening
      console.log(`Checking row ${i}: Track ID '${rowTrackId}' vs '${songData.trackId}'`);
      
      if (rowTrackId && rowTrackId.trim() === songData.trackId.trim()) {
        existingRow = rows[i];
        existingRowIndex = i;
        console.log(`Found existing song at row ${i}`);
        break;
      }
    }
    
    if (existingRow) {
      // Update the existing row
      // Get current play count from raw data (3rd column, index 2)
      const currentCount = parseInt(existingRow._rawData[2], 10) || 0;
      const newCount = currentCount + 1;
      
      // Update the song stats in memory
      songStats[songData.trackId] = newCount;
      
      // Update the play count, last played date, and last queued by
      // We need to set the values directly since the column access by name isn't working
      existingRow._rawData[2] = newCount.toString(); // Play Count (3rd column, index 2)
      existingRow._rawData[3] = new Date().toLocaleString(); // Last Played (4th column, index 3)
      existingRow._rawData[5] = username; // Last Queued By (6th column, index 5)
      
      await existingRow.save();
      console.log(`Updated existing song "${songData.trackName}" in leaderboard, play count: ${newCount}`);
    } else {
      // Song not found, add it as a new row
      // Initialize song stats in memory
      songStats[songData.trackId] = 1;
      
      // Create a new row with the correct header order
      const newRow = {
        'Song': songData.trackName,
        'Artist': songData.artistName,
        'Play Count': 1,
        'Last Played': new Date().toLocaleString(),
        'Track ID': songData.trackId,
        'Last Queued By': username
      };
      
      await songLeaderboardSheet.addRow(newRow);
      console.log(`Added new song "${songData.trackName}" to leaderboard`);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating song leaderboard:', error);
    return false;
  }
}

/**
 * Update the user leaderboard
 * @param {string} username - The username
 * @param {string} lastRequestDate - The date of the last request
 * @returns {Promise<boolean>} Whether the update was successful
 */
async function updateUserLeaderboard(username, lastRequestDate) {
  if (!initialized || !username) {
    console.error('Invalid username or sheets not initialized');
    return false;
  }

  try {
    console.log(`Updating user leaderboard for username: ${username}`);
    
    // Force reload the header row to ensure proper column mapping
    await userLeaderboardSheet.loadHeaderRow();
    
    // Get the current leaderboard
    await userLeaderboardSheet.loadCells();
    const rows = await userLeaderboardSheet.getRows();
    
    // Check if the user is already in the leaderboard by exact username match
    let existingRow = null;
    let existingRowIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
      // Access the Username directly from raw data (1st column, index 0)
      const rowUsername = rows[i]._rawData[0];
      
      // Debug logging to see what's happening
      console.log(`Checking row ${i}: Username '${rowUsername}' vs '${username}'`);
      
      if (rowUsername && rowUsername.trim().toLowerCase() === username.trim().toLowerCase()) {
        existingRow = rows[i];
        existingRowIndex = i;
        console.log(`Found existing user at row ${i}`);
        break;
      }
    }
    
    if (existingRow) {
      // Update the existing row
      // Get current request count from raw data (2nd column, index 1)
      const currentCount = parseInt(existingRow._rawData[1], 10) || 0;
      const newCount = currentCount + 1;
      
      // Update the user stats in memory
      userStats[username] = newCount;
      
      // Update the request count and last request date
      // We need to set the values directly since the column access by name isn't working
      existingRow._rawData[1] = newCount.toString(); // Songs Requested (2nd column, index 1)
      existingRow._rawData[2] = lastRequestDate; // Last Request (3rd column, index 2)
      
      await existingRow.save();
      console.log(`Updated user ${username} in leaderboard, request count: ${newCount}`);
    } else {
      // User not found, add them as a new row
      // Initialize user stats in memory
      userStats[username] = 1;
      
      // Create a new row with the correct header order
      const newRow = {
        'Username': username,
        'Songs Requested': 1,
        'Last Request': lastRequestDate
      };
      
      await userLeaderboardSheet.addRow(newRow);
      console.log(`Added new user ${username} to leaderboard`);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user leaderboard:', error);
    return false;
  }
}

/**
 * Check if the Google Sheets integration is initialized
 * @returns {boolean} Whether the integration is initialized
 */
function isInitialized() {
  return initialized;
}

module.exports = {
  initialize,
  updateSongLeaderboard,
  updateUserLeaderboard,
  isInitialized
};
