// App shell: auth gate, identity, hash router (lazy-loaded sections), notification centre.
import {
  configured, auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, collection, query, where, limit, onSnapshot, doc, updateDoc, writeBatch,
} from "./firebase.js";
import { members } from "./config.js";
import { startStars } from "./stars.js";
import { $, h, toast, timeAgo, ms, Scope } from "./ui.js";
import { initCalls, disposeCalls } from "./calls.js";
import { initLocationShare, disposeLocationShare } from "./locationShare.js";

const SECTIONS = [
  { id: "wedding",  icon: "💍", title: "Wedding Pictures", sub: "Guest uploads & our QR code", hot: true, load: () => import("./sections/wedding.js") },
  { id: "today",    icon: "✦",  title: "Today, Us",        sub: "A little piece of today",     load: () => import("./sections/today.js") },
  { id: "story",    icon: "🕰️", title: "Our Story",        sub: "Every chapter that brought us here", load: () => import("./sections/story.js") },
  { id: "games",    icon: "🎮", title: "Games",            sub: "Play, tease, compete",        load: () => import("./sections/games.js") },
  { id: "calling",  icon: "📞", title: "Calling",          sub: "Voice & video, just us",      load: () => import("./sections/calling.js") },
  { id: "location", icon: "📍", title: "Live Location",    sub: "See each other on the map",   load: () => import("./sections/location.js") },
  { id: "letters",  icon: "💌", title: "Letters",          sub: "Daily text or voice note",    load: () => import("./sections/letters.js") },
  { id: "music",    icon: "🎵", title: "Our Music",        sub: "Songs that tell our story",   load: () => import("./sections/music.js") },
];

startStars($("#stars"));
const viewScope = new Scope();
const sessionScope = new Scope();
let session = null;
let routeToken = 0;

/* ───────────── auth ───────────── */
const AUTH_MSG = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "No account for this email yet — tap “Create our account”.",
  "auth/invalid-email": "That email doesn't look right.",
  "auth/email-already-in-use": "This account already exists — just sign in.",
  "auth/weak-password": "Password needs at least 6 characters.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/network-request-failed": "No connection — check your internet.",
  "auth/operation-not-allowed": "Email/Password sign-in isn't enabled in Firebase → Authentication.",
};
const findMember = (email) => members.find((m) => m.email === String(email || "").trim().toLowerCase());

function wireLogin() {
  let creating = false;
  const err = $("#loginErr"), btn = $("#loginBtn");
  const setErr = (t, ok) => { err.textContent = t || ""; err.classList.toggle("okmsg", !!ok); };
  const busy = (b) => { btn.disabled = b; btn.textContent = b ? "One moment…" : creating ? "Create account ✦" : "Sign in ✦"; };

  $("#toggleMode").onclick = () => {
    creating = !creating;
    $("#confirmWrap").hidden = !creating;
    $("#toggleMode").textContent = creating ? "I already have an account" : "Create our account";
    $("#password").autocomplete = creating ? "new-password" : "current-password";
    setErr(""); busy(false);
  };
  $("#forgot").onclick = async () => {
    const email = $("#email").value.trim().toLowerCase();
    if (!findMember(email)) return setErr("Type your email above first.");
    try { await sendPasswordResetEmail(auth, email); setErr("Reset link sent — check your inbox.", true); }
    catch (e) { setErr(AUTH_MSG[e.code] || "Couldn't send the reset email."); }
  };
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault(); setErr("");
    const email = $("#email").value.trim().toLowerCase(); // trimmed + lowercased → no false "wrong password"
    const pw = $("#password").value;
    if (!findMember(email)) return setErr("This little world is private — that email isn't invited.");
    if (pw.length < 6) return setErr("Password needs at least 6 characters.");
    if (creating && pw !== $("#password2").value) return setErr("The two passwords don't match.");
    busy(true);
    try {
      if (creating) await createUserWithEmailAndPassword(auth, email, pw);
      else await signInWithEmailAndPassword(auth, email, pw);
      // onAuthStateChanged takes over from here
    } catch (e2) { setErr(AUTH_MSG[e2.code] || `Sign-in failed (${e2.code || e2.message}).`); busy(false); }
  };
}

if (!configured) {
  $("#boot").hidden = true; $("#setup").hidden = false;
} else {
  wireLogin();
  onAuthStateChanged(auth, (user) => {
    $("#boot").hidden = true;
    if (user && !user.isAnonymous) {
      const m = findMember(user.email);
      if (!m) { $("#loginErr").textContent = "This account isn't part of our world."; signOut(auth); return; }
      if (session?.ctx.me.uid === user.uid) return;
      startSession(user, m);
    } else { endSession(); $("#login").hidden = false; $("#app").hidden = true; }
  });
}

