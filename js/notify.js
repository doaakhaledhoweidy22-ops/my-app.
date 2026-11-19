// In-app notification to the partner (shows in their bell + browser alert if allowed).
import { db, collection, addDoc, serverTimestamp } from "./firebase.js";

export async function notifyPartner(ctx, text, route = "") {
  try {
    await addDoc(collection(db, "notifications"), {
      toEmail: ctx.partner.email, fromName: ctx.me.name, text, route, read: false, createdAt: serverTimestamp(),
    });
  } catch (e) { console.warn("notify failed", e); }
}
