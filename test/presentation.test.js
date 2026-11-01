import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadSingleFile, loadDirectoryProject, discoverPresentation } from "../src/presentation.js";

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("loads a single-file deck and splits slides", async () => fixture(async dir => {
  const file = path.join(dir, "demo.slide.md");
  await fs.writeFile(file, `---\ntitle: Demo Deck\ntheme: midnight\n---\n# First\n\nHello\n\n---\n\n# Second\n\n- item`);
  const deck = await loadSingleFile(file);
  assert.equal(deck.title, "Demo Deck");
  assert.equal(deck.slides.length, 2);
  assert.match(deck.slides[0].html, /First/);
  assert.match(deck.slides[1].html, /<li>item<\/li>/);
}));

test("sanitizes script tags from markdown HTML", async () => fixture(async dir => {
  const file = path.join(dir, "safe.slide.md");
  await fs.writeFile(file, `# Safe\n\n<script>alert(1)</script><img src=x onerror=alert(1)>`);
  const deck = await loadSingleFile(file);
  assert.doesNotMatch(deck.slides[0].html, /<script/i);
  assert.doesNotMatch(deck.slides[0].html, /onerror/i);
}));

test("loads directory project slides in manifest order", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Directory Deck\nslides:\n  - slides/02.md\n  - slides/01.md\n`);
  await fs.writeFile(path.join(dir, "slides", "01.md"), "# One");
  await fs.writeFile(path.join(dir, "slides", "02.md"), "# Two");
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.title, "Directory Deck");
  assert.match(deck.slides[0].html, /Two/);
  assert.match(deck.slides[1].html, /One/);
}));

test("rejects manifest slide paths that escape project root", async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, "outside.md"), "# Outside");
  await fs.writeFile(path.join(dir, "presentation.yml"), `slides:\n  - ../outside.md\n`);
  await assert.rejects(() => loadDirectoryProject(dir), /escapes/);
}));

test("reads a template from frontmatter, a comment, and a single-file deck", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Templates\nslides:\n  - slides/01-cover.md\n  - slides/02-summary.md\n  - slides/03-flow.md\n`);
  await fs.writeFile(path.join(dir, "slides", "01-cover.md"), `---\ntemplate: cover\n---\n<!-- template: summary -->\n# Cover\n`);
  await fs.writeFile(path.join(dir, "slides", "02-summary.md"), `<!-- template: summary -->\n# Summary\n`);
  await fs.writeFile(path.join(dir, "slides", "03-flow.md"), `# Flow\n\nHello\n`);
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.slides[0].template, "cover");
  assert.equal(deck.slides[1].template, "summary");
  assert.equal(deck.slides[2].template, "flow");
  assert.match(deck.slides[0].html, /Cover/);
  assert.doesNotMatch(deck.slides[0].html, /template/);
  assert.doesNotMatch(deck.slides[1].html, /template/);
  assert.match(deck.slides[2].html, /Flow/);
  assert.match(deck.slides[2].html, /Hello/);

  const file = path.join(dir, "mixed.slide.md");
  await fs.writeFile(file, `---\ntitle: Mixed\n---\n# First\n\nHello\n\n---\n\n<!-- template: summary -->\n# Second\n`);
  const single = await loadSingleFile(file);
  assert.equal(single.slides[0].template, "flow");
  assert.equal(single.slides[1].template, "summary");
  assert.match(single.slides[1].html, /Second/);
  assert.doesNotMatch(single.slides[1].html, /template/);
}));

test("rejects an unknown template and names the slide", async () => fixture(async dir => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), `slides:\n  - slides/01.md\n`);
  await fs.writeFile(path.join(dir, "slides", "01.md"), `---\ntemplate: poster\n---\n# Nope\n`);
  await assert.rejects(() => loadDirectoryProject(dir), /Slide 1 uses unknown template "poster"/);

  const file = path.join(dir, "bad.slide.md");
  await fs.writeFile(file, `# First\n\n---\n\n<!-- template: poster -->\n# Second\n`);
  await assert.rejects(() => loadSingleFile(file), /Slide 2 uses unknown template "poster"/);
}));

test("discovers a single-file deck in a directory", async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, "z.slide.md"), "# Z");
  await fs.writeFile(path.join(dir, "a.slide.md"), "# A");
  const deck = await discoverPresentation(dir);
  assert.equal(deck.title, "a");
  assert.equal(deck.slides.length, 1);
}));
