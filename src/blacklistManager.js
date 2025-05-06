const fs = require('fs');
const path = require('path');

// Path to the blacklist file
const BLACKLIST_PATH = path.join(__dirname, '..', 'blacklist.txt');

/**
 * Get the list of blacklisted usernames
 * @returns {Array} Array of blacklisted usernames
 */
function getBlacklist() {
  try {
    if (fs.existsSync(BLACKLIST_PATH)) {
      const content = fs.readFileSync(BLACKLIST_PATH, 'utf8');
      // Split by comma and trim whitespace from each username
      return content.split(',')
        .map(username => username.trim())
        .filter(username => username.length > 0); // Filter out empty entries
    }
    return [];
  } catch (error) {
    console.error('Error reading blacklist:', error);
    return [];
  }
}

/**
 * Save the blacklist to file
 * @param {Array} blacklist - Array of usernames to blacklist
 * @returns {boolean} Whether the save was successful
 */
function saveBlacklist(blacklist) {
  try {
    // Join usernames with commas
    const content = blacklist.join(',');
    fs.writeFileSync(BLACKLIST_PATH, content);
    return true;
  } catch (error) {
    console.error('Error saving blacklist:', error);
    return false;
  }
}

/**
 * Check if a username is blacklisted
 * @param {string} username - The username to check
 * @returns {boolean} Whether the username is blacklisted
 */
function isBlacklisted(username) {
  const blacklist = getBlacklist();
  return blacklist.includes(username.toLowerCase());
}

// Create the blacklist file if it doesn't exist
function ensureBlacklistExists() {
  if (!fs.existsSync(BLACKLIST_PATH)) {
    try {
      fs.writeFileSync(BLACKLIST_PATH, '');
      console.log('Created empty blacklist file');
    } catch (error) {
      console.error('Error creating blacklist file:', error);
    }
  }
}

// Initialize the blacklist file
ensureBlacklistExists();

module.exports = {
  getBlacklist,
  saveBlacklist,
  isBlacklisted
};
