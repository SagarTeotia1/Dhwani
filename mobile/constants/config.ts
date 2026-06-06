// Replace YOUR_LOCAL_IP before running dev build.
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
// Must be your machine's LAN IP — device cannot reach "localhost"
export const SERVER_URL = __DEV__
  ? 'ws://YOUR_LOCAL_IP:3000'
  : 'wss://your-app.railway.app'
