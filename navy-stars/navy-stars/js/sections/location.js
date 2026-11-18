// Live Location — Life360-style: both of you on one map, last-seen, battery, distance apart, Google Maps buttons.
import { db, collection, onSnapshot } from "../firebase.js";
import { h, toast, timeAgo, ms, section } from "../ui.js";
import { members } from "../config.js";
import { isSharing, setSharing, locEvents, haversine } from "../locationShare.js";

let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = h("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" });
    const js = h("script", { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", onload: res, onerror: () => { leafletReady = null; rej(new Error("Couldn't load the map library.")); } });
    document.head.append(css, js);
  });
  return leafletReady;
}

export function mount(root, ctx) {
  const store = new Map();    // member id → location doc
  const markers = new Map();  // member id → L.marker
  let map = null, fitted = false, disposed = false;

  const mapEl = h("div", { id: "map" });
  const toggle = h("input", { type: "checkbox", checked: isSharing(), onchange: (e) => setSharing(e.target.checked) });
  const info = h("div", { class: "stack" });
  const dist = h("p", { class: "status", style: { margin: "0 0 12px" } });

  root.append(
    mapEl, dist,
    section("Share my location", "While the app is open, your partner sees you move on the map. You can stop any time.",
      h("label", { class: "switch", style: { marginTop: "10px" } }, toggle, h("span", {}, "Sharing my live location"))),
    info);

  const onChange = () => (toggle.checked = isSharing());
  locEvents.addEventListener("change", onChange);

  const gmaps = (l) => `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
  const route = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

  function drawInfo() {
    info.replaceChildren(...members.map((m) => {
      const l = store.get(m.id);
      const live = l?.sharing && Date.now() - ms(l.ts) < 10 * 60 * 1000;
      let status = "No location yet";
      if (l) status = l.sharing ? `${live ? "Live" : "Last seen"} · ${timeAgo(ms(l.ts))}` : `Not sharing · last seen ${timeAgo(ms(l.ts))}`;
      return h("div", { class: "card", style: { margin: 0 } },
        h("div", { class: "row between" },
          h("b", { style: { color: m.color, fontFamily: "var(--serif)", fontSize: "1.3rem" } }, m.id === ctx.me.id ? `${m.name} (you)` : m.name),
          h("span", { class: "chip" }, status)),
        l ? h("p", { class: "muted" }, [`±${l.acc || "?"} m`, l.battery != null ? `🔋 ${l.battery}%${l.charging ? " ⚡" : ""}` : null, l.speed > 1 ? `${Math.round(l.speed * 3.6)} km/h` : null].filter(Boolean).join(" · ")) : null,
        l ? h("div", { class: "row", style: { marginTop: "8px" } },
          h("button", { class: "btn sm", onclick: () => map?.flyTo([l.lat, l.lng], 16) }, "Locate on map"),
          h("a", { class: "btn sm", href: gmaps(l), target: "_blank", rel: "noopener noreferrer" }, "Open in Google Maps ↗"),
          m.id !== ctx.me.id ? h("a", { class: "btn sm primary", href: route(l), target: "_blank", rel: "noopener noreferrer" }, "Directions →") : null) : null);
    }));
    const a = store.get(members[0].id), b = store.get(members[1].id);
    if (a && b) { const d = haversine(a, b); dist.textContent = d < 1000 ? `${Math.round(d)} m apart` : `${(d / 1000).toFixed(1)} km apart`; }
    else dist.textContent = "";
  }

  function pin(m, l) {
    const live = l.sharing && Date.now() - ms(l.ts) < 10 * 60 * 1000;
    return window.L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 34],
      html: `<div class="pin${live ? "" : " stale"}" style="--c:${m.color}"><span>${m.name[0]}</span></div>` });
  }

  function drawMap() {
    if (!map) return;
    for (const m of members) {
      const l = store.get(m.id); if (!l) continue;
      const pos = [l.lat, l.lng];
      const mk = markers.get(m.id);
      if (mk) { mk.setLatLng(pos); mk.setIcon(pin(m, l)); }
      else markers.set(m.id, window.L.marker(pos, { icon: pin(m, l), title: m.name }).addTo(map));
    }
    if (!fitted && markers.size) {
      fitted = true;
      const pts = [...markers.values()].map((x) => x.getLatLng());
      pts.length > 1 ? map.fitBounds(window.L.latLngBounds(pts).pad(0.3), { maxZoom: 16 }) : map.setView(pts[0], 15);
    }
  }

  loadLeaflet().then(() => {
    if (disposed) return;
    map = window.L.map(mapEl, { zoomControl: false, attributionControl: true }).setView([30.04, 31.24], 5);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }).addTo(map);
    setTimeout(() => map?.invalidateSize(), 100);
    drawMap();
  }).catch((e) => toast(e.message, "error"));

  const unsub = onSnapshot(collection(db, "locations"), (snap) => {
    snap.docChanges().forEach((ch) => { if (ch.type !== "removed") store.set(ch.doc.id, ch.doc.data({ serverTimestamps: "estimate" })); });
    drawInfo(); drawMap();
  }, (e) => toast("Couldn't load locations: " + e.code, "error"));
  drawInfo();
  const refresh = setInterval(drawInfo, 20000); // keeps "x min ago" honest

  return () => { disposed = true; unsub(); clearInterval(refresh); locEvents.removeEventListener("change", onChange); try { map?.remove(); } catch {} map = null; markers.clear(); };
}
