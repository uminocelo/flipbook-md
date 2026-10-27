import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadDirectoryProject, loadSingleFile } from "../src/presentation.js";
import { startServer } from "../src/server.js";
import { renderExportDocument } from "../src/export.js";
import { loadThemeCss, rewriteThemeUrls, scopeThemeCss } from "../src/theme.js";

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("scopes :root to the slide host", () => {
  assert.equal(scopeThemeCss(":root { --slide-bg: #fff; }\n:root, h1 {}"), ":host { --slide-bg: #fff; }\n:host, h1 {}");
});

test("rewrites local theme assets and keeps remote urls", () => {
  const css = rewriteThemeUrls(`
    .a { background: url("./fonts/a.woff2"); }
    .b { background: url("https://cdn.example/a.png"); }
    .c { background: url("../secret.png"); }
  `);
  assert.match(css, /url\("\/presentation-file\/fonts\/a\.woff2"\)/);
  assert.match(css, /url\("https:\/\/cdn\.example\/a\.png"\)/);
  assert.match(css, /url\("\.\.\/secret\.png"\)/);
});

test("loads presentation.css for a directory project", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), "title: Themed\nslides:\n  - slides/01.md\n");
  await fs.writeFile(path.join(dir, "slides", "01.md"), "# One");
  await fs.writeFile(path.join(dir, "presentation.css"), ":root { --slide-bg: #abcdef; }\n");
  const deck = await loadDirectoryProject(dir);
  assert.match(deck.themeCss, /:host \{ --slide-bg: #abcdef; \}/);
  assert.equal(deck.root, await fs.realpath(dir));
}));

test("loads presentation.css beside a single-file deck", async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, "demo.slide.md"), "# Hello");
  await fs.writeFile(path.join(dir, "presentation.css"), "h1 { color: #123456; }\n");
  const deck = await loadSingleFile(path.join(dir, "demo.slide.md"));
  assert.match(deck.themeCss, /#123456/);
}));

test("missing presentation.css leaves the built-in palette", async () => fixture(async dir => {
  assert.equal(await loadThemeCss(dir), "");
}));

test("rejects a presentation.css symlink that leaves the deck", async () => fixture(async dir => {
  const outside = path.join(os.tmpdir(), `flipbook-outside-${Date.now()}.css`);
  await fs.writeFile(outside, "h1 { color: red; }");
  try {
    await fs.symlink(outside, path.join(dir, "presentation.css"));
    await assert.rejects(() => loadThemeCss(dir), /outside/);
  } finally {
    await fs.rm(outside, { force: true });
  }
}));

test("allows a presentation.css symlink that stays inside the deck", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "themes"));
  await fs.writeFile(path.join(dir, "themes", "paper.css"), ":host { --slide-bg: #f4efe6; }\n");
  await fs.symlink(path.join(dir, "themes", "paper.css"), path.join(dir, "presentation.css"));
  const css = await loadThemeCss(dir);
  assert.match(css, /#f4efe6/);
}));

test("serves the theme separately from the player controls", async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, "mark.png"), Buffer.from([137, 80, 78, 71]));
  const outside = path.join(os.tmpdir(), `flipbook-asset-${Date.now()}.png`);
  await fs.writeFile(outside, Buffer.from([1]));
  await fs.symlink(outside, path.join(dir, "escape.png"));
  const presentation = {
    title: "Themed",
    theme: "midnight",
    root: dir,
    themeCss: ":host { --slide-bg: #123456; } button { background: #ff00aa !important; } .nav-button { background: #00ff00 !important; } .slide-root { background-image: url(\"./mark.png\"); }",
    slides: [{ index: 0, title: "One", html: "<h1>One</h1>" }]
  };
  const instance = await startServer(presentation);
  try {
    const theme = await fetch(`${instance.url}/presentation.css`).then(response => response.text());
    assert.match(theme, /#123456/);
    assert.match(theme, /\/presentation-file\/mark\.png/);
    const chrome = await fetch(`${instance.url}/styles.css`).then(response => response.text());
    assert.match(chrome, /\.nav-button\{[^}]*background:#151e34/);
    assert.match(chrome, /\.icon-button/);
    assert.doesNotMatch(chrome, /#ff00aa/);
    assert.doesNotMatch(chrome, /#00ff00/);
    const asset = await fetch(`${instance.url}/presentation-file/mark.png`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("content-type"), "image/png");
    const escaped = await fetch(`${instance.url}/presentation-file/escape.png`);
    assert.equal(escaped.status, 403);
    const player = await fetch(`${instance.url}/app.js`).then(response => response.text());
    assert.match(player, /attachShadow/);
    assert.match(player, /ArrowLeft/);
    assert.match(player, /ArrowRight/);
    assert.match(player, /key\.toLowerCase\(\) === "f"/);
  } finally {
    await fs.rm(outside, { force: true });
    await new Promise(resolve => instance.server.close(resolve));
  }
}));

test("export html keeps custom css inside the slide shadow", async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, "mark.png"), Buffer.from([137, 80, 78, 71]));
  const presentation = {
    title: "Themed",
    theme: "paper",
    root: dir,
    themeCss: ":host { --slide-bg: #123456; background: #123456; } h1::before { content: '</style><script>alert(1)</script>'; } .a { background: url(\"./mark.png\"); }",
    slides: [{ index: 0, title: "One", html: "<h1>One</h1>" }]
  };
  const html = await renderExportDocument(presentation, presentation.slides[0], 0, { width: 1080, height: 1350, label: "instagram" });
  const scriptAt = html.indexOf("<script>");
  assert.equal(html.slice(0, scriptAt).includes("#123456"), false);
  assert.match(html, /attachShadow/);
  assert.match(html, /#123456/);
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /<\/style><script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /#previous|#fullscreen|\.nav-button/);
}));
