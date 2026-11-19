// Games — all three are synced live through Firestore documents (games/questions, games/ttt, games/snake).
import { db, doc, setDoc, updateDoc, onSnapshot, runTransaction, increment } from "../firebase.js";
import { h, toast, Scope } from "../ui.js";
import { notifyPartner } from "../notify.js";
import { members } from "../config.js";

export function mount(root, ctx) {
  const stage = h("div");
  root.append(stage);
  const sub = new Scope();
  const games = [
    { id: "q", icon: "💬", title: "Couple Questions", sub: "A new question every time — get to know each other all over again.", run: questions },
    { id: "s", icon: "🐍", title: "Snake Showdown", sub: "Same food, two phones. Whoever eats the most, wins.", run: snake },
    { id: "t", icon: "✖️", title: "Tic Tac Toe", sub: "The classic. Quick round while you're texting each other.", run: ttt },
  ];
  function menu() {
    sub.clear();
    stage.replaceChildren(h("div", { class: "games" }, games.map((g) =>
      h("button", { class: "tile", onclick: () => open(g) }, h("span", { class: "ic" }, g.icon), h("b", {}, g.title), h("small", {}, g.sub)))));
  }
  function open(g) {
    sub.clear();
    const body = h("div");
    stage.replaceChildren(h("div", { class: "backbar" }, h("button", { class: "btn ghost sm", onclick: menu }, "← All Games")),
      h("h3", { class: "card-title" }, `${g.icon} ${g.title}`), h("p", { class: "muted" }, "Synced live with your partner"), body);
    g.run(body, ctx, sub);
  }
  ctx.onLeave(() => sub.clear());
  menu();
}

/* ───────────── Couple Questions ───────────── */
const BANK = {
  romantic: ["What's your favourite memory of us so far?", "When did you first realise you were falling for me?", "What small thing do I do that melts you?", "Where would you take me on a perfect date night?", "What song reminds you of us?", "What's one thing you want to hear from me more often?", "What was your first impression of me, honestly?", "Describe our love in three words."],
  deep: ["What's a fear you've never really told me about?", "What does 'home' mean to you?", "What do you need from me when you're stressed?", "What's a dream you gave up on that you'd like back?", "How have you changed since we met?", "What does a good marriage look like to you?", "What are you most proud of about yourself?", "What's one thing you wish I understood better about you?"],
  fun: ["Which of us is the messier one, be honest 😂", "If we swapped lives for a day, what would you do first?", "What's the weirdest thing you've googled lately?", "Pick our couple-movie genre and why.", "What would our reality TV show be called?", "Which food could you never share with me?", "Who would survive longer in a zombie apocalypse?", "Describe me using only emojis."],
  future: ["Where do you see us in 10 years?", "What's one trip we absolutely must take together?", "What's the first thing we should do in our new home?", "What tradition do we start this year?", "What would our dream weekend look like?", "What do you want our kids (or pets!) to learn from us?", "What's one goal we should chase together?", "What does growing old with me look like?"],
};
const MOODS = [["romantic", "💗 Romantic"], ["deep", "🌙 Deep"], ["fun", "😂 Fun"], ["future", "✨ Future"]];

function questions(body, ctx, sub) {
  const ref = doc(db, "games", "questions");
  let state = { mood: "romantic", text: "", byName: "" };
  const card = h("div", { class: "card qcard" }, "Press “Next question” to start.");
  const by = h("p", { class: "muted", style: { textAlign: "center" } });
  const pills = MOODS.map(([id, label]) => h("button", { class: "pill", onclick: () => setDoc(ref, { mood: id }, { merge: true }).catch(() => {}) }, label));
  const next = h("button", { class: "btn primary big", onclick: async () => {
    const pool = BANK[state.mood].filter((q) => q !== state.text);
    const text = pool[Math.floor(Math.random() * pool.length)];
    try { await setDoc(ref, { mood: state.mood, text, byName: ctx.me.name }, { merge: true }); } catch { toast("Couldn't load a question.", "error"); }
  } }, "Next question →");
  body.append(h("div", { class: "pills" }, pills), card, by, h("div", { class: "row", style: { justifyContent: "center" } }, next));
  sub.add(onSnapshot(ref, (snap) => {
    if (snap.exists()) state = { ...state, ...snap.data() };
    pills.forEach((p, i) => p.classList.toggle("on", MOODS[i][0] === state.mood));
    card.textContent = state.text || "Press “Next question” to start.";
    by.textContent = state.byName ? `asked by ${state.byName}` : "";
  }, (e) => toast("Game sync error: " + e.code, "error")));
}

/* ───────────── Tic Tac Toe ───────────── */
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winLine = (b) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
const outcome = (b) => { const l = winLine(b); return l ? b[l[0]] : b.every(Boolean) ? "D" : ""; };

