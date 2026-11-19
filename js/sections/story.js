// Our Story — chronological timeline (sorted by the memory's date), add / edit / delete.
import { db, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "../firebase.js";
import { h, toast, mediaEl, memberById, applyChanges, section, field, fmtDate, confirmAsk } from "../ui.js";
import { uploadFile, compressImage } from "../upload.js";
import { notifyPartner } from "../notify.js";

export function mount(root, ctx) {
  const col = collection(db, "story");
  let editing = null, file = null, busy = false;
  const rows = new Map(); // id → data, for edit

  const date = h("input", { type: "date" });
  const title = h("input", { maxLength: 120, placeholder: "The day we…" });
  const text = h("textarea", { rows: 4, maxLength: 3000, placeholder: "What happened on this day?" });
  const input = h("input", { type: "file", accept: "image/*,video/*", onchange: (e) => (file = e.target.files[0] || null) });
  const bar = h("div", { class: "bar", hidden: true }, h("i"));
  const save = h("button", { class: "btn primary", onclick: submit }, "Save to our story");
  const cancel = h("button", { class: "btn ghost", hidden: true, onclick: reset }, "Cancel edit");
  const formTitle = h("h3", { class: "card-title" }, "✨ Add a new chapter");
  const list = h("div", { class: "timeline" });
  const empty = h("div", { class: "empty" }, "Our story starts with the first chapter ✦");

  root.append(
    h("section", { class: "card" }, formTitle,
      h("div", { class: "stack", style: { marginTop: "10px" } },
        field("Date of the memory", date), field("Title", title), field("What happened?", text),
        field("Photo or video (optional)", input), bar, h("div", { class: "row" }, save, cancel))),
    list, empty);

  function reset() {
    editing = null; file = null; date.value = title.value = text.value = input.value = "";
    formTitle.textContent = "✨ Add a new chapter"; save.textContent = "Save to our story"; cancel.hidden = true;
  }

  async function submit() {
    if (busy) return;
    if (!date.value || !title.value.trim()) return toast("A date and a title, please ✦");
    busy = true; save.disabled = true;
    try {
      const data = { date: date.value, title: title.value.trim(), text: text.value.trim() };
      if (file) {
        bar.hidden = false;
        const up = await uploadFile(await compressImage(file), { folder: "story", onProgress: (p) => (bar.firstChild.style.width = p * 100 + "%") });
        data.url = up.url; data.type = up.type;
      }
      if (editing) await updateDoc(doc(db, "story", editing), data);
      else {
        await addDoc(col, { ...data, by: ctx.me.id, createdAt: serverTimestamp() });
        notifyPartner(ctx, `added a chapter: “${data.title}”`, "#/story");
      }
      toast("Saved ✦", "ok"); reset();
    } catch (e) { toast(e.message || "Couldn't save.", "error", 5000); }
    finally { busy = false; save.disabled = false; bar.hidden = true; bar.firstChild.style.width = "0"; }
  }

  function renderChapter(c) {
    rows.set(c.id, c);
    return h("article", { class: "card chapter" },
      h("div", { class: "date" }, fmtDate(c.date)),
      h("h3", { class: "card-title" }, c.title),
      c.url ? mediaEl(c.url, c.type) : null,
      c.text ? h("p", { style: { whiteSpace: "pre-wrap" } }, c.text) : null,
      h("div", { class: "row between" },
        h("small", { class: "muted" }, `added by ${memberById(c.by).name}`),
        h("div", { class: "row" },
          h("button", { class: "btn sm", onclick: () => edit(c.id) }, "Edit"),
          h("button", { class: "btn sm danger", onclick: () => confirmAsk("Delete this chapter?") && deleteDoc(doc(db, "story", c.id)).catch(() => toast("Couldn't delete.", "error")) }, "Delete"))));
  }

  function edit(id) {
    const c = rows.get(id); if (!c) return;
    editing = id; date.value = c.date; title.value = c.title; text.value = c.text || "";
    formTitle.textContent = "✏️ Edit chapter"; save.textContent = "Save changes"; cancel.hidden = false;
    scrollTo({ top: 0, behavior: "smooth" });
  }

  const unsub = onSnapshot(query(col, orderBy("date", "asc")),
    (snap) => { snap.docChanges().forEach((ch) => ch.type === "removed" && rows.delete(ch.doc.id)); applyChanges(snap, list, renderChapter, empty); },
    (e) => toast("Couldn't load the story: " + e.code, "error"));
  return unsub;
}
