// Small DOM + UI helpers shared by every section. No innerHTML anywhere → no XSS.
import { imgUrl, thumbUrl, audioUrl } from "./upload.js";
import { members } from "./config.js";

export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Collects unsubscribe/cleanup functions so listeners can never leak.
export class Scope {
  constructor() { this.fns = []; }
  add(fn) { if (typeof fn === "function") this.fns.push(fn); return fn; }
  clear() { for (const f of this.fns.splice(0)) { try { f(); } catch (e) { console.warn(e); } } }
}

export function toast(msg, kind = "info", ms = 3400) {
  const box = $("#toasts");
  if (!box) return;
  const t = h("div", { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}

export const ms = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === "number" ? ts : Date.now());

export function timeAgo(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const fmtDate = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export const fmtDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export const memberById = (id) => members.find((m) => m.id === id) || { name: "?", color: "#8e98b8" };

export function mediaEl(url, type, { full = false } = {}) {
  if (type === "video")
    return h("video", { src: url, controls: true, playsInline: true, preload: "metadata", poster: thumbUrl(url, "video"), class: "media" });
  if (type === "audio") return h("audio", { src: audioUrl(url), controls: true, preload: "none", class: "audio" });
  return h("img", { src: imgUrl(url, full ? 1600 : 900), loading: "lazy", decoding: "async", alt: "", class: "media" });
}

export function avatar(id) {
  const m = memberById(id);
  return h("span", { class: "avatar", style: { "--c": m.color }, title: m.name }, m.name[0]);
}

// Keyed incremental list rendering from a Firestore snapshot: only touched rows are re-rendered,
// so videos/inputs in untouched rows are never reset by a realtime update.
export function applyChanges(snap, container, render, emptyEl) {
  for (const ch of snap.docChanges()) {
    const id = ch.doc.id;
    const existing = [...container.children].find((c) => c.dataset.id === id);
    if (ch.type === "removed") { existing?.remove(); continue; }
    const el = render({ id, ...ch.doc.data({ serverTimestamps: "estimate" }) });
    el.dataset.id = id;
    if (existing && !(ch.type === "modified" && ch.oldIndex !== ch.newIndex)) existing.replaceWith(el);
    else {
      existing?.remove();
      container.insertBefore(el, container.children[ch.newIndex] || null);
    }
  }
  if (emptyEl) emptyEl.hidden = container.children.length > 0;
}

export const section = (title, sub, ...kids) =>
  h("section", { class: "card" }, h("h3", { class: "card-title" }, title), sub ? h("p", { class: "muted" }, sub) : null, ...kids);

export const field = (label, input) => h("label", { class: "field" }, h("span", {}, label), input);

export function confirmAsk(msg) { return window.confirm(msg); }

export function lightbox({ url, type, onDelete, downloadHref }) {
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => e.key === "Escape" && close();
  const box = h("div", { class: "lightbox", onclick: (e) => e.target === box && close() },
    h("div", { class: "lb-bar" },
      downloadHref ? h("a", { class: "btn", href: downloadHref, download: "" }, "⬇ Download") : null,
      onDelete ? h("button", { class: "btn danger", onclick: () => { close(); onDelete(); } }, "Delete") : null,
      h("button", { class: "btn", onclick: close }, "✕ Close")),
    type === "video"
      ? h("video", { src: url, controls: true, autoplay: true, playsInline: true })
      : h("img", { src: imgUrl(url, 1800), alt: "" }));
  document.addEventListener("keydown", onKey);
  document.body.append(box);
}
