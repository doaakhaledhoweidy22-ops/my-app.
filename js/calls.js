// 1-to-1 WebRTC audio/video calling with Firestore signalling.
//  • incoming-call listener is app-level → the phone "rings" on ANY screen
//  • ICE candidates are queued until the remote description exists (the classic cause of silent/failed calls)
//  • every path (hang up, decline, miss, failure, sign-out) funnels through finish() → tracks stopped, listeners removed
import {
  db, collection, doc, setDoc, addDoc, updateDoc, getDocs, deleteDoc, onSnapshot, query, where, serverTimestamp,
} from "./firebase.js";
import { iceServers } from "./config.js";
import { h, toast, ms, fmtDuration, avatar } from "./ui.js";
import { notifyPartner } from "./notify.js";

let ctx = null, unsubIncoming = null, call = null, ui = null;

export function initCalls(c) {
  ctx = c;
  buildUi();
  unsubIncoming = onSnapshot(
    query(collection(db, "calls"), where("toEmail", "==", ctx.me.email), where("state", "==", "ringing")),
    (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type === "added") onIncoming(ch.doc.id, ch.doc.data({ serverTimestamps: "estimate" }));
        // caller hung up / timed out while we were still ringing
        if (ch.type === "removed" && call?.role === "callee" && call.id === ch.doc.id && call.state === "ringing" && !call.accepting) finish("Missed call");
      }
    },
    (e) => console.warn("calls listener", e),
  );
}

export function disposeCalls() {
  unsubIncoming?.(); unsubIncoming = null;
  if (call?.ref) updateDoc(call.ref, { state: "ended" }).catch(() => {});
  finish();
  ui?.root.remove(); ui = null; ctx = null;
}

/* ───────────── UI ───────────── */
function buildUi() {
  const remoteV = h("video", { id: "remoteV", autoplay: true, playsInline: true });
  const localV = h("video", { id: "localV", autoplay: true, playsInline: true, muted: true });
  const name = h("h2"), sub = h("p", { class: "muted" }), av = h("div");
  const info = h("div", { class: "call-info" }, av, name, sub);
  const bMute = h("button", { class: "cbtn", title: "Mute", onclick: () => toggle("audio") }, "🎙️");
  const bCam = h("button", { class: "cbtn", title: "Camera", onclick: () => toggle("video") }, "📷");
  const bEnd = h("button", { class: "cbtn end", title: "Hang up", onclick: hangup }, "📵");
  const bYes = h("button", { class: "cbtn yes", title: "Accept", onclick: accept }, "📞");
  const bNo = h("button", { class: "cbtn no", title: "Decline", onclick: decline }, "✕");
  const bar = h("div", { class: "call-bar" });
  const root = h("div", { id: "callOverlay", hidden: true }, remoteV, localV, info, bar);
  document.body.append(root);
  ui = { root, remoteV, localV, name, sub, av, bar, bMute, bCam, bEnd, bYes, bNo, info };
}

function show(mode, kind, otherId) {
  const other = ctx.partner;
  ui.root.hidden = false;
  ui.av.replaceChildren(avatar(other.id)); ui.name.textContent = other.name;
  const video = kind === "video";
  // visibility (not display:none) so audio-only calls still play remote audio on iOS
  ui.localV.hidden = !(video && mode === "live"); ui.remoteV.style.visibility = video && mode === "live" ? "visible" : "hidden";
  ui.info.style.display = video && mode === "live" ? "none" : "block";
  ui.bCam.hidden = !video;
  if (mode === "incoming") { ui.sub.textContent = `Incoming ${video ? "video" : "voice"} call…`; ui.bar.replaceChildren(ui.bNo, ui.bYes); }
  else if (mode === "calling") { ui.sub.textContent = "Ringing…"; ui.bar.replaceChildren(ui.bEnd); }
  else if (mode === "live") { ui.bar.replaceChildren(ui.bMute, ...(video ? [ui.bCam] : []), ui.bEnd); }
}

