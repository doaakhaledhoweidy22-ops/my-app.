// Media upload (Cloudinary unsigned) + URL helpers. Photos, videos and voice notes.
import { cloudinary } from "./config.js";

export const kindOf = (file) =>
  file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";

// Shrink big phone photos before upload → much faster on mobile data.
export async function compressImage(file, max = 1920, quality = 0.85) {
  if (!file.type.startsWith("image/") || /gif|svg/.test(file.type) || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC the browser can't decode — upload original
  }
}

export function uploadFile(file, { onProgress, folder = "memories" } = {}) {
  return new Promise((resolve, reject) => {
    if (String(cloudinary.cloudName).startsWith("YOUR_")) {
      return reject(new Error("Uploads aren't set up yet — add your Cloudinary details in js/config.js"));
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", cloudinary.uploadPreset);
    fd.append("folder", folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/auto/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && j.secure_url) resolve({ url: j.secure_url, type: kindOf(file) });
        else reject(new Error(j.error?.message || "Upload failed"));
      } catch { reject(new Error("Upload failed")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

// Cloudinary delivery transforms (no-ops for non-Cloudinary URLs)
const T = (url, t) => (url.includes("/upload/") ? url.replace("/upload/", `/upload/${t}/`) : url);
export const imgUrl = (url, w = 900) => T(url, `w_${w},c_limit,q_auto,f_auto`);
export const thumbUrl = (url, type) =>
  type === "video" ? T(url, "so_0,w_480,h_480,c_fill,q_auto,f_jpg").replace(/\.\w+$/, ".jpg") : T(url, "w_480,h_480,c_fill,q_auto,f_auto");
export const downloadUrl = (url) => T(url, "fl_attachment");
// Android records webm, iOS can't always play it → deliver voice notes as mp3 everywhere.
export const audioUrl = (url) => (url.includes("/upload/") ? url.replace(/\.\w+$/, ".mp3") : url);
