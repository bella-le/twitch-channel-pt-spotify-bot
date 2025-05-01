# Deploying to Railway

This guide explains how to deploy your Twitch Channel Points Spotify Request Bot to Railway.

## Important Considerations

Before deploying to Railway, please be aware of these limitations:

1. **Spotify Active Client Requirement**: Spotify's Web API can only add songs to the queue of an active Spotify client. This means someone needs to have Spotify running for the bot to work.

2. **Authentication Challenges**: The bot requires Spotify authentication, which typically needs a browser flow. For a cloud deployment, you'll need to handle this differently.

## Deployment Steps

### 1. Prepare Your Repository

Make sure your repository includes:
- All the code files
- `railway.json` (already added)
- `Procfile` (already added)

### 2. Initial Authentication

Before deploying, you need to authenticate with Spotify locally:

1. Run the bot locally: `npm start`
2. Complete the Spotify authentication flow
3. Find the generated `tokens.json` file in your project directory

### 3. Set Up Railway Project

1. Create a new project on [Railway](https://railway.app/)
2. Connect your GitHub repository
3. Add the following environment variables:
   - `SPOTIFY_CLIENT_ID` - Your Spotify client ID
   - `SPOTIFY_CLIENT_SECRET` - Your Spotify client secret
   - `TWITCH_CLIENT_ID` - Your Twitch client ID
   - `TWITCH_CLIENT_SECRET` - Your Twitch client secret
   - `TWITCH_CHANNEL` - The Twitch channel name
   - `TWITCH_REDEMPTION_NAME` - The name of the channel point redemption (default: "Song Request")
   - `PORT` - Set to `8888`
   
### 4. Add Spotify Tokens to Environment Variables

After authenticating locally, open the `tokens.json` file and add these values to your Railway environment variables:

1. `SPOTIFY_ACCESS_TOKEN` - The access token from tokens.json
2. `SPOTIFY_REFRESH_TOKEN` - The refresh token from tokens.json
3. `TOKEN_EXPIRES_AT` - The expiration timestamp from tokens.json

### 5. Update Redirect URI

In your Spotify Developer Dashboard, add your Railway app URL as a redirect URI:
- Format: `https://your-railway-app-name.up.railway.app/callback`

### 6. Deploy

1. Push your changes to GitHub
2. Railway will automatically deploy your application

## Limitations and Workarounds

### Spotify Client Requirement

Since Railway is a cloud service, it doesn't have a Spotify client running. There are two potential workarounds:

1. **Use a Remote Spotify Client**: Use a service like [Spotify Connect](https://www.spotify.com/connect/) to control a remote Spotify client from your Railway app.

2. **Run Locally**: The more reliable approach is to run this bot locally on the computer where Spotify is running, rather than on Railway.

### Token Refresh

The bot will automatically refresh tokens, but in a cloud environment, you might need to periodically update the environment variables with new tokens if they expire.

## Conclusion

While it's technically possible to deploy this bot to Railway, the most reliable approach is to run it locally on the computer where Spotify is active. This ensures the bot can properly interact with the Spotify client to add songs to the queue.
