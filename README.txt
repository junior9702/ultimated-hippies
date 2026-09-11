ULTIMADED HIPPIES — corrected full deployment package

Replace these root files in GitHub:
index.html
manifest.webmanifest
sw.js
icon-192.png
icon-512.png

License fix:
- Single Firebase license controller; duplicate developer controls removed.
- Default unlock is exactly 7 days from the unlock action.
- 30/90/180/365 days and custom expiry are supported.
- Firebase portalSettings/license is the shared source of truth.
- Active license no longer hides the member login screen.

PWA fix:
- UH logo icons, manifest, service worker, and install prompt.

Firebase note: Firestore rules must permit the intended operations on portalSettings/license and portalData/main.
