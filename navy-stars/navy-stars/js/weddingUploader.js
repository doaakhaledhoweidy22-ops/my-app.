// Shared upload widget for wedding photos/videos (used by the guest page and the couple's Wedding section).
// Max 2 uploads at once, images are compressed first, each file has its own progress bar + retry.
import { db, collection, addDoc, serverTimestamp } from "./firebase.js";
import { uploadFile, compressImage } from "./upload.js";
import { cloudinary } from "./config.js";
import { h, toast } from "./ui.js";

export function createUploader({ getUser, getName, onUploaded }) {
  const input = h("input", { type: "file", accept: "image/*,video/*", multiple: true, hidden: true, onchange: (e) => { add([...e.target.files]); input.value = ""; } });
  const list = h("div");
  const el = h("div", {}, input, list);
  const queue = []; let active = 0;

  const open = () => input.click();

  function add(files) {
    for (const f of files) {
      if (!/^(image|video)\//.test(f.type)) { toast(`${f.name}: only photos & videos`, "error"); continue; }
      if (f.type.startsWith("video/") && f.size > cloudinary.maxVideoMB * 1048576) { toast(`${f.name} is over ${cloudinary.maxVideoMB} MB`, "error", 5000); continue; }
      const fill = h("i"), msg = h("span", {}, "Waiting…");
      const row = h("div", { class: "uprow" }, h("div", { class: "row between" }, h("span", {}, f.name.length > 28 ? f.name.slice(0, 25) + "…" : f.name), msg), h("div", { class: "bar" }, fill));
      list.prepend(row);
      queue.push({ f, fill, msg, row });
    }
    pump();
  }

  async function run(job) {
    const { f, fill, msg, row } = job;
    row.className = "uprow"; msg.textContent = "Uploading…";
    try {
      const prepared = await compressImage(f);
      const up = await uploadFile(prepared, { folder: "wedding", onProgress: (p) => { fill.style.width = p * 100 + "%"; } });
      await addDoc(collection(db, "wedding"), { url: up.url, type: up.type, by: (getName() || "Guest").slice(0, 60), uid: getUser().uid, createdAt: serverTimestamp() });
      fill.style.width = "100%"; msg.textContent = "✓ Added"; row.classList.add("good");
      onUploaded?.();
      setTimeout(() => row.remove(), 4000);
    } catch (e) {
      msg.textContent = "Failed — tap to retry"; row.classList.add("bad"); fill.style.width = "0";
      row.style.cursor = "pointer";
      row.onclick = () => { row.onclick = null; row.style.cursor = ""; queue.push(job); pump(); };
      console.warn(e);
    }
  }

  function pump() {
    while (active < 2 && queue.length) {
      const job = queue.shift(); active++;
      run(job).finally(() => { active--; pump(); });
    }
  }
  return { el, open };
}
