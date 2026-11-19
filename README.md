# Y & L — Navy & Stars

Private real-time app for two people, plus a QR-only wedding photo page for guests.
Plain HTML + CSS + ES modules — **no build step**. Firebase (Auth + Firestore) for data, Cloudinary for media, Vercel for hosting.

```
index.html          couple app (login → menu → sections)
guest.html          what guests see after scanning the QR (wedding gallery only)
js/config.js        ← the ONLY file you edit (keys, the two emails, TURN)
firestore.rules     ← paste into Firebase (edit the 2 emails)
js/sections/*.js    wedding · today · story · games · calling · location · letters · music
```

## 1. Firebase (new project, free Spark plan)
1. console.firebase.google.com → **Add project**.
2. **Build → Authentication → Sign-in method**: enable **Email/Password** *and* **Anonymous** (anonymous = guests via QR).
3. **Authentication → Settings → Authorized domains**: add your Vercel domain (e.g. `my-app.vercel.app`). *Skip this and login fails once deployed.*
4. **Build → Firestore Database → Create database** (production mode, any region near you).
5. **Firestore → Rules**: paste `firestore.rules`, replace the two example emails with yours, **Publish**.
6. **Project settings → Your apps → Web (`</>`)** → copy `firebaseConfig` into `js/config.js`.

## 2. Cloudinary (free) for photos, videos, voice notes
1. cloudinary.com → sign up → copy your **Cloud name**.
2. **Settings → Upload → Upload presets → Add**: Signing mode **Unsigned**. Recommended: limit allowed formats (jpg, png, heic, webp, mp4, mov, webm, m4a, mp3) and set a max file size.
3. Put `cloudName` and `uploadPreset` into `js/config.js`.

## 3. The two accounts
In `js/config.js` set `members` (lowercase emails, same two as in `firestore.rules`). Open the site, tap **Create our account** once on each phone; afterwards just sign in. Anyone else is rejected both in the app and by Firestore rules.

## 4. Deploy to Vercel
Push this folder to GitHub and import it in Vercel (Framework: **Other**, no build command), or run `vercel` inside the folder. Then open `Wedding Pictures` in the app: it shows the **guest QR code** (download the print-size PNG).

## Calls
Works over Wi-Fi with the default STUN. Some mobile networks block direct connections; if a call stays on “Connecting…” add a free TURN server (e.g. Open Relay at metered.ca) to `iceServers` in `js/config.js`.
Camera/mic/location need **https** (Vercel provides it).

## Honest limits
- **Live location & call ringing work while the app is open** (foreground or recently backgrounded). Browsers pause web pages when closed/locked; true background tracking and ring-when-closed need a native app / FCM push server.
- Phone alerts for notifications also only appear while the app is open in the background.
- Deleting a post/picture removes it from the app; the file stays in Cloudinary until you delete it there.
- Snake: each phone runs its own snake (same seed, live scores) — it's a race, not a shared board.
- Our Story is ordered by date (no manual drag-reorder).
- Guests can upload without an account, so keep the Cloudinary preset restricted (formats + size) and watch your free quota.

## What was fixed vs. the old app
- **Login:** email is trimmed/lowercased, only Firebase checks the password, specific error messages, no custom password gate to desync.
- **Memory leaks:** every `onSnapshot`/camera/mic/GPS/timer is registered in a cleanup scope and released on every screen change and sign-out.
- **Smooth realtime:** lists update only the changed rows (videos and inputs never reset), photos are compressed before upload, stars canvas is capped at ≤140 stars / 30 fps and pauses in background tabs.
- **Calls:** ICE candidates are queued until ready, incoming calls ring on any screen, busy/declined/missed/failed all clean up properly, stale ghost calls are ignored.
- **Location:** throttled writes (moved >15 m or 60 s heartbeat), stops cleanly, Google Maps + directions buttons.
