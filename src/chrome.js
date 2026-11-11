import fs from "node:fs/promises";
import { assetMime, resolveThemeAsset } from "./theme.js";
import { deckTemplateCss } from "./templates.js";

const CORNERS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const COUNTER_LINES = new Set(["solid", "dashed", "dotted"]);
const LINE_ALIGNS = new Set(["top", "middle", "bottom"]);
const BAND_LINES = new Set(["straight", "dashed", "dotted", "solid"]);
const SHAPES = ["circle", "triangle", "square", "pentagram", "hexagram", "heptagram", "octagram", "nonagram"];
const SHAPE_SET = new Set(SHAPES);

export function parseChrome(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("chrome must be a mapping.");
  }
  if (!value.counter) throw new Error("chrome.counter is required.");
  return {
    counter: parseCounter(value.counter),
    header: parseBand(value.header, "header"),
    footer: parseBand(value.footer, "footer")
  };
}

export function mergeChrome(base, override) {
  if (!base && !override) return null;
  if (!override) return base;
  if (!base) return override;
  return {
    counter: { ...(base.counter ?? {}), ...(override.counter ?? {}) },
    header: override.header !== undefined ? override.header : base.header,
    footer: override.footer !== undefined ? override.footer : base.footer
  };
}

export function showsPageCounter(slide) {
  if (!slide) return false;
  if (slide.role === "cover" || slide.template === "cover" || slide.type === "cover") return false;
  return true;
}

export function counterNumbers(slides) {
  let count = 0;
  return slides.map((slide) => {
    if (!slide.showCounter) return null;
    count += 1;
    return String(count).padStart(2, "0");
  });
}

export function bandHtml(band, edge) {
  if (!band) return "";
  if (band.kind === "line") {
    return `<div class="chrome-band chrome-${edge}" data-kind="line" data-line="${band.line}"></div>`;
  }
  const shape = shapeSvg(band.shape);
  const row = Array.from({ length: 16 }, () => shape).join("");
  return `<div class="chrome-band chrome-${edge}" data-kind="shapes" data-shape="${band.shape}" aria-hidden="true"><span class="chrome-shapes">${row}</span></div>`;
}

export function counterHtml(counter, number, ornament) {
  const full = counter.lineLength === "100%";
  const mark = `<span class="page-counter-mark">${escapeHtml(number)}</span><span class="page-counter-line"></span>`;
  const end = ornamentHtml(ornament);
  return `<div class="page-counter" data-corner="${counter.corner}" data-line="${counter.line}" data-line-align="${counter.lineAlign}" data-length="${full ? "full" : "custom"}" style="--counter-line-length:${counter.lineLength}">${mark}${end}</div>`;
}

export function shapeSvg(name) {
  return `<svg class="chrome-shape" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">${shapeBody(name)}</svg>`;
}