/* ───────────── helpers ───────────── */
async function getMedia(kind) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls need a secure (https) page.");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: kind === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
  } catch (e) {
    throw new Error(e.name === "NotAllowedError" ? "Allow microphone/camera access to make calls." : "Couldn't open the microphone/camera.");
  }
}

function newCall(base) {
  call = { cands: [], unsubs: [], timers: [], state: "ringing", ...base };
  const pc = new RTCPeerConnection({ iceServers });
  call.pc = pc;
  call.remote = new MediaStream();
  ui.remoteV.srcObject = call.remote;
  pc.ontrack = (e) => { e.streams[0]?.getTracks().forEach((t) => call.remote.addTrack(t)); if (!e.streams[0]) call.remote.addTrack(e.track); ui.remoteV.play?.().catch(() => {}); };
  pc.onconnectionstatechange = () => {
    if (!call) return;
    const s = pc.connectionState;
    if (s === "connected") goLive();
    else if (s === "failed") { hangup(); toast("Call failed — try again (a TURN server may be needed, see README).", "error", 6000); }
    else if (s === "disconnected") call.timers.push(setTimeout(() => call && pc.connectionState !== "connected" && hangup(), 10000));
  };
  return pc;
}

function addLocal(stream) {
  call.local = stream;
  stream.getTracks().forEach((t) => call.pc.addTrack(t, stream));
  ui.localV.srcObject = stream;
}

function flush() {
  if (!call?.pc.remoteDescription) return;
  for (const c of call.cands.splice(0)) call.pc.addIceCandidate(c).catch(() => {});
}

function listenCandidates(ref, sub) {
  call.unsubs.push(onSnapshot(collection(ref, sub), (snap) => {
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { call?.cands.push(ch.doc.data()); flush(); } });
  }));
}

function goLive() {
  if (!call || call.state === "live") return;
  call.state = "live"; call.timers.forEach(clearTimeout); call.timers = [];
  show("live", call.kind);
  let sec = 0; ui.sub.textContent = "00:00";
  call.tick = setInterval(() => { sec++; ui.sub.textContent = fmtDuration(sec); }, 1000);
}

function toggle(kind) {
  const tracks = kind === "audio" ? call?.local?.getAudioTracks() : call?.local?.getVideoTracks();
  if (!tracks?.length) return;
  const on = !tracks[0].enabled; tracks.forEach((t) => (t.enabled = on));
  (kind === "audio" ? ui.bMute : ui.bCam).classList.toggle("off", !on);
}

// The one and only teardown path.
function finish(msg) {
  if (!call) { ui && (ui.root.hidden = true); return; }
  const c = call; call = null;
  c.unsubs.forEach((u) => { try { u(); } catch {} });
  c.timers.forEach(clearTimeout); clearInterval(c.tick);
  c.local?.getTracks().forEach((t) => t.stop());
  try { c.pc.onconnectionstatechange = null; c.pc.ontrack = null; c.pc.onicecandidate = null; c.pc.close(); } catch {}
  if (ui) { ui.root.hidden = true; ui.remoteV.srcObject = null; ui.localV.srcObject = null; ui.bMute.classList.remove("off"); ui.bCam.classList.remove("off"); }
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(0);
  if (msg) toast(msg);
  if (c.role === "caller" && c.ref) cleanupCandidates(c.ref);
}

async function cleanupCandidates(ref) {
  try {
    for (const sub of ["callerCandidates", "calleeCandidates"]) {
      const s = await getDocs(collection(ref, sub));
      await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
    }
  } catch {}
}