function ttt(body, ctx, sub) {
  const ref = doc(db, "games", "ttt");
  const [px, po] = members;
  const mine = ctx.me.id === px.id ? "X" : "O";
  const fresh = () => ({ board: Array(9).fill(""), turn: "X", winner: "", round: 1, scores: { X: 0, O: 0 } });
  let s = fresh();
  const status = h("div", { class: "status" });
  const sx = h("span"), so = h("span");
  const cells = Array.from({ length: 9 }, (_, i) => h("button", { onclick: () => play(i) }));
  const newBtn = h("button", { class: "btn", onclick: newRound }, "New round");
  body.append(
    h("div", { class: "scores", style: { justifyContent: "center" } },
      h("span", {}, h("i", { class: "dot", style: { "--c": px.color } }), sx), h("span", {}, h("i", { class: "dot", style: { "--c": po.color } }), so)),
    status, h("div", { class: "ttt" }, cells), h("div", { class: "row", style: { justifyContent: "center", marginTop: "14px" } }, newBtn));

  function paint() {
    const wl = winLine(s.board);
    cells.forEach((c, i) => { c.textContent = s.board[i]; c.className = s.board[i] + (wl?.includes(i) ? " win" : ""); c.disabled = !!s.board[i] || !!s.winner; });
    sx.textContent = `${px.name} (X): ${s.scores.X}`; so.textContent = `${po.name} (O): ${s.scores.O}`;
    status.textContent = s.winner === "D" ? "It's a draw 🤍" : s.winner ? `${s.winner === "X" ? px.name : po.name} wins! ✦` : s.turn === mine ? "Your turn" : `${(s.turn === "X" ? px : po).name}'s turn…`;
  }
  async function play(i) {
    try {
      await runTransaction(db, async (t) => {
        const d = (await t.get(ref)).data(); if (!d || d.winner || d.turn !== mine || d.board[i]) return;
        const b = [...d.board]; b[i] = mine; const w = outcome(b);
        const upd = { board: b };
        if (w) { upd.winner = w; if (w !== "D") upd[`scores.${w}`] = increment(1); } else upd.turn = mine === "X" ? "O" : "X";
        t.update(ref, upd);
      });
    } catch { toast("Move failed — check your connection.", "error"); }
  }
  async function newRound() {
    try {
      await runTransaction(db, async (t) => {
        const d = (await t.get(ref)).data() || fresh();
        t.update(ref, { board: Array(9).fill(""), winner: "", round: d.round + 1, turn: (d.round + 1) % 2 ? "X" : "O" });
      });
    } catch { toast("Couldn't start a new round.", "error"); }
  }
  sub.add(onSnapshot(ref, (snap) => {
    if (!snap.exists()) { setDoc(ref, fresh()).catch(() => {}); return; }
    s = { ...fresh(), ...snap.data() }; paint();
  }, (e) => toast("Game sync error: " + e.code, "error")));
  paint();
}

