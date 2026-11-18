// Guest page (reached by scanning the QR code). Sees ONLY the wedding gallery — no other section exists here.
// Guests sign in anonymously (no account, no password); Firestore rules only let them read/create in `wedding`.
import {
  configured, auth, db, onAuthStateChanged, signInAnonymously, collection, onSnapshot, query, orderBy, limit,
} from "./firebase.js";
import { startStars } from "./stars.js";
import { $, h, toast, applyChanges, lightbox } from "./ui.js";
import { thumbUrl } from "./upload.js";
import { createUploader } from "./weddingUploader.js";
import { weddingTitle } from "./config.js";

startStars($("#stars"));
$("#gTitle").textContent = weddingTitle;
const body = $("#gBody");

if (!configured) {
  body.append(h("div", { class: "card" }, "This page isn't set up yet — the couple needs to add their keys in js/config.js."));
} else {
  const KEY = "guestName";
  let name = ""; try { name = localStorage.getItem(KEY) || ""; } catch {}
  let user = null, uploaded = 0, unsub = null;

  onAuthStateChanged(auth, (u) => {
    if (u) { user = u; if (!body.dataset.ready) { body.dataset.ready = "1"; ui(); } }
    else signInAnonymously(auth).catch((e) => {
      body.replaceChildren(h("div", { class: "card" }, h("b", {}, "Couldn't open the gallery."),
        h("p", { class: "muted" }, e.code === "auth/operation-not-allowed" ? "Anonymous sign-in must be enabled in Firebase → Authentication." : "Check your connection and reload.")));
    });
  });

  function ui() {
    const nameInput = h("input", { placeholder: "Your name (so the couple knows who sent it)", maxLength: 60, value: name, autocomplete: "name",
      oninput: (e) => { name = e.target.value.trim(); try { localStorage.setItem(KEY, name); } catch {} } });
    const uploader = createUploader({ getUser: () => user, getName: () => name, onUploaded: () => { uploaded++; mine.textContent = `You've shared ${uploaded} ${uploaded === 1 ? "memory" : "memories"} ♡`; mine.hidden = false; } });
    const drop = h("button", { class: "bigdrop", style: { width: "100%" }, onclick: () => (name ? uploader.open() : (nameInput.focus(), toast("Add your name first ✦"))) }, "📸 Add photos & videos");
    const mine = h("p", { class: "okmsg", hidden: true });
    const grid = h("div", { class: "grid", style: { textAlign: "left" } });
    const empty = h("div", { class: "empty" }, "Be the first to share a memory ✦");

    body.replaceChildren(
      h("div", { class: "card", style: { textAlign: "left" } }, h("div", { class: "stack" }, nameInput, drop, uploader.el, mine)),
      h("h3", { class: "card-title", style: { margin: "18px 0 10px" } }, "Everyone's pictures"), grid, empty,
      h("p", { class: "muted", style: { marginTop: "22px" } }, "Thank you for celebrating with us ♡"));

    unsub = onSnapshot(query(collection(db, "wedding"), orderBy("createdAt", "desc"), limit(120)),
      (snap) => applyChanges(snap, grid, (w) => h("button", { class: "cell", onclick: () => lightbox({ url: w.url, type: w.type }) },
        h("img", { src: thumbUrl(w.url, w.type), loading: "lazy", decoding: "async", alt: "" }),
        w.type === "video" ? h("span", { class: "play" }, "▶") : null, h("span", { class: "badge" }, w.by || "Guest")), empty),
      (e) => toast("Couldn't load the gallery: " + e.code, "error"));
  }
  addEventListener("pagehide", () => unsub?.());
}
