import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { parsePlacement } from "../src/templates.js";
import { loadGroup } from "../src/groups.js";
import { counterHtml, parseChrome, shapeSvg } from "../src/chrome.js";
import { loadDirectoryProject } from "../src/presentation.js";
import { renderExportDocument } from "../src/export.js";
import { PRESETS } from "../src/export.js";

const groups = [
  "marvel_content_character",
  "marvel_content_guide",
  "marvel_content_place",
  "marvel_content_item"
];

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-marvel-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function writeDeck(dir, { group = "marvel_content_character", style, chrome, slides }) {
  await fs.mkdir(path.join(dir, "slides"), { recursive: true });
  await fs.mkdir(path.join(dir, "assets"), { recursive: true });
  await fs.writeFile(path.join(dir, "assets", "cover.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/></svg>`);
  const names = Object.keys(slides);
  const lines = [
    "title: Marvel",
    `group: ${group}`
  ];
  if (style) lines.push(`style: ${style}`);
  if (chrome) lines.push(chrome);
  lines.push("slides:");
  for (const name of names) lines.push(`  - slides/${name}`);
  await fs.writeFile(path.join(dir, "presentation.yml"), `${lines.join("\n")}\n`);
  for (const [name, body] of Object.entries(slides)) {
    await fs.writeFile(path.join(dir, "slides", name), body);
  }
}

const cover = "# Character name\n\nOne sentence that names the role.\n\n![Portrait](assets/cover.svg)\n";
const toc = "# In this post\n\n- Who they are\n- Where they start\n- The turn\n";

test("loads the four marvel content groups", async () => {
  const loaded = await Promise.all(groups.map((name) => loadGroup(name)));
  for (const group of loaded) {
    assert.equal(groups.includes(group.name), true);
    assert.ok(group.templates[`${group.name}_cover`]);
    assert.equal(group.templates[`${group.name}_cover`].role, "cover");
    assert.equal(group.templates[`${group.name}_cover`].layout, "poster");
    assert.deepEqual(group.themes, ["marvel-ultron", "marvel-jarvis", "marvel-herbie", "marvel-sentinel"]);
    assert.equal(group.chrome.counter.ornament.kind, "glyph");
  }
  const character = loaded[0];
  assert.equal(character.blueprint.types["topics-short"].max_items, 3);
  assert.equal(character.blueprint.types["topics-medium"].max_items, 5);
  assert.equal(character.blueprint.types.media.max_items, 2);
  assert.deepEqual(character.blueprint.types.media.require, ["heading", "image"]);
  assert.equal(loaded[1].blueprint.types.timeline.max_items, 5);
  assert.equal(character.chrome.counter.corner, "bottom-right");
  assert.equal(character.chrome.counter.line, "dashed");
  assert.equal(character.chrome.header.kind, "line");
  assert.equal(character.chrome.footer.shape, "hexagram");
});

test("accepts underscore template names and layout fields", () => {
  const placement = parsePlacement("marvel_content_character_cover", {
    column: 1, row: 1, width: 3, height: 3, align: "center", role: "cover", layout: "poster"
  });
  assert.equal(placement.role, "cover");
  assert.equal(placement.layout, "poster");
  assert.equal(placement.density, null);
});

test("rejects a chrome shape outside the set", () => {
  assert.throws(() => parseChrome({
    counter: { corner: "bottom-right", line: "solid", line_align: "middle", line_length: "100%" },
    footer: { kind: "shapes", shape: "star" }
  }), /shape must be one of/);
  assert.throws(() => parseChrome({
    counter: { corner: "middle", line: "solid", line_align: "middle", line_length: "100%" }
  }), /corner/);
});

test("draws star polygons and places the ornament opposite a right-hand counter", () => {
  assert.equal(shapeSvg("pentagram").match(/<polygon/g).length, 1);
  assert.equal(shapeSvg("hexagram").match(/<polygon/g).length, 2);
  assert.match(shapeSvg("nonagram"), /<polygon/);
  const html = counterHtml(
    { corner: "bottom-right", line: "dashed", lineAlign: "middle", lineLength: "46%" },
    "02",
    { kind: "glyph", text: "◈" }
  );
  assert.match(html, /data-corner="bottom-right"/);
  assert.match(html, /data-line="dashed"/);
  assert.match(html, /data-line-align="middle"/);
  assert.match(html, /data-length="custom"/);
  assert.match(html, /--counter-line-length:46%/);
  assert.ok(html.indexOf("page-counter-mark") < html.indexOf("page-counter-ornament"));
});

test("character deck hides the cover counter and limits a media page to two topics", async () => fixture(async (dir) => {
  await writeDeck(dir, {
    style: "marvel-ultron",
    slides: {
      "01_cover.slide.md": cover,
      "02_toc.slide.md": toc,
      "03_topics-short.slide.md": "# Who they are\n\n- A long first point about the character.\n- A long second point with the detail.\n- A long third point to keep.\n\n> **Tip:** Keep each point to two lines.\n",
      "04_media.slide.md": "# See it move\n\n![Clip](assets/cover.svg)\n\n- What the motion shows\n- Why it matters\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.group, "marvel_content_character");
  assert.equal(deck.style, "marvel-ultron");
  assert.match(deck.themeCss, /#e10600/);
  assert.equal(deck.slides[0].showCounter, false);
  assert.equal(deck.slides[0].role, "cover");
  assert.equal(deck.slides[1].showCounter, true);
  assert.equal(deck.slides[1].layout, "list");
  assert.match(deck.slides[2].html, /data-callout="tip"/);
  assert.match(deck.slides[2].html, /callout-label">Tip</);

  const html = await renderExportDocument(deck, deck.slides[1], 1, PRESETS.tiktok);
  assert.match(html, /page-counter/);
  assert.match(html, /data-corner=\\"bottom-right\\"/);
  assert.match(html, /page-counter-mark\\"\\u003e01\\u003c/);
  assert.match(html, /chrome-footer/);
  assert.match(html, /hexagram/);
  assert.doesNotMatch(html, /FLIPBOOK/);
  assert.doesNotMatch(html, /Made with Flipbook MD/);
  const coverHtml = await renderExportDocument(deck, deck.slides[0], 0, PRESETS.tiktok);
  assert.doesNotMatch(coverHtml, /class=\\"page-counter\\"/);
  assert.match(coverHtml, /data-layout=\\"poster\\"/);

  await fs.writeFile(path.join(dir, "slides", "04_media.slide.md"), "# Too many\n\n![Clip](assets/cover.svg)\n\n- One\n- Two\n- Three\n");
  await assert.rejects(() => loadDirectoryProject(dir), /maximum is 2/);
}));

test("a deck chrome override moves the counter", async () => fixture(async (dir) => {
  await writeDeck(dir, {
    group: "marvel_content_place",
    chrome: "chrome:\n  counter:\n    corner: top-left\n    line: dotted\n    line_align: top\n    line_length: 100%\n",
    slides: {
      "01_cover.slide.md": "# Place name\n\nA location in the Marvel universe.\n\n![Place](assets/cover.svg)\n",
      "02_toc.slide.md": "# Places\n\n- First place\n- Second place\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.chrome.counter.corner, "top-left");
  assert.equal(deck.chrome.counter.line, "dotted");
  assert.equal(deck.chrome.footer.line, "dashed");
  const html = await renderExportDocument(deck, deck.slides[1], 1, PRESETS.tiktok);
  assert.match(html, /data-corner=\\"top-left\\"/);
  assert.match(html, /data-length=\\"full\\"/);
  assert.match(html, /pentagram/);
}));

test("a portuguese callout keeps the portuguese label", async () => fixture(async (dir) => {
  await writeDeck(dir, {
    slides: {
      "01_cover.slide.md": cover,
      "02_toc.slide.md": toc,
      "03_callout.slide.md": "# A centelha\n\nUma frase.\n\n> **Lembre-se:** Questionar leis cegas.\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.match(deck.slides[2].html, /data-callout="remember"/);
  assert.match(deck.slides[2].html, /callout-label">Lembre-se</);
  assert.doesNotMatch(deck.slides[2].html, /Remember/);
}));

test("timeline pages stop at five topics", async () => fixture(async (dir) => {
  const stops = [1, 2, 3, 4, 5, 6].map((n) => `${n}. Stop ${n}.`).join("\n");
  await writeDeck(dir, {
    group: "marvel_content_guide",
    slides: {
      "01_cover.slide.md": "# Reading order\n\nWhere to start.\n\n![Cover](assets/cover.svg)\n",
      "02_timeline.slide.md": `# Order\n\n${stops}\n`
    }
  });
  await assert.rejects(() => loadDirectoryProject(dir), /maximum is 5/);
}));

test("content pages can follow the table of contents in either Marvel set", async () => fixture(async (dir) => {
  await writeDeck(dir, {
    group: "marvel_content_item",
    slides: {
      "01_cover.slide.md": "# The item\n\nWhat it is.\n\n![Item](assets/cover.svg)\n",
      "02_toc.slide.md": "# In this post\n\n- The book\n- Who carries it\n",
      "03_content.slide.md": "# Book of the day\n\nOne sentence on the artifact.\n\n- Who made it\n- Who can open it\n\n> **Learn more:** Name the next appearance.\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.theme, "light");
  assert.equal(deck.slides[2].template, "marvel_content_item_content");
  assert.match(deck.slides[2].html, /data-callout="learn-more"/);
  assert.match(deck.themeCss, /#1d4e89/);
}));
