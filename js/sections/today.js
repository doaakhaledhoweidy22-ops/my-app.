// Today, Us — realtime photo/video feed with likes + comments.
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, arrayUnion, arrayRemove,
} from "../firebase.js";
import { h, toast, timeAgo, ms, mediaEl, avatar, memberById, applyChanges, section, field, confirmAsk } from "../ui.js";
import { uploadFile, compressImage } from "../upload.js";
import { notifyPartner } from "../notify.js";

export function mount(root, ctx) {
  let file = null, previewUrl = null, busy = false;
  const col = collection(db, "posts");

  const input = h("input", { type: "file", accept: "image/*,video/*", onchange: (e) => pick(e.target.files[0]) });
  const preview = h("div", { class: "preview", hidden: true });
  const caption = h("textarea", { rows: 2, maxLength: 600, placeholder: "What made today special?" });
  const bar = h("div", { class: "bar", hidden: true }, h("i"));
  const btn = h("button", { class: "btn primary", onclick: post }, "Post ✦");
  const list = h("div", { class: "stack" });
  const empty = h("div", { class: "empty" }, "No moments yet — share the first one ✦");

  root.append(
    section("✨ Share a moment", "A little piece of today, saved forever.",
      h("div", { class: "stack", style: { marginTop: "12px" } },
        field("Photo or video (optional)", input), preview, field("Caption", caption), bar, btn)),
    h("h3", { class: "card-title", style: { margin: "6px 0 10px" } }, "Our daily moments"),
    list, empty,
  );

  function pick(f) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = f || null; preview.replaceChildren();
    if (!file) { preview.hidden = true; return; }
    previewUrl = URL.createObjectURL(file);
    preview.append(file.type.startsWith("video/") ? h("video", { src: previewUrl, controls: true, muted: true, playsInline: true }) : h("img", { src: previewUrl, alt: "" }));
    preview.hidden = false;
  }

  async function post() {
    if (busy) return;
    const text = caption.value.trim();
    if (!file && !text) return toast("Add a photo/video or a caption first.");
    busy = true; btn.disabled = true; btn.textContent = "Posting…";
    try {
      let media = {};
      if (file) {
        bar.hidden = false;
        const up = await uploadFile(await compressImage(file), { folder: "today", onProgress: (p) => (bar.firstChild.style.width = p * 100 + "%") });
        media = { url: up.url, type: up.type };
      }
      await addDoc(col, { by: ctx.me.id, caption: text, ...media, likes: [], comments: [], createdAt: serverTimestamp() });
      notifyPartner(ctx, text ? `shared a moment: “${text.slice(0, 60)}”` : "shared a new moment ✦", "#/today");
      caption.value = ""; input.value = ""; pick(null); toast("Posted ✦", "ok");
    } catch (e) { toast(e.message || "Couldn't post.", "error", 5000); }
    finally { busy = false; btn.disabled = false; btn.textContent = "Post ✦"; bar.hidden = true; bar.firstChild.style.width = "0"; }
  }

  function renderPost(p) {
    const liked = (p.likes || []).includes(ctx.me.id);
    const ref = doc(db, "posts", p.id);
    const cInput = h("input", { placeholder: "Write a comment…", maxLength: 300 });
    const sendC = async () => {
      const t = cInput.value.trim(); if (!t) return;
      cInput.value = "";
      try {
        await updateDoc(ref, { comments: arrayUnion({ by: ctx.me.id, text: t, at: Date.now() }) });
        notifyPartner(ctx, `commented: “${t.slice(0, 50)}”`, "#/today");
      } catch { toast("Couldn't send the comment.", "error"); }
    };
    return h("article", { class: "card" },
      h("div", { class: "post-head" }, avatar(p.by),
        h("div", {}, h("b", {}, memberById(p.by).name), h("small", {}, timeAgo(ms(p.createdAt)))),
        p.by === ctx.me.id ? h("button", { class: "btn sm danger", style: { marginLeft: "auto" }, onclick: async () => { if (confirmAsk("Delete this moment?")) deleteDoc(ref).catch(() => toast("Couldn't delete.", "error")); } }, "Delete") : null),
      p.url ? mediaEl(p.url, p.type) : null,
      p.caption ? h("p", { style: { margin: "10px 0 0", whiteSpace: "pre-wrap" } }, p.caption) : null,
      h("div", { class: "post-actions" },
        h("button", { class: `btn sm${liked ? " liked" : ""}`, onclick: () => updateDoc(ref, { likes: liked ? arrayRemove(ctx.me.id) : arrayUnion(ctx.me.id) }).catch(() => {}) },
          `${liked ? "♥" : "♡"} ${(p.likes || []).length || ""}`)),
      ...(p.comments || []).map((c) => h("div", { class: "comment" }, h("b", {}, memberById(c.by).name), " ", c.text)),
      h("div", { class: "row", style: { marginTop: "8px", flexWrap: "nowrap" } }, cInput,
        h("button", { class: "btn sm", onclick: sendC }, "Send")),
    );
  }

  const unsub = onSnapshot(query(col, orderBy("createdAt", "desc"), limit(40)),
    (snap) => applyChanges(snap, list, renderPost, empty),
    (e) => toast("Couldn't load moments: " + e.code, "error"));

  return () => { unsub(); if (previewUrl) URL.revokeObjectURL(previewUrl); };
}
