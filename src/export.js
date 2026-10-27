import fs from "node:fs/promises";
import path from "node:path";
import { cssForStyleTag, inlineThemeAssets } from "./theme.js";
import { inlinePresentationFiles } from "./attachments.js";

const PRESETS = {
  instagram: { width: 1080, height: 1350, label: "instagram" },
  x: { width: 1080, height: 1080, label: "x" }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function themeColors(theme) {
  const themes = {
    midnight: { bg: "#0b1020", panel: "#121a2e", text: "#f3f6ff", muted: "#a5b1ca", accent: "#7c9cff", line: "#2a3652" },
    light: { bg: "#f5f7fb", panel: "#ffffff", text: "#172033", muted: "#566176", accent: "#315ee8", line: "#dce2ed" },
    paper: { bg: "#f4efe5", panel: "#fffaf0", text: "#28251f", muted: "#71695e", accent: "#b14e35", line: "#ded4c5" },
    forest: { bg: "#0d1915", panel: "#14251e", text: "#effaf1", muted: "#a6c0ae", accent: "#70d49a", line: "#2a4838" }
  };
  return themes[String(theme).toLowerCase()] ?? themes.midnight;
}

function embedScriptString(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function exportBaseCss(height, c) {
  const title = height < 1200 ? 57 : 64;
  const body = height < 1200 ? 29 : 32;
  const padTop = height < 1200 ? 76 : 94;
  return `:host{--slide-bg:${c.bg};--slide-text:${c.text};--slide-muted:${c.muted};--slide-accent:${c.accent};--slide-mint:${c.accent};--slide-heading:${c.text};--slide-line:${c.line};--slide-code:${c.panel};box-sizing:border-box;padding:${padTop}px 86px 66px;position:relative;background:radial-gradient(ellipse at 90% 0%, color-mix(in srgb, var(--slide-accent) 13%, transparent), transparent 42%), var(--slide-bg);color:var(--slide-text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*,*::before,*::after{box-sizing:border-box}
.top{display:flex;align-items:center;justify-content:space-between;color:var(--slide-muted);font-size:21px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;gap:24px}
.brand{color:var(--slide-text)}.brand span{color:var(--slide-accent)}
.rule{height:2px;background:var(--slide-line);margin:28px 0 40px}
.content{flex:1;min-height:0;overflow:hidden;font-size:${body}px;line-height:1.42;overflow-wrap:anywhere}
.content h1{font-size:${title}px;line-height:1.08;letter-spacing:-.045em;margin:0 0 34px;font-weight:800}
.content h2{font-size:1.3em;line-height:1.15;margin:0 0 25px;letter-spacing:-.025em}
.content h3{font-size:1.05em;margin:22px 0 12px;color:var(--slide-heading)}
.content p{margin:0 0 23px}
.content ul,.content ol{padding-left:1.2em;margin:0 0 24px}
.content li{padding-left:.18em;margin:.32em 0}
.content strong{color:var(--slide-accent)}
.content a{color:var(--slide-accent);text-decoration:none}
.content blockquote{border-left:5px solid var(--slide-accent);padding:5px 0 5px 24px;margin:24px 0;color:var(--slide-muted)}
.content code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.78em;background:var(--slide-code);border:1px solid var(--slide-line);border-radius:8px;padding:.1em .28em}
.content pre{background:var(--slide-code);border:1px solid var(--slide-line);border-radius:16px;padding:24px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.72em;line-height:1.45;max-height:100%;overflow:hidden}
.content pre code{padding:0;border:0;background:transparent;font-size:1em}
.content table{width:100%;border-collapse:collapse;font-size:.78em}
.content th,.content td{text-align:left;padding:12px;border-bottom:1px solid var(--slide-line)}
.content img{max-width:100%;max-height:360px;object-fit:contain}
.content hr{border:0;border-top:1px solid var(--slide-line);margin:25px 0}
.footer{display:flex;justify-content:space-between;align-items:center;gap:18px;color:var(--slide-muted);font-size:19px;margin-top:28px;padding-top:20px;border-top:1px solid var(--slide-line)}
.counter{color:var(--slide-text);font-variant-numeric:tabular-nums;font-weight:700}`;
}

export async function renderExportDocument(presentation, slide, index, preset) {
  const colors = themeColors(presentation.theme);
  const { width, height } = preset;
  const themeCss = cssForStyleTag(await inlineThemeAssets(presentation.themeCss || "", presentation.root));
  const base = cssForStyleTag(exportBaseCss(height, colors));
  const slideHtml = await inlinePresentationFiles(slide.html, presentation.root);
  const inner = `<div class="top"><div class="brand">FLIPBOOK <span>MD</span></div><div>${escapeHtml(presentation.title)}</div></div><div class="rule"></div><main class="content">${slideHtml}</main><div class="footer"><span>Made with Flipbook MD</span><span class="counter">${String(index + 1).padStart(2, "0")} / ${String(presentation.slides.length).padStart(2, "0")}</span></div>`;
  const payload = `<style>@layer base{${base}}</style>${themeCss ? `<style>${themeCss}</style>` : ""}${inner}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${colors.bg}}#canvas{box-sizing:border-box!important;width:${width}px!important;height:${height}px!important;display:flex!important;flex-direction:column!important}</style></head><body><div id="canvas" class="canvas"></div><script>document.getElementById("canvas").attachShadow({mode:"open"}).innerHTML=${embedScriptString(payload)};</script></body></html>`;
}

export async function exportCarousel(presentation, { preset: presetName = "instagram", outputDir = "dist/carousel" } = {}) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset "${presetName}". Choose "instagram" (1080×1350) or "x" (1080×1080).`);
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { throw new Error('Carousel image export needs Playwright. Run "npm install" and then "npx playwright install chromium".'); }
  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: preset.width, height: preset.height }, deviceScaleFactor: 1 });
    for (const [index, slide] of presentation.slides.entries()) {
      await page.setContent(await renderExportDocument(presentation, slide, index, preset), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const slug = String(slide.title || "slide").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "slide";
      await page.locator("#canvas").screenshot({ path: path.join(absoluteOutput, `${String(index + 1).padStart(2, "0")}-${slug}.png`), animations: "disabled" });
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(absoluteOutput, "README.txt"), `Exported by Flipbook MD\nPresentation: ${presentation.title}\nPreset: ${preset.label}\nDimensions: ${preset.width}x${preset.height}\nSlides: ${presentation.slides.length}\n\nUpload the PNG files in numeric order as a multi-image post. Check the platform's current image limits and cropping rules before publishing.\n`);
  return { count: presentation.slides.length, preset: preset.label, width: preset.width, height: preset.height, outputDir: absoluteOutput };
}
