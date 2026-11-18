// Single place that initialises Firebase. Everything else imports from here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  runTransaction, writeBatch, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).startsWith("YOUR_");

export let app = null, auth = null, db = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    // Offline cache = instant repeat loads; long-polling auto-detect = works on flaky mobile networks.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (e) {
    console.warn("Persistent cache unavailable, using memory cache", e);
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  }
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, signInAnonymously,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  runTransaction, writeBatch, increment,
};
