import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { discoverPresentation, loadDirectoryProject, loadSingleFile } from "../src/presentation.js";
import { startServer } from "../src/server.js";

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

const noted = `---
title: Noted
---
# Alpha Slide

People can read this.

<!-- notes:
<script>alert(1)</script>
Say the **quiet** part.
---
still the note
-->

---

# Beta Slide

The middle.

---

# Gamma Slide

The end.

<!-- notes: Only the third. -->
`;

test("keeps speaker notes out of the slide and out of the slide split", async () => fixture(async (dir) => {
  const file = path.join(dir, "talk.slide.md");
  await fs.writeFile(file, noted);
  const deck = await loadSingleFile(file);
  assert.equal(deck.slides.length, 3);
  assert.match(deck.slides[0].html, /Alpha Slide/);
  assert.match(deck.slides[0].html, /People can read this/);
  assert.doesNotMatch(deck.slides[0].html, /quiet/);
  assert.doesNotMatch(deck.slides[0].html, /still the note/);
  assert.doesNotMatch(deck.slides[0].html, /<script/i);
  assert.match(deck.slides[0].notesHtml, /quiet/);
  assert.match(deck.slides[0].notesHtml, /<strong>quiet<\/strong>/);
  assert.match(deck.slides[0].notesHtml, /still the note/);
  assert.doesNotMatch(deck.slides[0].notesHtml, /<script/i);
  assert.equal(deck.slides[1].notesHtml, "");
  assert.match(deck.slides[2].notesHtml, /Only the third/);
  assert.doesNotMatch(deck.slides[2].html, /Only the third/);
}));

test("joins frontmatter notes with a notes comment on a directory slide", async () => fixture(async (dir) => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), "title: Notes\nslides:\n  - slides/01.md\n");
  await fs.writeFile(path.join(dir, "slides", "01.md"), "---\nnotes: |\n  Say this first.\n---\n# Title\n\nVisible\n\n<!-- notes: Then this. -->\n");
  const deck = await loadDirectoryProject(dir);
  assert.match(deck.slides[0].html, /Visible/);
  assert.doesNotMatch(deck.slides[0].html, /Say this first/);
  assert.doesNotMatch(deck.slides[0].html, /Then this/);
  assert.match(deck.slides[0].notes, /Say this first\.\n\nThen this\./);
}));

test("rejects notes that are not a string", async () => fixture(async (dir) => {
  await fs.mkdir(path.join(dir, "slides"));
  await fs.writeFile(path.join(dir, "presentation.yml"), "slides:\n  - slides/01.md\n");
  await fs.writeFile(path.join(dir, "slides", "01.md"), "---\nnotes:\n  say: hi\n---\n# Title\n");
  await assert.rejects(() => loadDirectoryProject(dir), /notes must be a string/);
}));

test("serves the announcer and keeps it on the deck's slide", { timeout: 60_000 }, async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), noted);
  await fs.writeFile(path.join(dir, "configuration.yml"), "presentation:\n  interval: 1\n");
  const deck = await discoverPresentation(dir);
  assert.equal(deck.playback.interval, 1);
  const instance = await startServer(deck);
  const browser = await chromium.launch({ headless: true });
  try {
    const payload = await fetch(`${instance.url}/api/presentation`).then((response) => response.json());
    assert.equal(payload.playback.interval, 1);
    assert.match(payload.slides[0].notesHtml, /quiet/);
    assert.doesNotMatch(payload.slides[0].html, /quiet/);
    assert.equal(payload.slides[1].notesHtml, "");
    const announcerPage = await fetch(`${instance.url}/announcer`).then((response) => response.text());
    assert.equal(announcerPage.includes('id="notes"'), true);
    assert.match(announcerPage, /class="view-link" href="\/"/);
    const home = await fetch(`${instance.url}/`).then((response) => response.text());
    assert.match(home, /id="play"/);
    assert.match(home, /href="\/announcer"/);

    const context = await browser.newContext();
    const audience = await context.newPage();
    const announcer = await context.newPage();
    await audience.goto(instance.url);
    await announcer.goto(`${instance.url}/announcer`);
    await audience.waitForFunction(() => document.querySelector("#counter")?.textContent === "1 / 3");
    await announcer.waitForFunction(() => document.querySelector("#notes")?.textContent?.includes("quiet"));
    const visible = await audience.evaluate(() => {
      const host = document.querySelector("#slide");
      return host.shadowRoot ? host.shadowRoot.textContent : host.textContent;
    });
    assert.match(visible, /Alpha Slide/);
    assert.equal(visible.includes("quiet"), false);
    assert.equal(visible.includes("still the note"), false);
    assert.equal(await audience.locator("a.view-link").getAttribute("href"), "/announcer");
    assert.equal(await audience.locator("a.view-link").getAttribute("target"), "_blank");

    await audience.click("#next");
    await announcer.waitForFunction(() => document.querySelector("#counter")?.textContent === "2 / 3");
    await announcer.waitForFunction(() => document.querySelector("#notes")?.textContent?.includes("No notes for this slide."));

    await audience.click("#play");
    await announcer.waitForFunction(() => document.querySelector("#play")?.getAttribute("aria-pressed") === "true");
    await announcer.waitForFunction(() => document.querySelector("#counter")?.textContent === "3 / 3");
    await announcer.waitForFunction(() => document.querySelector("#notes")?.textContent?.includes("Only the third"));
    await audience.waitForFunction(() => document.querySelector("#play")?.getAttribute("aria-pressed") === "false");
    await audience.waitForFunction(() => document.querySelector("#play")?.disabled === true);

    await announcer.click("#previous");
    await audience.waitForFunction(() => document.querySelector("#counter")?.textContent === "2 / 3");
    await announcer.waitForFunction(() => document.querySelector("#counter")?.textContent === "2 / 3");
  } finally {
    await browser.close();
    await new Promise((resolve) => instance.server.close(resolve));
  }
}));

test("a --- line in a note is a divider, not a heading for the line above", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# One\n\n<!-- notes:\nSay hello.\n---\nThen wait.\n-->\n");
  const deck = await loadSingleFile(path.join(dir, "talk.slide.md"));
  assert.equal(deck.slides.length, 1);
  assert.doesNotMatch(deck.slides[0].notesHtml, /<h2/);
  assert.match(deck.slides[0].notesHtml, /<p>Say hello\.<\/p>\s*<hr\s*\/?>\s*<p>Then wait\.<\/p>/);
}));
