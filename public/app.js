const slideRoot = document.querySelector("#slide");
const titleRoot = document.querySelector("#deck-title");
const counter = document.querySelector("#counter");
const progress = document.querySelector("#progress-bar");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const playButton = document.querySelector("#play");
const notesRoot = document.querySelector("#notes");
const tabId = Math.random().toString(36).slice(2);
let channel = null;
try { channel = new BroadcastChannel("flipbook-md"); } catch { channel = null; }

let presentation;
let current = 0;
let playing = false;
let leader = false;
let timer = null;
let pendingRemote = null;
let shown = null;

function mountSlide() {
  if (slideRoot.shadowRoot) return slideRoot.shadowRoot;
  const shadow = slideRoot.attachShadow({ mode: "open" });
  const base = document.createElement("link");
  base.rel = "stylesheet";
  base.href = "/slide.css";
  const templates = document.createElement("link");
  templates.rel = "stylesheet";
  templates.href = "/templates.css";
  const theme = document.createElement("link");
  theme.rel = "stylesheet";
  theme.href = "/presentation.css";
  const article = document.createElement("article");
  article.className = "slide-root";
  article.setAttribute("aria-live", "polite");
  shadow.append(base, templates, theme, article);
  return shadow;
}

function intervalMs() {
  const seconds = Number(presentation?.playback?.interval);
  const safe = Number.isFinite(seconds) && seconds > 0 && seconds <= 600 ? seconds : 5;
  return safe * 1000;
}

function remember() {
  try {
    localStorage.setItem("flipbook-index", String(current));
  } catch {
    // Private mode can reject storage. The deck still plays in this tab.
  }
}

function restoreIndex() {
  try {
    const raw = localStorage.getItem("flipbook-index");
    const saved = Number(raw);
    if (raw != null && Number.isInteger(saved)) current = saved;
  } catch {
    // Ignore storage failures and start at the first slide.
  }
}

function publish() {
  channel?.postMessage({ tab: tabId, index: current, playing: Boolean(playing && leader) });
  remember();
}

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function syncPlayButton() {
  if (!playButton || !presentation?.slides?.length) return;
  const atEnd = current >= presentation.slides.length - 1;
  playButton.disabled = atEnd && !playing;
  playButton.setAttribute("aria-pressed", playing ? "true" : "false");
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  const label = document.createElement("span");
  label.textContent = playing ? "Pause" : "Play";
  playButton.replaceChildren(document.createTextNode(playing ? "❚❚ " : "▶ "), label);
}

function setData(article, name, value) {
  if (value) article.setAttribute(`data-${name}`, value);
  else article.removeAttribute(`data-${name}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderNotes(slide) {
  if (!notesRoot) return;
  notesRoot.innerHTML = slide.notesHtml || `<p class="notes-empty">No notes for this slide.</p>`;
}

// The new slide animates in. `delta` is how far the deck moved, so a slide enters from the side it came from.
function animateIn(article, delta) {
  const transition = presentation.playback?.transition;
  if (!delta || !transition || transition.type === "none" || !article.animate) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const ms = Math.min(5, Math.max(0, Number(transition.duration) || 0)) * 1000;
  if (!ms) return;
  article.getAnimations().forEach((animation) => animation.cancel());
  const frames = transition.type === "slide"
    ? [{ opacity: 0, transform: `translateX(${delta > 0 ? 8 : -8}%)` }, { opacity: 1, transform: "translateX(0)" }]
    : [{ opacity: 0 }, { opacity: 1 }];
  article.animate(frames, { duration: ms, easing: "ease-out" });
}

function render() {
  if (!presentation?.slides?.length) return;
  current = Math.max(0, Math.min(current, presentation.slides.length - 1));
  const slide = presentation.slides[current];
  const shadow = mountSlide();
  const article = shadow.querySelector(".slide-root");
  article.setAttribute("data-template", slide.template || "flow");
  setData(article, "layout", slide.layout);
  setData(article, "role", slide.role);
  setData(article, "density", slide.density);
  const header = presentation.chromeHtml?.header ?? "";
  const footer = presentation.chromeHtml?.footer ?? "";
  article.innerHTML = `${header}<p class="eyebrow">${escapeHtml(presentation.title)}</p><div class="slide-body">${slide.html}</div>${footer}${slide.counterHtml ?? ""}`;
  counter.textContent = `${current + 1} / ${presentation.slides.length}`;
  progress.style.width = `${((current + 1) / presentation.slides.length) * 100}%`;
  previous.disabled = current === 0;
  next.disabled = current === presentation.slides.length - 1;
  animateIn(article, shown == null ? 0 : current - shown);
  shown = current;
  renderNotes(slide);
  syncPlayButton();
  shadow.querySelectorAll("a").forEach((anchor) => {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });
}

function go(index) {
  if (!presentation?.slides?.length) return;
  current = index;
  render();
  if (playing) {
    clearTimer();
    if (current >= presentation.slides.length - 1) {
      playing = false;
      leader = false;
    } else {
      leader = true;
      timer = setInterval(tick, intervalMs());
    }
    syncPlayButton();
  }
  publish();
}

function setPlaying(next) {
  if (!presentation?.slides?.length) return;
  clearTimer();
  if (next && current < presentation.slides.length - 1) {
    playing = true;
    leader = true;
    timer = setInterval(tick, intervalMs());
  } else {
    playing = false;
    leader = false;
  }
  syncPlayButton();
  publish();
}

function tick() {
  if (!leader || !playing) return;
  current += 1;
  render();
  if (current >= presentation.slides.length - 1) {
    clearTimer();
    playing = false;
    leader = false;
    syncPlayButton();
  }
  publish();
}

function applyRemote(message) {
  if (!presentation?.slides?.length) {
    pendingRemote = message;
    return;
  }
  if (!Number.isInteger(message.index)) return;
  clearTimer();
  leader = false;
  current = message.index;
  playing = Boolean(message.playing);
  render();
  remember();
}

channel?.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.tab === tabId) return;
  if (message.type === "hello") {
    if (leader) publish();
    return;
  }
  applyRemote(message);
});

// The tab that runs the timer tells the others to stop when it closes or reloads,
// so they do not keep showing Pause with nothing advancing.
window.addEventListener("pagehide", () => {
  if (!leader || !playing) return;
  clearTimer();
  playing = false;
  leader = false;
  publish();
});

async function boot() {
  try {
    const response = await fetch("/api/presentation");
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    presentation = await response.json();
    document.title = `${presentation.title} · Flipbook MD`;
    titleRoot.textContent = presentation.title;
    if (pendingRemote) {
      const message = pendingRemote;
      pendingRemote = null;
      applyRemote(message);
    } else {
      restoreIndex();
      render();
    }
    channel?.postMessage({ tab: tabId, type: "hello" });
  } catch (error) {
    slideRoot.innerHTML = `<p class="loading">Could not load this presentation: ${escapeHtml(error.message)}</p>`;
  }
}

previous?.addEventListener("click", () => go(current - 1));
next?.addEventListener("click", () => go(current + 1));
playButton?.addEventListener("click", () => setPlaying(!playing));
document.querySelector("#fullscreen")?.addEventListener("click", toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

document.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (!presentation?.slides?.length) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    go(current + 1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    go(current - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    go(0);
  } else if (event.key === "End") {
    event.preventDefault();
    go(presentation.slides.length - 1);
  } else if (event.key.toLowerCase() === "p") {
    event.preventDefault();
    setPlaying(!playing);
  } else if (event.key.toLowerCase() === "f") {
    toggleFullscreen();
  }
});

boot();
