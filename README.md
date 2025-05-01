# Twitch Channel Points Spotify Request Bot

A Node.js application that allows Twitch viewers to request songs via channel point redemptions, which are automatically added to your Spotify queue.

## Features

- Listens for specific Twitch channel point redemptions
- Extracts song information from redemption messages
- Searches for songs on Spotify and adds them to your queue
- Supports Spotify URIs, URLs, or song name searches
- Simple web interface for authentication and status
- Can be deployed locally or to Railway cloud service

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
  - When asked which API/SDKs you plan to use, select "Web API"
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

## Testing Without Channel Points

You can test the bot without needing actual Twitch channel point redemptions using the included test scripts:

### Testing Spotify Authentication

To verify your Spotify authentication is working correctly:

```bash
node test-spotify.js
```

This will:
- Check if your Spotify authentication is working
- Show what's currently playing on your Spotify (if anything)
- Confirm that your Spotify integration is ready to use

### Testing Song Requests

To test adding a song to your queue without needing channel points:

```bash
node test-song-request.js "Song Name or Spotify URL"
```

Examples:
```bash
node test-song-request.js "Bohemian Rhapsody"
node test-song-request.js https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv
```

This will simulate a channel point redemption and add the requested song to your Spotify queue.

## Deployment Options

### Local Deployment

Running the bot locally is the simplest option:

1. Ensure Spotify is running on your device
2. Start the bot using `npm start`
3. The bot will listen for channel point redemptions and add songs to your queue

### Railway Deployment

You can also deploy the bot to [Railway](https://railway.app/) for 24/7 uptime:

1. Push your code to GitHub
2. Create a new project on Railway and connect your GitHub repository
3. Add your environment variables in Railway:
   - Spotify credentials
   - Twitch credentials
   - Channel name
4. Update your Spotify redirect URI in the Spotify Developer Dashboard:
   - Add: `https://your-railway-app-name.up.railway.app/callback`
5. Deploy the application

Once deployed, the streamer simply needs to:
1. Visit the deployed app URL
2. Click "Connect with Spotify"
3. Authenticate with their Spotify account

The bot will automatically store and refresh the authentication tokens. No manual token copying needed!

**Important**: Even when deployed to Railway, the streamer needs to have Spotify running on their device when they want song requests to work, as Spotify's API can only add songs to the queue of an active Spotify client.

For more detailed Railway deployment instructions, see the [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) file.

## Usage

1. Ensure Spotify is running on the streamer's device
2. Make sure the bot is running (either locally or on Railway)
3. Viewers can redeem the "Song Request" channel point reward and enter:
   - A Spotify URI (e.g., `spotify:track:4iV5W9uYEdYUVa79Axb7Rh`)
   - A Spotify URL (e.g., `https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`)
   - A song name (e.g., `Despacito`)
4. The bot will automatically add the requested song to the streamer's Spotify queue

## Troubleshooting

- **Authentication Issues**: If you encounter authentication issues, delete the `tokens.json` file and restart the bot.
- **Playback Issues**: Ensure Spotify is running on the device before starting the bot.
- **Twitch Connection Issues**: Verify your Twitch credentials and make sure your channel name is correct in the .env file.
- **Railway Deployment Issues**: Check the Railway logs for any errors. Make sure all environment variables are set correctly.

## How It Works

1. The bot listens for channel point redemptions on the specified Twitch channel
2. When a viewer redeems the "Song Request" reward, they include a song name or Spotify link in their message
3. The bot extracts the song information and searches for it on Spotify
4. If found, the song is added to the streamer's Spotify queue
5. Spotify must be running on the streamer's device for the queue to work

## License

ISC

## Acknowledgements

- [tmi.js](https://github.com/tmijs/tmi.js) - Twitch messaging interface
- [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node) - Spotify Web API wrapper for Node.js
- [express](https://expressjs.com/) - Web framework for Node.js
