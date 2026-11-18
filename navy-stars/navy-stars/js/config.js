// ─────────────────────────────────────────────────────────────
//  CONFIG — the only file you must edit before deploying.
//  See README.md for the 10-minute setup.
// ─────────────────────────────────────────────────────────────

// 1) Firebase → Project settings → Your apps → Web app → "firebaseConfig"
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// 2) Cloudinary (free) → Settings → Upload → add an UNSIGNED upload preset
//    Used for photos, videos and voice notes (no paid Firebase Storage needed).
export const cloudinary = {
  cloudName: "YOUR_CLOUD_NAME",
  uploadPreset: "YOUR_UNSIGNED_PRESET",
  maxVideoMB: 100, // free Cloudinary plan limit per video
};

// 3) The two people who can sign in. Emails MUST be lowercase and must also be
//    copied into firestore.rules (see README). Index 0 = Player X / Player 1.
export const members = [
  { id: "yassin", name: "Yassin", email: "yassin@example.com", color: "#e4c9a0" }, // champagne gold
  { id: "lara",   name: "Lara",   email: "lara@example.com",   color: "#bcd0ff" }, // moonlight silver
];

export const siteTitle = "Y & L";
export const siteSubtitle = "Our Little World";
export const weddingTitle = "Yassin & Lara's Wedding";

// 4) WebRTC. STUN works on most Wi-Fi. For calls over mobile data (CGNAT) add a
//    free TURN server (e.g. Open Relay / Metered.ca) — see README "Calls".
export const iceServers = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  // { urls: "turn:YOUR_TURN_HOST:443?transport=tcp", username: "USER", credential: "PASS" },
];
