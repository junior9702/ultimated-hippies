ULTIMADED HIPPIES — FINAL CORRECTED V6

Upload/replace these files in the GitHub repository root:
index.html
logo.png
icon-192.png
icon-512.png
manifest.webmanifest
sw.js
README.txt

This version fixes the Developer Access ReferenceError caused by
window.verifyDeveloperPin pointing to a function that did not exist.
It also includes a logo fallback to icon-512.png and a new service-worker
cache version.

After Netlify shows Published, open the Netlify Preview and press Ctrl+Shift+R.