export function layoutCss(hostSelector) {
  const root = hostSelector;
  let css = "";
  if (hostSelector === ".slide-root") {
    css += ":host:has(.slide-root[data-layout]){height:min(92vh,920px);position:relative}";
    css += ".slide-root[data-layout]{height:100%}";
  }
  css += `${root}[data-layout]{display:flex;flex-direction:column;min-height:0}`;
  css += `${root}[data-layout] .slide-body{flex:1 1 auto;min-height:0;width:100%;grid-column:auto;grid-row:auto;align-self:stretch;justify-self:stretch}`;
  css += `${root}[data-layout="poster"] .eyebrow{display:none}`;
  css += `${root}[data-layout="poster"] .slide-body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;gap:.6rem}`;
  css += `${root}[data-layout="poster"] .slide-body img{order:-1;width:min(86%,820px);height:auto;max-height:54%;aspect-ratio:4/5;object-fit:contain;flex:0 1 54%;margin:0}`;
  css += `${root}[data-layout="poster"] .slide-body h1{margin:0}`;
  css += `${root}[data-layout="list"] .slide-body ul,${root}[data-layout="list"] .slide-body ol{list-style:none;padding:0;margin:.2em 0 0}`;
  css += `${root}[data-layout="list"] .slide-body li{border-bottom:1px solid var(--slide-line);padding:.55em 0}`;
  css += `${root}[data-density="short"] .slide-body li{font-size:1.05em;margin:.65em 0}`;
  css += `${root}[data-density="medium"] .slide-body li{font-size:.92em;margin:.38em 0}`;
  css += `${root}[data-layout="media"] .slide-body{display:flex;flex-direction:column;height:100%}`;
  css += `${root}[data-layout="media"] .slide-body img{width:100%;height:34%;max-height:34%;object-fit:contain;flex:0 0 34%;background:color-mix(in srgb, var(--slide-line) 42%, transparent);border-radius:18px}`;
  css += `${root}[data-layout="quote"] .slide-body{display:flex;flex-direction:column;justify-content:center}`;
  css += `${root}[data-layout="quote"] .slide-body blockquote{border:0;background:transparent;padding:0;margin:0;font-size:1.45em;line-height:1.25;color:var(--slide-text)}`;
  css += `${root}[data-layout="quote"] .slide-body blockquote p{color:var(--slide-text)}`;
  css += `${root} .callout{border:1px solid var(--slide-line);border-left:5px solid var(--slide-accent);background:color-mix(in srgb, var(--slide-accent) 12%, transparent);border-radius:16px;padding:.9em 1.05em;margin:1em 0 0}`;
  css += `${root}[data-layout="callout"] .slide-body{display:flex;flex-direction:column;justify-content:center}`;
  css += `${root}[data-layout="callout"] .callout{margin:0;font-size:1.2em}`;
  css += ".callout-label{display:block;margin:0 0 .4em;color:var(--slide-accent);font-size:.72em;font-weight:800;letter-spacing:.16em;text-transform:uppercase}";
  css += `${root}[data-layout="timeline"] .slide-body ol{list-style:none;margin:.4em 0 0;padding:0 0 0 1.35em;border-left:2px solid var(--slide-accent)}`;
  css += `${root}[data-layout="timeline"] .slide-body li{position:relative;margin:0 0 .85em;padding:0}`;
  css += `${root}[data-layout="timeline"] .slide-body li::before{content:"";position:absolute;left:-1.58em;top:.4em;width:.72em;height:.72em;border-radius:50%;background:var(--slide-accent);box-shadow:0 0 0 4px color-mix(in srgb, var(--slide-accent) 25%, transparent)}`;
  css += `${root}[data-layout="content"] .slide-body{display:flex;flex-direction:column;height:100%}`;
  css += `${root}[data-layout="content"] .slide-body img{width:100%;height:28%;max-height:28%;object-fit:contain;flex:0 0 28%;border-radius:16px}`;
  return css;
}

