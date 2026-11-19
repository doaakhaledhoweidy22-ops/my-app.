// Calling — start a voice/video call + recent call history. (Ringing/answering is handled app-wide in js/calls.js.)
import { db, collection, query, where, limit, onSnapshot } from "../firebase.js";
import { h, toast, timeAgo, ms, avatar, section } from "../ui.js";
import { startCall } from "../calls.js";

export function mount(root, ctx) {
  const hist = h("div", { class: "stack" });
  const empty = h("div", { class: "empty" }, "No calls yet.");
  root.append(
    section(`Call ${ctx.partner.name}`, "Private, direct, just the two of you.",
      h("div", { style: { textAlign: "center", padding: "10px 0" } }, avatar(ctx.partner.id)),
      h("div", { class: "row", style: { justifyContent: "center", marginTop: "6px" } },
        h("button", { class: "btn primary big", onclick: () => startCall("audio") }, "📞 Voice call"),
        h("button", { class: "btn big", onclick: () => startCall("video") }, "🎥 Video call")),
      h("p", { class: "muted", style: { textAlign: "center", marginTop: "12px" } }, "Keep the app open so the other phone can ring.")),
    h("h3", { class: "card-title", style: { margin: "6px 0 10px" } }, "Recent calls"), hist, empty);

  const unsub = onSnapshot(query(collection(db, "calls"), where("participants", "array-contains", ctx.me.email), limit(40)),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 12);
      hist.replaceChildren(...rows.map((c) => {
        const out = c.fromEmail === ctx.me.email;
        const label = c.state === "missed" ? (out ? "No answer" : "Missed") : c.state === "declined" ? "Declined" : c.state === "ringing" ? "Ringing" : "Completed";
        return h("div", { class: "card", style: { margin: 0, padding: "12px 14px" } }, h("div", { class: "row between" },
          h("span", {}, `${out ? "↗ Outgoing" : "↙ Incoming"} ${c.kind === "video" ? "🎥" : "📞"} · ${label}`),
          h("small", { class: "muted" }, timeAgo(ms(c.createdAt)))));
      }));
      empty.hidden = rows.length > 0;
    }, (e) => console.warn("call history", e));
  return unsub;
}
