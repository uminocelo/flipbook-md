const slideRoot = document.querySelector("#slide");
const titleRoot = document.querySelector("#deck-title");
const counter = document.querySelector("#counter");
const progress = document.querySelector("#progress-bar");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
let presentation;
let current = 0;

async function boot() {
  try {
    const response = await fetch("/api/presentation");
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    presentation = await response.json();
    document.title = `${presentation.title} · Flipbook MD`;
    titleRoot.textContent = presentation.title;
    render();
  } catch (error) {
    slideRoot.innerHTML = `<p class="loading">Could not load this presentation: ${escapeHtml(error.message)}</p>`;
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function render() {
  if (!presentation?.slides?.length) return;
  current = Math.max(0, Math.min(current, presentation.slides.length - 1));
  const slide = presentation.slides[current];
  slideRoot.innerHTML = `<p class="eyebrow">${escapeHtml(presentation.title)}</p>${slide.html}`;
  counter.textContent = `${current + 1} / ${presentation.slides.length}`;
  progress.style.width = `${((current + 1) / presentation.slides.length) * 100}%`;
  previous.disabled = current === 0;
  next.disabled = current === presentation.slides.length - 1;
  document.querySelectorAll(".slide a").forEach(a => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
}
function move(amount) { current += amount; render(); }
previous.addEventListener("click", () => move(-1));
next.addEventListener("click", () => move(1));
document.querySelector("#fullscreen").addEventListener("click", toggleFullscreen);
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}
document.addEventListener("keydown", event => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowRight" || event.key === " ") { event.preventDefault(); move(1); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
  else if (event.key === "Home") { current = 0; render(); }
  else if (event.key === "End") { current = presentation.slides.length - 1; render(); }
  else if (event.key.toLowerCase() === "f") toggleFullscreen();
});
boot();
