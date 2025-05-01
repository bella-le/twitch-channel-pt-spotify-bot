# Twitch Channel Points Spotify Request Bot

A Node.js application that allows Twitch viewers to request songs via channel point redemptions, which are automatically added to your Spotify queue.

## Features

- Listens for specific Twitch channel point redemptions
- Extracts song information from redemption messages
- Searches for songs on Spotify and adds them to your queue
- Supports Spotify URIs, URLs, or song name searches
- Simple web interface for authentication and status

## Prerequisites

- Node.js (v14 or higher)
- A Twitch account with channel point rewards enabled
- A Spotify Premium account
- Twitch Developer Application
- Spotify Developer Application

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/song-request-bot.git
cd song-request-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create Twitch and Spotify Developer Applications

- **Twitch Application**:
  - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
  - Create a new application
  - Set the OAuth Redirect URL to `http://127.0.0.1:8888/callback`
  - Note your Client ID and Client Secret

- **Spotify Application**:
  - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
  - Create a new application
  - Set the Redirect URI to `http://127.0.0.1:8888/callback`
  - Note your Client ID and Client Secret

### 4. Configure Environment Variables

Create a `.env` file in the root directory with the following content:

```
# Twitch Configuration
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_CHANNEL=your_twitch_channel_name
TWITCH_REDEMPTION_NAME=Song Request

# Spotify Configuration
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback

# Server Configuration
PORT=8888
```

Replace the placeholder values with your actual credentials.

### 5. Set Up Twitch Channel Point Reward

1. Go to your Twitch Creator Dashboard
2. Navigate to Viewer Rewards > Channel Points > Manage Rewards & Challenges
3. Create a new custom reward named "Song Request" (or whatever you specified in your .env file)
4. Make sure to enable the "Require viewer to enter text" option
5. Set an appropriate cost for the redemption

### 6. Start the Bot

```bash
npm start
```

The first time you run the bot, you'll need to authenticate with Spotify. The application will provide a URL to visit in your browser. After authenticating, you'll be redirected back to the application, and the bot will be ready to use.

## Usage

1. Ensure Spotify is running on your device
2. Start the bot using `npm start`
3. Viewers can redeem the "Song Request" channel point reward and enter:
   - A Spotify URI (e.g., `spotify:track:4iV5W9uYEdYUVa79Axb7Rh`)
   - A Spotify URL (e.g., `https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`)
   - A song name (e.g., `Despacito`)
4. The bot will automatically add the requested song to your Spotify queue

## Troubleshooting

- **Authentication Issues**: If you encounter authentication issues, delete the `tokens.json` file and restart the bot.
- **Playback Issues**: Ensure Spotify is running on your device before starting the bot.
- **Twitch Connection Issues**: Verify your Twitch credentials and make sure your channel name is correct in the .env file.

## License

ISC

## Acknowledgements

- [tmi.js](https://github.com/tmijs/tmi.js) - Twitch messaging interface
- [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node) - Spotify Web API wrapper for Node.js
