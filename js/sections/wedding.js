// Wedding Pictures (couple view): guest QR code, live gallery, filters, multi-select download, delete.
import { db, auth, collection, doc, deleteDoc, onSnapshot, query, orderBy, limit } from "../firebase.js";
import { h, toast, section, applyChanges, lightbox, confirmAsk } from "../ui.js";
import { thumbUrl, downloadUrl } from "../upload.js";
import { createUploader } from "../weddingUploader.js";
import { weddingTitle } from "../config.js";

let qrLib = null;
const loadQr = () => (window.QRCode ? Promise.resolve() : (qrLib ||= new Promise((res, rej) => {
  document.head.append(h("script", { src: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js", onload: res, onerror: () => { qrLib = null; rej(new Error("QR library failed to load")); } }));
})));

export function mount(root, ctx) {
  const guestUrl = new URL("guest.html", location.href).href;
  let filter = "all", selecting = false, pageSize = 60, unsub = null;
  const selected = new Set();
  const items = new Map();

  /* QR card */
  const qr = h("canvas");
  const qrCard = section("📲 Guest QR code", `Print this and place it on the tables at ${weddingTitle}. Guests scan it and can ONLY upload photos & videos to the wedding gallery — nothing else in the app is visible to them.`,
    h("div", { class: "qrbox", style: { marginTop: "12px" } }, qr,
      h("div", { class: "mono", style: { wordBreak: "break-all" } }, guestUrl),
      h("div", { class: "row", style: { justifyContent: "center" } },
        h("button", { class: "btn sm", onclick: () => navigator.clipboard?.writeText(guestUrl).then(() => toast("Link copied", "ok")) }, "Copy link"),
        h("button", { class: "btn sm primary", onclick: downloadQr }, "Download QR (print size)"))));
  loadQr().then(() => window.QRCode.toCanvas(qr, guestUrl, { width: 220, margin: 1, color: { dark: "#070b19", light: "#ffffff" } })).catch((e) => toast(e.message, "error"));
  async function downloadQr() {
    try {
      await loadQr();
      const c = document.createElement("canvas");
      await window.QRCode.toCanvas(c, guestUrl, { width: 1200, margin: 3, color: { dark: "#070b19", light: "#ffffff" } });
      const a = h("a", { href: c.toDataURL("image/png"), download: "wedding-guest-qr.png" }); a.click();
    } catch { toast("Couldn't create the QR image.", "error"); }
  }

  /* couple can also add pictures */
  const uploader = createUploader({ getUser: () => auth.currentUser, getName: () => ctx.me.name });
  const addCard = section("Add pictures yourselves", null,
    h("div", { style: { marginTop: "10px" } }, h("button", { class: "btn", onclick: uploader.open }, "＋ Upload photos / videos"), uploader.el));

  /* gallery */
  const count = h("span", { class: "chip" }, "0");
  const pills = [["all", "All"], ["image", "Photos"], ["video", "Videos"]].map(([id, l]) => h("button", { class: `pill${id === "all" ? " on" : ""}`, onclick: () => { filter = id; pills.forEach((p, i) => p.classList.toggle("on", ["all", "image", "video"][i] === id)); applyFilter(); } }, l));
  const selBtn = h("button", { class: "btn sm", onclick: toggleSelect }, "Select");
  const dlBtn = h("button", { class: "btn sm primary", hidden: true, onclick: downloadSelected }, "⬇ Download selected");
  const grid = h("div", { class: "grid" });
  const empty = h("div", { class: "empty" }, "No pictures yet — they'll appear here live as guests upload ✦");
  const more = h("button", { class: "btn", hidden: true, onclick: () => { pageSize += 60; subscribe(); } }, "Load more");

  root.append(qrCard, addCard,
    h("div", { class: "row between", style: { margin: "6px 0 10px" } }, h("div", { class: "row" }, h("h3", { class: "card-title" }, "Gallery"), count), h("div", { class: "row" }, selBtn, dlBtn)),
    h("div", { class: "pills", style: { marginBottom: "10px" } }, pills), grid, empty, h("div", { class: "row", style: { justifyContent: "center", marginTop: "12px" } }, more));

  function applyFilter() {
    let shown = 0;
    for (const c of grid.children) { const it = items.get(c.dataset.id); const ok = filter === "all" || it?.type === filter; c.hidden = !ok; if (ok) shown++; }
    count.textContent = `${shown}`; empty.hidden = grid.children.length > 0;
  }
  function toggleSelect() {
    selecting = !selecting; selected.clear(); selBtn.textContent = selecting ? "Cancel" : "Select"; dlBtn.hidden = !selecting;
    dlBtn.textContent = "⬇ Download selected"; for (const c of grid.children) c.classList.remove("sel");
  }
  async function downloadSelected() {
    const list = [...selected].map((id) => items.get(id)).filter(Boolean);
    if (!list.length) return toast("Tap pictures to select them first.");
    toast(`Downloading ${list.length} file${list.length > 1 ? "s" : ""}… (allow multiple downloads if asked)`);
    for (const it of list) { h("a", { href: downloadUrl(it.url), download: "" }).click(); await new Promise((r) => setTimeout(r, 600)); }
  }

  function render(w) {
    items.set(w.id, w);
    const cell = h("button", { class: "cell", onclick: () => onCell(w, cell) },
      h("img", { src: thumbUrl(w.url, w.type), loading: "lazy", decoding: "async", alt: "" }),
      w.type === "video" ? h("span", { class: "play" }, "▶") : null,
      h("span", { class: "badge" }, w.by || "Guest"),
      h("span", { class: "check" }, "✓"));
    cell.querySelector(".check").style.display = "none";
    return cell;
  }
  function onCell(w, cell) {
    if (selecting) {
      selected.has(w.id) ? selected.delete(w.id) : selected.add(w.id);
      cell.classList.toggle("sel", selected.has(w.id)); cell.querySelector(".check").style.display = selected.has(w.id) ? "grid" : "none";
      dlBtn.textContent = `⬇ Download selected (${selected.size})`; return;
    }
    lightbox({ url: w.url, type: w.type, downloadHref: downloadUrl(w.url),
      onDelete: () => confirmAsk("Delete this picture for everyone?") && deleteDoc(doc(db, "wedding", w.id)).catch(() => toast("Couldn't delete.", "error")) });
  }

  function subscribe() {
    unsub?.();
    unsub = onSnapshot(query(collection(db, "wedding"), orderBy("createdAt", "desc"), limit(pageSize)), (snap) => {
      snap.docChanges().forEach((ch) => ch.type === "removed" && (items.delete(ch.doc.id), selected.delete(ch.doc.id)));
      applyChanges(snap, grid, render); applyFilter();
      more.hidden = snap.size < pageSize;
    }, (e) => toast("Couldn't load the gallery: " + e.code, "error"));
  }
  subscribe();
  return () => unsub?.();
}