/* ───────────── caller ───────────── */
export async function startCall(kind = "audio") {
  if (call) return toast("You're already in a call.");
  let stream;
  try { stream = await getMedia(kind); } catch (e) { return toast(e.message, "error", 5000); }
  const ref = doc(collection(db, "calls"));
  const pc = newCall({ id: ref.id, ref, role: "caller", kind });
  addLocal(stream);
  show("calling", kind);
  try {
    pc.onicecandidate = (e) => e.candidate && addDoc(collection(ref, "callerCandidates"), e.candidate.toJSON()).catch(() => {});
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(ref, {
      fromEmail: ctx.me.email, fromName: ctx.me.name, toEmail: ctx.partner.email, toName: ctx.partner.name,
      participants: [ctx.me.email, ctx.partner.email], kind, state: "ringing",
      offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp(),
    });
  } catch (e) { console.error(e); finish(); return toast("Couldn't start the call.", "error"); }

  call.unsubs.push(onSnapshot(ref, (snap) => {
    const d = snap.data(); if (!d || !call) return;
    if (d.answer && call.pc.signalingState === "have-local-offer") call.pc.setRemoteDescription(d.answer).then(flush).catch(console.warn);
    if (d.state === "declined") finish(d.reason === "busy" ? `${ctx.partner.name} is on another call.` : `${ctx.partner.name} declined.`);
    else if (d.state === "ended" || d.state === "missed") finish("Call ended.");
  }));
  listenCandidates(ref, "calleeCandidates");
  call.timers.push(setTimeout(() => {
    if (call?.state === "ringing") {
      updateDoc(ref, { state: "missed" }).catch(() => {});
      notifyPartner(ctx, `Missed ${kind === "video" ? "video" : "voice"} call from ${ctx.me.name}`, "#/calling");
      finish(`${ctx.partner.name} didn't answer.`);
    }
  }, 45000));
}

/* ───────────── callee ───────────── */
function onIncoming(id, d) {
  if (Date.now() - ms(d.createdAt) > 120000) return; // stale ghost
  if (call) { updateDoc(doc(db, "calls", id), { state: "declined", reason: "busy" }).catch(() => {}); return; }
  const ref = doc(db, "calls", id);
  newCall({ id, ref, role: "callee", kind: d.kind, offer: d.offer });
  call.state = "ringing";
  show("incoming", d.kind);
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([400, 200, 400, 200, 400]);
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    try { new Notification(`${d.fromName} is calling`, { body: `Incoming ${d.kind} call`, icon: "icon.svg" }); } catch {}
  }
  call.unsubs.push(onSnapshot(ref, (snap) => {
    const x = snap.data(); if (!x || !call) return;
    if (x.state === "ended" || x.state === "missed") finish("Call ended.");
  }));
}

async function accept() {
  if (!call || call.role !== "callee" || call.accepting) return;
  call.accepting = true; call.state = "connecting";
  ui.sub.textContent = "Connecting…"; ui.bar.replaceChildren(ui.bEnd);
  const { ref, kind, offer } = call;
  let stream;
  try { stream = await getMedia(kind); }
  catch (e) { toast(e.message, "error", 5000); updateDoc(ref, { state: "declined" }).catch(() => {}); return finish(); }
  if (!call) { stream.getTracks().forEach((t) => t.stop()); return; }
  try {
    const pc = call.pc;
    addLocal(stream);
    pc.onicecandidate = (e) => e.candidate && addDoc(collection(ref, "calleeCandidates"), e.candidate.toJSON()).catch(() => {});
    await pc.setRemoteDescription(offer);
    listenCandidates(ref, "callerCandidates");
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(ref, { state: "active", answer: { type: answer.type, sdp: answer.sdp } });
    navigator.vibrate?.(0);
    // keep watching for the caller hanging up (state goes "active" → "ended")
    call.unsubs.push(onSnapshot(ref, (snap) => { const x = snap.data(); if (x?.state === "ended") finish("Call ended."); }));
    flush();
  } catch (e) { console.error(e); finish(); toast("Couldn't connect the call.", "error"); }
}

function decline() { if (call?.ref) updateDoc(call.ref, { state: "declined" }).catch(() => {}); finish(); }
function hangup() { if (call?.ref) updateDoc(call.ref, { state: "ended" }).catch(() => {}); finish(); }
