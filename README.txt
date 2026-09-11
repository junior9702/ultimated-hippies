HIPPIES PWA INSTALLATION

1. Upload this entire folder to a web host with HTTPS.
2. Open https://YOUR-DOMAIN/index.html in Chrome on Android.
3. Use the Install prompt, or Chrome menu -> Add to Home screen / Install app.
4. The portal then opens like an app.

IMPORTANT:
- A PWA cannot be installed reliably by opening index.html directly with file://.
- HTTPS is required for the service worker on normal production hosting (localhost is also allowed for development).
- Firebase and Jitsi continue to use their online services.