/* ───────────── session ───────────── */
function startSession(user, member) {
  const me = { ...member, uid: user.uid };
  const partner = members.find((m) => m.id !== me.id);
  const ctx = { me, partner };
  session = { ctx };
  $("#login").hidden = true; $("#app").hidden = false;
  $("#meName").textContent = me.name; $("#meChip").style.setProperty("--c", me.color);
  $("#loginBtn").disabled = false;
  startNotifications(ctx);
  initCalls(ctx); sessionScope.add(disposeCalls);
  initLocationShare(ctx); sessionScope.add(disposeLocationShare);
  addEventListener("hashchange", route);
  sessionScope.add(() => removeEventListener("hashchange", route));
  route();
}

function endSession() {
  if (!session) return;
  viewScope.clear(); sessionScope.clear(); session = null; $("#view").replaceChildren();
}
$("#signOut").onclick = async () => { endSession(); await signOut(auth); };

/* ───────────── router ───────────── */
async function route() {
  if (!session) return;
  viewScope.clear();
  const token = ++routeToken;
  const id = location.hash.replace(/^#\/?/, "");
  const view = $("#view");
  view.replaceChildren(); scrollTo(0, 0); $("#notifPanel").hidden = true;
  const sec = SECTIONS.find((s) => s.id === id);
  if (!sec) return renderHome(view);
  const body = h("div", { class: "section-body" });
  view.append(
    h("div", { class: "backbar" }, h("a", { class: "btn ghost sm", href: "#/" }, "← Back to Main Menu")),
    h("div", {}, h("div", { class: "eyebrow" }, sec.sub), h("h2", { class: "page-title" }, `${sec.icon} ${sec.title}`)),
    body,
  );
  try {
    const mod = await sec.load();
    if (token !== routeToken) return;
    const cleanup = mod.mount(body, { ...session.ctx, onLeave: (fn) => viewScope.add(fn) });
    if (typeof cleanup === "function") viewScope.add(cleanup);
  } catch (e) {
    console.error(e);
    body.append(h("div", { class: "card" }, h("b", {}, "Couldn't open this section."), h("p", { class: "muted" }, String(e.message || e))));
  }
}

function renderHome(view) {
  const { me } = session.ctx;
  view.append(
    h("div", { class: "hero" },
      h("div", { class: "eyebrow" }, "A place made just for us"),
      h("h2", {}, `Welcome, ${me.name}`),
      h("p", { class: "muted" }, "Where would you like to go?")),
    h("div", { class: "menu" }, SECTIONS.map((s) =>
      h("button", { class: `tile${s.hot ? " hot" : ""}`, onclick: () => (location.hash = `#/${s.id}`) },
        h("span", { class: "ic" }, s.icon), h("b", {}, s.title), h("small", {}, s.sub)))),
  );
}

/* ───────────── notifications ───────────── */
function startNotifications(ctx) {
  const bell = $("#bell"), panel = $("#notifPanel"), count = $("#bellCount");
  let items = [], first = true;

  const unsub = onSnapshot(
    query(collection(db, "notifications"), where("toEmail", "==", ctx.me.email), limit(60)),
    (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      const unread = items.filter((i) => !i.read).length;
      count.textContent = unread; count.hidden = unread === 0;
      if (!first) for (const ch of snap.docChanges()) if (ch.type === "added" && !ch.doc.metadata.hasPendingWrites) popup(ch.doc.data());
      first = false;
      if (!panel.hidden) renderPanel();
    },
    (e) => console.warn("notifications", e),
  );
  sessionScope.add(unsub);

  function popup(n) {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification(`${n.fromName} · Y & L`, { body: n.text, icon: "icon.svg" }); return; } catch {}
    }
    toast(`${n.fromName}: ${n.text}`);
  }
  function renderPanel() {
    panel.replaceChildren(
      h("header", {}, "Notifications",
        h("button", { class: "btn sm", onclick: markAll }, "Mark all read")),
      ...(("Notification" in window && Notification.permission === "default")
        ? [h("button", { class: "notif", onclick: async () => { await Notification.requestPermission(); renderPanel(); } }, "🔔 Turn on phone alerts", h("small", {}, "Shown while the app is open in the background"))] : []),
      ...(items.length ? items.map((n) =>
        h("button", { class: `notif${n.read ? "" : " unread"}`, onclick: () => open(n) },
          `${n.fromName}: ${n.text}`, h("small", {}, timeAgo(ms(n.createdAt)))))
        : [h("div", { class: "empty", style: { border: 0 } }, "Nothing yet ✦")]),
    );
  }
  async function open(n) {
    panel.hidden = true;
    if (!n.read) updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {});
    if (n.route) location.hash = n.route;
  }
  async function markAll() {
    const b = writeBatch(db);
    items.filter((i) => !i.read).forEach((i) => b.update(doc(db, "notifications", i.id), { read: true }));
    try { await b.commit(); } catch (e) { console.warn(e); }
  }
  bell.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) renderPanel(); };
  const outside = (e) => { if (!panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) panel.hidden = true; };
  document.addEventListener("click", outside);
  sessionScope.add(() => { document.removeEventListener("click", outside); bell.onclick = null; });
}
