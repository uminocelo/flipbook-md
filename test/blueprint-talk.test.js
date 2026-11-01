import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { measureMarkdown } from "../src/blueprint.js";
import { loadDirectoryProject } from "../src/presentation.js";
import { renderExportDocument } from "../src/export.js";
import { startServer } from "../src/server.js";

const example = path.resolve("examples/blueprint-talk");

test("examples/blueprint-talk passes the blueprint", async () => {
  const deck = await loadDirectoryProject(example);
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.blueprint.types.cover.template, "cover");
  assert.deepEqual(deck.blueprint.types.point.allow, ["heading", "paragraph", "list"]);
  assert.equal(deck.blueprint.types.conclusion.template, "summary");
  assert.equal(deck.blueprint.types.conclusion.max_chars, 250);
  assert.deepEqual(deck.blueprint.types.conclusion.allow, ["heading", "paragraph"]);
  assert.deepEqual(deck.slides.map((slide) => slide.type), ["cover", "point", "point", "point", "conclusion"]);
  assert.equal(deck.slides[0].template, "cover");
  assert.equal(deck.slides[4].template, "summary");
  assert.deepEqual(deck.slides.map((slide) => slide.source), [
    "slides/01_cover.slide.md",
    "slides/02_point.slide.md",
    "slides/03_point.slide.md",
    "slides/04_point.slide.md",
    "slides/05_conclusion.slide.md"
  ]);

  const conclusion = await fs.readFile(path.join(example, "slides/05_conclusion.slide.md"), "utf8");
  const measured = measureMarkdown(conclusion);
  assert.ok(measured.chars <= 250);
  assert.deepEqual(measured.kinds, ["heading", "paragraph"]);

  const preset = { width: 1080, height: 1350, label: "instagram" };
  const cover = await renderExportDocument(deck, deck.slides[0], 0, preset);
  const ending = await renderExportDocument(deck, deck.slides[4], 4, preset);
  assert.match(cover, /data-template=\\"cover\\"/);
  assert.match(ending, /data-template=\\"summary\\"/);
  assert.match(cover, /class=\\"top\\"/);
  assert.match(ending, /class=\\"footer\\"/);
});

test("a longer conclusion in a copy of blueprint-talk fails the maximum", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try {
    await fs.cp(example, dir, { recursive: true });
    const conclusion = path.join(dir, "slides/05_conclusion.slide.md");
    await fs.writeFile(conclusion, `<!-- template: summary -->\n# End\n\n${"a".repeat(248)}\n`);
    await assert.rejects(() => loadDirectoryProject(dir), /visible text is 251 characters; maximum is 250/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("blueprint-talk serves five slides", async () => {
  const deck = await loadDirectoryProject(example);
  const instance = await startServer(deck);
  try {
    const body = await fetch(`${instance.url}/api/presentation`).then((response) => response.json());
    assert.equal(body.slides.length, 5);
    assert.equal(body.slides[0].template, "cover");
    assert.equal(body.slides[4].template, "summary");
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
});