export function chromeCss() {
  return ".chrome-band{color:var(--slide-accent);line-height:0}"
    + ".chrome-header{margin:0 0 .9em}.chrome-footer{margin:.9em 0 0}"
    + ".chrome-band[data-kind=\"line\"]{border-top:2px solid var(--slide-accent);height:0}"
    + ".chrome-band[data-line=\"dashed\"]{border-top-style:dashed}"
    + ".chrome-band[data-line=\"dotted\"]{border-top-style:dotted}"
    + ".chrome-band[data-line=\"straight\"]{border-top-style:solid}"
    + ".chrome-shapes{display:flex;justify-content:space-between;align-items:center;width:100%;gap:.35em}"
    + ".chrome-shape{width:1.05em;height:1.05em;flex:none;display:block}"
    + ".chrome-band[data-kind=\"shapes\"]{font-size:1.15em}"
    + ".page-counter{position:absolute;z-index:2;display:flex;gap:.65em;color:var(--slide-text);font-size:1.15rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.04em;pointer-events:none}"
    + ".page-counter[data-line-align=\"top\"]{align-items:flex-start}"
    + ".page-counter[data-line-align=\"middle\"]{align-items:center}"
    + ".page-counter[data-line-align=\"bottom\"]{align-items:flex-end}"
    + ".page-counter[data-corner=\"bottom-left\"]{left:var(--chrome-pad,7%);bottom:var(--chrome-pad,4.2%)}"
    + ".page-counter[data-corner=\"bottom-right\"]{right:var(--chrome-pad,7%);bottom:var(--chrome-pad,4.2%)}"
    + ".page-counter[data-corner=\"top-left\"]{left:var(--chrome-pad,7%);top:var(--chrome-pad,4.2%)}"
    + ".page-counter[data-corner=\"top-right\"]{right:var(--chrome-pad,7%);top:var(--chrome-pad,4.2%)}"
    + ".page-counter[data-corner$=\"right\"] .page-counter-ornament{order:1}"
    + ".page-counter[data-corner$=\"right\"] .page-counter-line{order:2}"
    + ".page-counter[data-corner$=\"right\"] .page-counter-mark{order:3}"
    + ".page-counter[data-length=\"full\"]{left:var(--chrome-pad,7%);right:var(--chrome-pad,7%)}"
    + ".page-counter[data-length=\"full\"] .page-counter-line{flex:1 1 auto;width:auto}"
    + ".page-counter-line{width:var(--counter-line-length);border-top:2px solid var(--slide-accent);height:0}"
    + ".page-counter[data-line=\"dashed\"] .page-counter-line{border-top-style:dashed}"
    + ".page-counter[data-line=\"dotted\"] .page-counter-line{border-top-style:dotted}"
    + ".page-counter[data-line=\"solid\"] .page-counter-line{border-top-style:solid}"
    + ".page-counter-ornament{height:1em;width:auto;max-width:1.4em;object-fit:contain;font-size:1em;line-height:1}"
    + ".page-counter-mark{line-height:1}"
    + ".page-counter[data-length=\"custom\"]{width:var(--counter-line-length)}"
    + ".page-counter[data-length=\"custom\"] .page-counter-line{flex:1 1 auto;width:auto}";
}

export function exportChromeCss(preset, chrome) {
  const px = (value) => Math.round(value * (preset.scale ?? 1));
  const corner = chrome?.counter?.corner ?? "";
  let css = `:host{--chrome-pad:${px(72)}px}`;
  css += `.page-counter{font-size:${px(32)}px}`;
  css += `.chrome-band[data-kind="shapes"]{font-size:${px(26)}px}`;
  css += `.chrome-header{margin-bottom:${px(32)}px}.chrome-footer{margin-top:${px(32)}px}`;
  if (corner.startsWith("top")) css += `:host{padding-top:${px(168)}px}`;
  if (corner.startsWith("bottom")) css += `:host{padding-bottom:${px(150)}px}`;
  const poster = px(720);
  const media = px(340);
  const content = px(280);
  css += `.content[data-layout="poster"] .slide-body img{height:${poster}px;max-height:${poster}px;flex:0 1 ${poster}px}`;
  css += `.content[data-layout="media"] .slide-body img{height:${media}px;max-height:${media}px;flex:0 0 ${media}px}`;
  css += `.content[data-layout="content"] .slide-body img{height:${content}px;max-height:${content}px;flex:0 0 ${content}px}`;
  return css;
}

export function surfaceCss(presentation, hostSelector, preset) {
  const templates = presentation.templates ?? {};
  let css = deckTemplateCss(hostSelector, templates);
  const laidOut = Object.values(templates).some((template) => template?.layout);
  if (laidOut || presentation.chrome) css += layoutCss(hostSelector);
  if (presentation.chrome) {
    css += chromeCss();
    if (preset) css += exportChromeCss(preset, presentation.chrome);
  }
  return css;
}

export function playerOrnament(ornament) {
  if (!ornament) return null;
  if (ornament.kind !== "asset") return ornament;
  const encoded = ornament.src.split("/").map((part) => encodeURIComponent(part)).join("/");
  return { kind: "url", src: `/presentation-file/${encoded}` };
}

