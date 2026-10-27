import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadDirectoryProject, loadSingleFile } from "../src/presentation.js";
import { renderExportDocument } from "../src/export.js";
import { startServer } from "../src/server.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("rewrites deck images and attachments from slides/*.slide.md", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.mkdir(path.join(dir, "assets"));
  await fs.writeFile(path.join(dir, "assets", "dot.png"), PNG);
  await fs.writeFile(path.join(dir, "assets", "notes.pdf"), Buffer.from("%PDF-1.1"));
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Assets\nslides:\n  - slides/01-intro.slide.md\n`);
  await fs.writeFile(path.join(dir, "slides", "01-intro.slide.md"), `# Intro\n\n![Dot](assets/dot.png)\n\n[Notes](assets/notes.pdf)\n\n![Remote](https://example.com/a.png)\n\n![Escape](../../secret.png)\n`);
  const deck = await loadDirectoryProject(dir);
  const html = deck.slides[0].html;
  assert.match(html, /src="\/presentation-file\/assets\/dot\.png"/);
  assert.match(html, /href="\/presentation-file\/assets\/notes\.pdf"/);
  assert.match(html, /src="https:\/\/example\.com\/a\.png"/);
  assert.doesNotMatch(html, /presentation-file\/.*secret/);
}));

test("resolves an image relative to the slide file", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "slides", "beside.png"), PNG);
  await fs.writeFile(path.join(dir, "presentation.yml"), `slides:\n  - slides/01-intro.slide.md\n`);
  await fs.writeFile(path.join(dir, "slides", "01-intro.slide.md"), "![Beside](./beside.png)\n");
  const deck = await loadDirectoryProject(dir);
  assert.match(deck.slides[0].html, /src="\/presentation-file\/slides\/beside\.png"/);
}));

test("single-file deck reads assets beside the file", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "assets"));
  await fs.writeFile(path.join(dir, "assets", "dot.png"), PNG);
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# Talk\n\n![Dot](assets/dot.png)\n");
  const deck = await loadSingleFile(path.join(dir, "talk.slide.md"));
  assert.match(deck.slides[0].html, /src="\/presentation-file\/assets\/dot\.png"/);
}));

test("player serves a slide image and export inlines it", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "assets"));
  await fs.writeFile(path.join(dir, "assets", "dot.png"), PNG);
  const outside = path.join(os.tmpdir(), `flipbook-img-${Date.now()}.png`);
  await fs.writeFile(outside, PNG);
  await fs.symlink(outside, path.join(dir, "assets", "escape.png"));
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# Talk\n\n![Dot](assets/dot.png)\n\n![Out](assets/escape.png)\n");
  const deck = await loadSingleFile(path.join(dir, "talk.slide.md"));
  const instance = await startServer(deck);
  try {
    const image = await fetch(`${instance.url}/presentation-file/assets/dot.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const escaped = await fetch(`${instance.url}/presentation-file/assets/escape.png`);
    assert.equal(escaped.status, 403);
    const html = await renderExportDocument(deck, deck.slides[0], 0, { width: 1080, height: 1350, label: "instagram" });
    assert.match(html, /data:image\/png;base64,/);
    assert.doesNotMatch(html, /presentation-file\/assets\/dot\.png/);
  } finally {
    await fs.rm(outside, { force: true });
    await new Promise((resolve) => instance.server.close(resolve));
  }
}));
