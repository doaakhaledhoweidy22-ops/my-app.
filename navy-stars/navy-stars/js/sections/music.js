// Our Music — shared playlist with a note from each of us.
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "../firebase.js";
import { h, toast, applyChanges, section, field, memberById, confirmAsk } from "../ui.js";
import { notifyPartner } from "../notify.js";
import { members } from "../config.js";

const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

export function mount(root, ctx) {
  const col = collection(db, "songs");
  const [a, b] = members;
  const title = h("input", { maxLength: 140, placeholder: "Song name — Artist" });
  const link = h("input", { type: "url", placeholder: "Spotify / Anghami / YouTube / SoundCloud link (optional)" });
  const noteA = h("textarea", { rows: 2, maxLength: 400, placeholder: `${a.name}'s note…` });
  const noteB = h("textarea", { rows: 2, maxLength: 400, placeholder: `${b.name}'s note…` });
  const list = h("div", { class: "stack" });
  const empty = h("div", { class: "empty" }, "No songs yet — add the one that sounds like us 🎵");

  async function add() {
    const t = title.value.trim();
    if (!t) return toast("Give the song a name first.");
    const url = link.value.trim() ? safeUrl(link.value.trim()) : "";
    if (link.value.trim() && !url) return toast("That link doesn't look valid.", "error");
    try {
      await addDoc(col, { title: t, url, notes: { [a.id]: noteA.value.trim(), [b.id]: noteB.value.trim() }, by: ctx.me.id, createdAt: serverTimestamp() });
      notifyPartner(ctx, `added a song: “${t}”`, "#/music");
      title.value = link.value = noteA.value = noteB.value = ""; toast("Added to our playlist 🎵", "ok");
    } catch (e) { toast("Couldn't add the song.", "error"); }
  }

  root.append(
    section("🎶 Add a song we love", null,
      h("div", { class: "stack", style: { marginTop: "10px" } }, field("Song", title), field("Link", link), field(`${a.name}'s note`, noteA), field(`${b.name}'s note`, noteB),
        h("button", { class: "btn primary", onclick: add }, "Add to playlist 🎵"))),
    h("h3", { class: "card-title", style: { margin: "6px 0 10px" } }, "Our shared songs"), list, empty);

  const render = (s) => h("article", { class: "card" },
    h("div", { class: "row between" },
      h("h3", { class: "card-title" }, `🎵 ${s.title}`),
      h("div", { class: "row" },
        s.url ? h("a", { class: "btn sm primary", href: s.url, target: "_blank", rel: "noopener noreferrer" }, "▶ Listen") : null,
        h("button", { class: "btn sm danger", onclick: () => confirmAsk("Remove this song?") && deleteDoc(doc(db, "songs", s.id)).catch(() => {}) }, "Remove"))),
    ...members.map((m) => (s.notes?.[m.id] ? h("p", { style: { margin: "6px 0 0" } }, h("b", { style: { color: m.color } }, m.name + ": "), s.notes[m.id]) : null)),
    h("small", { class: "muted" }, `added by ${memberById(s.by).name}`));

  return onSnapshot(query(col, orderBy("createdAt", "desc"), limit(100)),
    (snap) => applyChanges(snap, list, render, empty), (e) => toast("Couldn't load songs: " + e.code, "error"));
}
