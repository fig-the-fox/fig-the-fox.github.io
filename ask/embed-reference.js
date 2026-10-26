// Ask Fig embed reference (backlog #17): how a page outside Fig Live runs Ask Fig. It answers only from the
// reviewed engine and card pack Fig Live publishes, each pinned by hash below; if either can't be loaded or
// doesn't match, the page shows "Ask Fig is resting" and answers nothing. Pins: docs/ask-on-build-prompt.md.
const ENGINE_URL = "https://fig-the-fox.github.io/ask/ask-engine.v1.js";
const ENGINE_SRI = "sha384-M6F1xmo+6gZY277avnOW7ipjXqU4yopdPXWe7Ve552ioIIAsZnkMWcUvUUM3Opd3";
const PACK_URL = "https://fig-the-fox.github.io/ask/web4-pack.v1.json";
const PACK_SHA256 = "7d9d6eeaadd660256c211db7dda4db9e1082ffd1a485122ca9547f05e8d08bec";
const DEN_URL = "https://web-4.app/app/FIG/";

const $ = (id) => document.getElementById(id);
function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text; // text only, never HTML
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const link = (href, text) => (/^https:\/\//.test(href) ? el("a", text, { href, target: "_blank", rel: "noopener noreferrer" }) : el("span", text));

function rest(why) {
  $("waking").hidden = true;
  $("ask").hidden = true;
  $("out").replaceChildren();
  $("den").href = DEN_URL;
  $("resting").hidden = false;
  document.body.dataset.state = "resting";
  document.body.dataset.why = why;
}

// The engine is a module script with integrity: the browser runs it only if its bytes match ENGINE_SRI. Once it
// has run, import() of the same URL returns that same checked module from the module map, without fetching again.
function loadEngine() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = ENGINE_URL;
    s.integrity = ENGINE_SRI;
    s.crossOrigin = "anonymous";
    s.onload = () => import(ENGINE_URL).then(resolve, reject);
    s.onerror = () => reject(new Error("engine"));
    document.head.append(s);
  });
}

// The pack is fetched as bytes, hashed, and parsed only if the hash matches.
async function loadPack() {
  const res = await fetch(PACK_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("pack");
  const bytes = await res.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== PACK_SHA256) throw new Error("pack hash");
  return JSON.parse(new TextDecoder().decode(bytes));
}

function start(engine, pack) {
  const index = engine.buildIndex(pack.cards);
  const input = $("q");
  let shown = null; // the question of the answer on screen, re-checked for staleness when the tab comes back

  function show(question) {
    const q = question.trim();
    const r = engine.ask(q, index);
    shown = null;
    if (r.kind === "empty") return $("out").replaceChildren();
    const box = el("article", null, { "data-ask": r.kind });
    if (r.kind === "answer") {
      const card = r.card;
      shown = q;
      box.dataset.cardId = card.id;
      if (!card.questions.some((x) => engine.looseKey(x) === engine.looseKey(q))) box.append(el("p", `Closest answer: ${card.questions[0]}`, { class: "dim" }));
      const label = engine.STATUS_LABEL[card.status];
      if (label) box.append(el("p", label, { class: "dim", "data-status": card.status }));
      box.append(el("p", card.answer, { "data-answer": "" }));
      const stale = engine.isStale(card, Date.now());
      const line = el("p", card.sources.length > 1 ? "Sources: " : "Source: ", { class: stale ? "dim stale" : "dim", "data-sources": "" });
      card.sources.forEach((s, i) => line.append(i ? ", " : "", link(s.url, s.label)));
      line.append(` · checked ${engine.formatDay(card.verified_at)}${stale ? " · may be out of date" : ""}`);
      box.append(line);
    } else if (r.kind === "refused") {
      box.dataset.reason = r.reason;
      box.append(el("p", r.reply, { "data-reply": "" }));
      if (r.reason === "seed") input.value = ""; // don't leave a seed phrase on screen
    } else {
      box.append(el("p", engine.NO_MATCH_TITLE, { "data-reply": "" }));
      // The ask-on-X link opens a post to @AskFigFox without the question: the secret check can miss a real seed
      // phrase ("about" eleven times, then "abuse"), so the question never goes into a link (Codex review).
      const p = el("p", "Or ");
      const guide = engine.NO_MATCH_LINKS[0];
      p.append(link(engine.askOnXUrl(""), "ask @AskFigFox on X"), ". Web4's own guide: ", link(guide.href, guide.label), ".");
      box.append(p);
    }
    $("out").replaceChildren(box);
  }

  for (const s of pack.suggested.slice(0, 3)) {
    const b = el("button", s.question, { type: "button" });
    b.addEventListener("click", () => {
      input.value = s.question;
      show(s.question);
    });
    const li = el("li");
    li.append(b);
    $("chips").append(li);
  }
  // No <form>: a sandboxed page without allow-forms never fires submit, so Enter and the button are wired directly.
  $("go").addEventListener("click", () => show(input.value));
  input.addEventListener("keydown", (e) => e.key === "Enter" && show(input.value));
  document.addEventListener("visibilitychange", () => shown && show(shown));
  $("waking").hidden = true;
  $("ask").hidden = false;
  document.body.dataset.state = "ready";
}

const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000));
Promise.race([Promise.all([loadEngine(), loadPack()]), timeout])
  .then(([engine, pack]) => {
    if (pack?.schema !== "fig-ask-web4-pack" || !Array.isArray(pack.cards) || !Array.isArray(pack.suggested)) throw new Error("pack shape");
    start(engine, pack);
  })
  .catch((e) => rest(e?.message ?? "error"));