/* ───────────── Snake Showdown ───────────── */
// Each phone runs its own snake with the SAME seed, so the race is fair. Only scores/alive flags go through
// Firestore (a few writes per round) → zero lag, tiny quota use. First time both are out, the round is scored.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function snake(body, ctx, sub) {
  const ref = doc(db, "games", "snake");
  const [A, B] = members, ids = [A.id, B.id];
  const myIdx = ids.indexOf(ctx.me.id), N = 20;
  const size = Math.min(360, Math.floor((Math.min(innerWidth, 420) - 56) / N) * N) || 300, cell = size / N;
  const canvas = h("canvas", { class: "snake", width: size, height: size });
  const g = canvas.getContext("2d");
  const s1 = h("span"), s2 = h("span"), status = h("div", { class: "status" });
  const startBtn = h("button", { class: "btn primary", onclick: startRound }, "Start round");
  body.append(
    h("div", { class: "scores", style: { justifyContent: "center" } },
      h("span", {}, h("i", { class: "dot", style: { "--c": A.color } }), s1), h("span", {}, h("i", { class: "dot", style: { "--c": B.color } }), s2)),
    status, canvas,
    h("p", { class: "muted", style: { textAlign: "center" } }, "WASD / arrow keys, or swipe on the board."),
    h("div", { class: "row", style: { justifyContent: "center" } }, startBtn));

  const fresh = () => ({ round: 0, seed: 0, status: "idle", scores: { [A.id]: 0, [B.id]: 0 }, alive: {}, wins: { [A.id]: 0, [B.id]: 0 }, winner: "" });
  let remote = fresh(), localRound = null, game = null;

  function stopGame() { if (game) { clearInterval(game.iv); clearTimeout(game.cd); removeEventListener("keydown", game.onKey); game = null; } }
  sub.add(stopGame);

  function board() { g.fillStyle = "#060a1c"; g.fillRect(0, 0, size, size); g.strokeStyle = "#ffffff08"; for (let i = 1; i < N; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke(); } }
  board();

  async function startRound() {
    try {
      await updateDoc(ref, { round: increment(1), seed: (Math.random() * 2 ** 31) | 0, status: "playing", scores: { [A.id]: 0, [B.id]: 0 }, alive: { [A.id]: true, [B.id]: true }, winner: "" });
      notifyPartner(ctx, "started a Snake round — jump in! 🐍", "#/games");
    } catch { toast("Couldn't start the round.", "error"); }
  }

  function beginLocal(seed) {
    stopGame();
    const rnd = mulberry32(seed);
    const me = { body: myIdx === 0 ? [{ x: 4, y: 10 }, { x: 3, y: 10 }, { x: 2, y: 10 }] : [{ x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }], dir: { x: myIdx === 0 ? 1 : -1, y: 0 } };
    let queued = null, score = 0, food = null, speed = 125, count = 3;
    const placeFood = () => { for (;;) { const f = { x: (rnd() * N) | 0, y: (rnd() * N) | 0 }; if (!me.body.some((p) => p.x === f.x && p.y === f.y)) return f; } };
    food = placeFood();
    const turn = (dx, dy) => { const cur = queued || me.dir; if (dx === -cur.x && dy === -cur.y) return; queued = { x: dx, y: dy }; };
    const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    const onKey = (e) => { const k = KEYS[e.key] || KEYS[e.key.toLowerCase?.()]; if (k) { e.preventDefault(); turn(...k); } };
    addEventListener("keydown", onKey);
    let tx = 0, ty = 0;
    canvas.ontouchstart = (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; };
    canvas.ontouchend = (e) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
    };

    function draw() {
      board();
      g.fillStyle = "#e4c9a0"; g.beginPath(); g.arc((food.x + 0.5) * cell, (food.y + 0.5) * cell, cell * 0.32, 0, 6.283); g.fill();
      g.fillStyle = ctx.me.color;
      me.body.forEach((p, i) => { g.globalAlpha = i === 0 ? 1 : 0.75; g.fillRect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2); });
      g.globalAlpha = 1;
    }
    function die() {
      clearInterval(game.iv);
      status.textContent = "You're out — waiting for the other player…";
      updateDoc(ref, { [`alive.${ctx.me.id}`]: false, [`scores.${ctx.me.id}`]: score }).catch(() => {});
    }
    function tick() {
      if (queued) { me.dir = queued; queued = null; }
      const head = { x: me.body[0].x + me.dir.x, y: me.body[0].y + me.dir.y };
      const eats = head.x === food.x && head.y === food.y;
      const hitsSelf = me.body.slice(0, eats ? undefined : -1).some((p) => p.x === head.x && p.y === head.y);
      if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || hitsSelf) return die();
      me.body.unshift(head);
      if (eats) {
        score++; food = placeFood(); speed = Math.max(65, speed - 3);
        clearInterval(game.iv); game.iv = setInterval(tick, speed);
        updateDoc(ref, { [`scores.${ctx.me.id}`]: score }).catch(() => {});
      } else me.body.pop();
      draw();
    }
    game = { onKey, iv: 0, cd: 0 };
    draw();
    const countdown = () => {
      if (count > 0) { status.textContent = `Get ready… ${count--}`; game.cd = setTimeout(countdown, 800); }
      else { status.textContent = "Go!"; game.iv = setInterval(tick, speed); }
    };
    countdown();
  }

  async function finalize() {
    try {
      await runTransaction(db, async (t) => {
        const d = (await t.get(ref)).data(); if (!d || d.status !== "playing") return;
        const a = d.scores?.[A.id] || 0, b = d.scores?.[B.id] || 0;
        const winner = a === b ? "draw" : a > b ? A.id : B.id;
        const upd = { status: "done", winner };
        if (winner !== "draw") upd[`wins.${winner}`] = increment(1);
        t.update(ref, upd);
      });
    } catch {}
  }

  function paint() {
    s1.textContent = `${A.name}: ${remote.scores?.[A.id] || 0}  ·  🏆 ${remote.wins?.[A.id] || 0}`;
    s2.textContent = `${B.name}: ${remote.scores?.[B.id] || 0}  ·  🏆 ${remote.wins?.[B.id] || 0}`;
    if (remote.status === "done") status.textContent = remote.winner === "draw" ? "It's a draw 🤍" : `${remote.winner === A.id ? A.name : B.name} wins! 🐍✦`;
    else if (remote.status === "idle") status.textContent = "Press Start round — your partner joins automatically.";
    startBtn.textContent = remote.status === "playing" ? "Restart round" : "Start round";
  }

  sub.add(onSnapshot(ref, (snap) => {
    if (!snap.exists()) { setDoc(ref, fresh()).catch(() => {}); return; }
    remote = { ...fresh(), ...snap.data() };
    if (localRound === null) localRound = remote.round;            // first look: adopt, never auto-start a stale round
    else if (remote.round !== localRound) { localRound = remote.round; if (remote.status === "playing") beginLocal(remote.seed); }
    if (remote.status === "playing" && ids.every((id) => remote.alive?.[id] === false)) finalize();
    paint();
  }, (e) => toast("Game sync error: " + e.code, "error")));
  paint();
}
