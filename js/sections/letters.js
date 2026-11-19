// Letters — text or voice notes. MediaRecorder with cross-device MIME fallbacks; mic is always released.
import { db, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "../firebase.js";
import { h, toast, timeAgo, ms, mediaEl, avatar, memberById, applyChanges, section, field, fmtDuration } from "../ui.js";
import { uploadFile } from "../upload.js";
import { notifyPartner } from "../notify.js";

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/aac"];
const pickMime = () => (window.MediaRecorder ? MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || "" : "");

export function mount(root, ctx) {
  const col = collection(db, "letters");
  let mode = "text", rec = null, stream = null, chunks = [], blob = null, blobUrl = null, timer = null, secs = 0, busy = false;

  const text = h("textarea", { rows: 4, maxLength: 3000, placeholder: `Dear ${ctx.partner.name}…` });
  const tText = h("button", { class: "pill on", onclick: () => setMode("text") }, "Text message 💬");
  const tVoice = h("button", { class: "pill", onclick: () => setMode("voice") }, "Voice note 🎙️");
  const timerEl = h("span", { class: "muted" }, "00:00");
  const bRec = h("button", { class: "btn", onclick: startRec }, "🔴 Record");
  const bStop = h("button", { class: "btn", hidden: true, onclick: stopRec }, "⏹ Stop");
  const player = h("audio", { controls: true, hidden: true, class: "audio" });
  const textBox = field("Your message", text);
  const voiceBox = h("div", { class: "stack", hidden: true }, h("div", { class: "row" }, bRec, bStop, timerEl), player);
  const bar = h("div", { class: "bar", hidden: true }, h("i"));
  const send = h("button", { class: "btn primary", onclick: sendLetter }, "Send letter 💌");
  const list = h("div", { class: "stack" });
  const empty = h("div", { class: "empty" }, "No letters yet — write the first one 💌");

  root.append(
    section("✍️ Send today's letter", null,
      h("div", { class: "stack", style: { marginTop: "10px" } }, h("div", { class: "pills" }, tText, tVoice), textBox, voiceBox, bar, send)),
    h("h3", { class: "card-title", style: { margin: "6px 0 10px" } }, "Letters received & sent"), list, empty);

  function setMode(m) {
    mode = m; tText.classList.toggle("on", m === "text"); tVoice.classList.toggle("on", m === "voice");
    textBox.hidden = m !== "text"; voiceBox.hidden = m !== "voice";
  }

  function releaseMic() { stream?.getTracks().forEach((t) => t.stop()); stream = null; clearInterval(timer); timer = null; }

  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Voice notes aren't supported on this browser.", "error");
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return toast("Allow microphone access to record.", "error"); }
    const mime = pickMime();
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch { releaseMic(); return toast("Couldn't start recording on this device.", "error"); }
    chunks = []; blob = null; player.hidden = true;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mime || "audio/webm";
      blob = new Blob(chunks, { type }); releaseMic();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob); player.src = blobUrl; player.hidden = false;
      bRec.hidden = false; bStop.hidden = true; bRec.textContent = "🔴 Re-record";
    };
    rec.start(); secs = 0; timerEl.textContent = "00:00"; bRec.hidden = true; bStop.hidden = false;
    timer = setInterval(() => { secs++; timerEl.textContent = fmtDuration(secs); if (secs >= 180) stopRec(); }, 1000); // 3 min cap
  }
  function stopRec() { if (rec && rec.state !== "inactive") rec.stop(); clearInterval(timer); }

  async function sendLetter() {
    if (busy) return;
    const data = { from: ctx.me.id, to: ctx.partner.id, createdAt: serverTimestamp() };
    if (mode === "text") {
      if (!text.value.trim()) return toast("Write something first 💌");
      Object.assign(data, { type: "text", text: text.value.trim() });
    } else {
      if (!blob) return toast("Record a voice note first 🎙️");
      Object.assign(data, { type: "voice" });
    }
    busy = true; send.disabled = true; send.textContent = "Sending…";
    try {
      if (mode === "voice") {
        const ext = /mp4|aac/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
        bar.hidden = false;
        const up = await uploadFile(new File([blob], `letter.${ext}`, { type: blob.type }), { folder: "letters", onProgress: (p) => (bar.firstChild.style.width = p * 100 + "%") });
        data.url = up.url;
      }
      await addDoc(col, data);
      notifyPartner(ctx, mode === "voice" ? "sent you a voice note 🎙️" : "sent you a letter 💌", "#/letters");
      text.value = ""; blob = null; player.hidden = true; bRec.textContent = "🔴 Record"; toast("Letter sent 💌", "ok");
    } catch (e) { toast(e.message || "Couldn't send.", "error", 5000); }
    finally { busy = false; send.disabled = false; send.textContent = "Send letter 💌"; bar.hidden = true; bar.firstChild.style.width = "0"; }
  }

  const render = (l) => h("article", { class: "card" },
    h("div", { class: "post-head" }, avatar(l.from),
      h("div", {}, h("b", {}, `${memberById(l.from).name} → ${memberById(l.to).name}`), h("small", {}, timeAgo(ms(l.createdAt))))),
    l.type === "voice" && l.url ? mediaEl(l.url, "audio") : h("p", { style: { margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--serif)", fontSize: "1.25rem" } }, l.text));

  const unsub = onSnapshot(query(col, orderBy("createdAt", "desc"), limit(50)),
    (snap) => applyChanges(snap, list, render, empty), (e) => toast("Couldn't load letters: " + e.code, "error"));

  return () => { unsub(); try { if (rec) { rec.onstop = null; if (rec.state !== "inactive") rec.stop(); } } catch {} releaseMic(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
}
