# Deploying to Railway

This guide explains how to deploy your Twitch Channel Points Spotify Request Bot to Railway.

## Important Considerations

Before deploying to Railway, please be aware of these limitations:

1. **Spotify Active Client Requirement**: Spotify's Web API can only add songs to the queue of an active Spotify client. This means your friend needs to have Spotify running on their device for the bot to work.

2. **Authentication Flow**: The bot requires Spotify authentication, but our implementation makes this easy with a web interface.

## Deployment Steps

### 1. Prepare Your Repository

Make sure your repository includes:
- All the code files
- `railway.json` (already added)
- `Procfile` (already added)

### 2. Set Up Railway Project

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

### 3. Update Redirect URI

In your Spotify Developer Dashboard, add your Railway app URL as a redirect URI:
- Format: `https://your-railway-app-name.up.railway.app/callback`

### 4. Deploy

1. Push your changes to GitHub
2. Railway will automatically deploy your application

### 5. Authentication

Once deployed, have your friend:

1. Visit your Railway app URL (e.g., `https://your-railway-app-name.up.railway.app`)
2. Click the "Connect with Spotify" button
3. Complete the Spotify authentication flow
4. The bot will automatically store the authentication tokens

That's it! No manual token copying needed. The bot will now be able to add songs to your friend's Spotify queue when viewers redeem channel points.

## Limitations and Workarounds

### Spotify Client Requirement

Since Railway is a cloud service, it doesn't have a Spotify client running. There are two potential workarounds:

1. **Use a Remote Spotify Client**: Use a service like [Spotify Connect](https://www.spotify.com/connect/) to control a remote Spotify client from your Railway app.

2. **Run Locally**: The more reliable approach is to run this bot locally on the computer where Spotify is running, rather than on Railway.

### Token Refresh

The bot will automatically refresh tokens, but in a cloud environment, you might need to periodically update the environment variables with new tokens if they expire.

## Conclusion

While it's technically possible to deploy this bot to Railway, the most reliable approach is to run it locally on the computer where Spotify is active. This ensures the bot can properly interact with the Spotify client to add songs to the queue.