export async function exportOrnament(ornament, root) {
  if (!ornament || ornament.kind !== "asset") return ornament ?? null;
  const file = await resolveThemeAsset(root, ornament.src);
  if (!file) throw new Error(`Page counter ornament was not found: ${ornament.src}`);
  const data = await fs.readFile(file);
  return { kind: "url", src: `data:${assetMime(file)};base64,${data.toString("base64")}` };
}

function parseCounter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("chrome.counter must be a mapping.");
  }
  const corner = token(value.corner, CORNERS, "chrome.counter.corner", "top-left, top-right, bottom-left, or bottom-right");
  const line = token(value.line, COUNTER_LINES, "chrome.counter.line", "solid, dashed, or dotted");
  const lineAlign = token(value.line_align, LINE_ALIGNS, "chrome.counter.line_align", "top, middle, or bottom");
  const lineLength = parseLength(value.line_length);
  const ornament = parseOrnament(value.ornament);
  return { corner, line, lineAlign, lineLength, ornament };
}

function parseBand(value, field) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`chrome.${field} must be a mapping.`);
  }
  const kind = String(value.kind ?? "").trim();
  if (kind === "none" || kind === "") return null;
  if (kind === "line") {
    const line = String(value.line ?? "straight").trim();
    if (!BAND_LINES.has(line)) {
      throw new Error(`chrome.${field}.line must be straight, dashed, or dotted.`);
    }
    return { kind: "line", line: line === "solid" ? "straight" : line };
  }
  if (kind === "shapes") {
    const shape = String(value.shape ?? "").trim();
    if (!SHAPE_SET.has(shape)) {
      throw new Error(`chrome.${field}.shape must be one of ${SHAPES.join(", ")}.`);
    }
    return { kind: "shapes", shape };
  }
  throw new Error(`chrome.${field}.kind must be line, shapes, or none.`);
}

function parseLength(value) {
  const text = String(value ?? "").trim();
  if (/^\d+(\.\d+)?(%|px)$/.test(text)) return text;
  throw new Error("chrome.counter.line_length must be a percent or px value, such as 100% or 240px.");
}

function parseOrnament(value) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (/^https:\/\//i.test(text)) return { kind: "url", src: text };
  if (/^[a-zA-Z0-9._/-]+\.(?:gif|png|jpe?g|svg|webp|avif)$/.test(text) && !text.split("/").includes("..")) {
    return { kind: "asset", src: text };
  }
  if (text.length > 4 || /[<>&"'`]/.test(text)) {
    throw new Error("chrome.counter.ornament must be a short glyph or an image path.");
  }
  return { kind: "glyph", text };
}

function token(value, allowed, field, expected) {
  const text = String(value ?? "").trim();
  if (!allowed.has(text)) throw new Error(`${field} must be ${expected}.`);
  return text;
}

function ornamentHtml(ornament) {
  if (!ornament) return "";
  if (ornament.kind === "glyph") return `<span class="page-counter-ornament">${escapeHtml(ornament.text)}</span>`;
  return `<img class="page-counter-ornament" src="${escapeHtml(ornament.src)}" alt="">`;
}

function shapeBody(name) {
  if (name === "circle") return `<circle cx="12" cy="12" r="7"/>`;
  if (name === "square") return `<rect x="5" y="5" width="14" height="14"/>`;
  if (name === "triangle") return regularPolygon(3, 9, -Math.PI / 2);
  if (name === "pentagram") return starPolygon(5, 2, 10);
  if (name === "hexagram") return regularPolygon(3, 9, -Math.PI / 2) + regularPolygon(3, 9, Math.PI / 2);
  if (name === "heptagram") return starPolygon(7, 2, 10);
  if (name === "octagram") return starPolygon(8, 3, 10);
  if (name === "nonagram") return starPolygon(9, 2, 10);
  return "";
}

function regularPolygon(sides, radius, rotation) {
  return `<polygon points="${points(sides, 1, radius, rotation)}"/>`;
}

function starPolygon(sides, step, radius) {
  return `<polygon points="${points(sides, step, radius, -Math.PI / 2)}"/>`;
}

function points(count, step, radius, rotation) {
  const coords = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rotation + (index * step * 2 * Math.PI) / count;
    coords.push(`${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(" ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
