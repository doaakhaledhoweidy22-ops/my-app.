// Live location sharing (app-level so it keeps running while you browse other sections).
// Writes are throttled: only when you moved >15 m or every 60 s as a heartbeat → light on battery & Firestore quota.
import { db, doc, setDoc, serverTimestamp } from "./firebase.js";
import { toast } from "./ui.js";

export const locEvents = new EventTarget();
let me = null, watchId = null, beat = null, last = null, lastWrite = 0, battery = null;

export const isSharing = () => watchId !== null;

const dist = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
export { dist as haversine };

async function write(extra = {}) {
  if (!me || !last) return;
  lastWrite = Date.now();
  try {
    await setDoc(doc(db, "locations", me.id), {
      name: me.name, lat: last.lat, lng: last.lng, acc: Math.round(last.acc || 0),
      speed: last.speed ?? null, heading: last.heading ?? null,
      battery: battery ? Math.round(battery.level * 100) : null, charging: battery ? battery.charging : null,
      sharing: true, ts: serverTimestamp(), ...extra,
    });
  } catch (e) { console.warn("location write", e); }
}

function onPos(p) {
  const cur = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading };
  const moved = !last || dist(last, cur) > 15;
  last = cur;
  if ((moved && Date.now() - lastWrite > 4000) || Date.now() - lastWrite > 60000) write();
}

function onErr(e) {
  const msg = e.code === 1 ? "Location permission denied — enable it in your browser/site settings."
    : e.code === 2 ? "Couldn't get a GPS fix right now." : "Location timed out — retrying…";
  if (e.code === 1) { stop(false); toast(msg, "error", 5000); } else console.warn(msg);
}

export function start() {
  if (watchId !== null || !me) return;
  if (!navigator.geolocation) return toast("This device doesn't support location.", "error");
  navigator.getBattery?.().then((b) => (battery = b)).catch(() => {});
  watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 });
  beat = setInterval(() => last && Date.now() - lastWrite > 60000 && write(), 20000);
  try { localStorage.setItem("loc:" + me.id, "1"); } catch {}
  locEvents.dispatchEvent(new Event("change"));
}

export function stop(persist = true) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; clearInterval(beat); beat = null;
  if (me) {
    if (persist) try { localStorage.setItem("loc:" + me.id, "0"); } catch {}
    setDoc(doc(db, "locations", me.id), { sharing: false, ts: serverTimestamp() }, { merge: true }).catch(() => {});
  }
  locEvents.dispatchEvent(new Event("change"));
}

export function setSharing(on) { on ? start() : stop(); }

export function initLocationShare(ctx) {
  me = ctx.me; last = null;
  let was = false; try { was = localStorage.getItem("loc:" + me.id) === "1"; } catch {}
  if (was) start();
}

export function disposeLocationShare() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId); watchId = null;
    // signed out while sharing: mark offline (the "on" preference is kept so it resumes next login)
    if (me) setDoc(doc(db, "locations", me.id), { sharing: false, ts: serverTimestamp() }, { merge: true }).catch(() => {});
  }
  clearInterval(beat); beat = null; me = null; last = null;
}
