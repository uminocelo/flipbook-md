import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadBlueprint, measureMarkdown, pageTypeFromFilename } from "../src/blueprint.js";
import { loadDirectoryProject, loadSingleFile } from "../src/presentation.js";
import { check, exportSlides, show } from "../src/cli.js";

const bin = path.resolve("bin/flipbook.js");
const talkBlueprint = `pages:
  - type: cover
  - type: point
    repeat:
      min: 3
      max: 6
  - type: conclusion
types:
  cover:
    template: cover
  point:
    allow: [heading, paragraph, list]
    forbid: [code]
  conclusion:
    template: summary
    allow: [heading, paragraph]
    max_chars: 250
`;

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function writeDeck(dir, slides, blueprint = talkBlueprint) {
  await fs.mkdir(path.join(dir, "slides"), { recursive: true });
  const names = Object.keys(slides);
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Talk\nslides:\n${names.map((name) => `  - ${name}\n`).join("")}`);
  if (blueprint) await fs.writeFile(path.join(dir, "blueprint.yml"), blueprint);
  for (const [name, body] of Object.entries(slides)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), body);
  }
}

function passingSlides(conclusion = "# End\n\nDone.\n") {
  return {
    "slides/01_cover.slide.md": "<!-- type: conclusion -->\n# Cover\n\nOpen.\n",
    "slides/02_point.slide.md": "# One\n\n- a\n",
    "slides/03_point.slide.md": "# Two\n\nText.\n",
    "slides/04_point.slide.md": "# Three\n\nText.\n",
    "slides/05_conclusion.slide.md": conclusion
  };
}

test("measures visible text and block kinds", () => {
  const paragraph = "a".repeat(250);
  assert.equal(measureMarkdown(paragraph).chars, 250);
  assert.equal(measureMarkdown(`${paragraph}b`).chars, 251);
  assert.deepEqual(measureMarkdown(`<!-- template: cover -->\n# Hi\n`).kinds, ["heading"]);
  assert.equal(measureMarkdown("# Hi\n").chars, 2);
  const headingAndBody = measureMarkdown(`# Hi\n\n${"a".repeat(248)}\n`);
  assert.equal(headingAndBody.chars, 250);
  assert.deepEqual(headingAndBody.kinds, ["heading", "paragraph"]);
  assert.deepEqual(measureMarkdown("- one\n- two\n").kinds, ["list"]);
  assert.ok(measureMarkdown("```\ncode\n```\n").kinds.includes("code"));
  assert.equal(measureMarkdown("```\ncode\n```\n").chars, 4);
  const image = measureMarkdown("![Alt text](https://example.com/a.png)\n");
  assert.deepEqual(image.kinds, ["image"]);
  assert.equal(image.chars, "Alt text".length);
  assert.ok(measureMarkdown("> Remember this\n").kinds.includes("blockquote"));
  assert.ok(measureMarkdown("| A | B |\n| --- | --- |\n| c | d |\n").kinds.includes("table"));
  const emoji = "👋";
  assert.equal(measureMarkdown(emoji).chars, 1);
  assert.notEqual(emoji.length, 1);
  assert.equal(measureMarkdown("**bold** and `code`\n").chars, "bold and code".length);
});

test("loads a talk blueprint and ignores a missing file", async () => fixture(async dir => {
  assert.equal(await loadBlueprint(dir), null);
  await fs.writeFile(path.join(dir, "blueprint.yml"), talkBlueprint);
  const blueprint = await loadBlueprint(dir);
  assert.equal(blueprint.types.conclusion.max_chars, 250);
  assert.deepEqual(blueprint.types.conclusion.allow, ["heading", "paragraph"]);
  assert.equal(blueprint.pages.at(-1).max_chars, undefined);
  await fs.writeFile(path.join(dir, "blueprint.yml"), talkBlueprint.replace("  - type: conclusion\n", "  - type: conclusion\n    max_chars: 80\n"));
  assert.equal((await loadBlueprint(dir)).pages.at(-1).max_chars, 80);
  assert.deepEqual(blueprint.pages[1].repeat, { min: 3, max: 6 });
  await fs.writeFile(path.join(dir, "blueprint.yml"), "pages: nope\n");
  await assert.rejects(() => loadBlueprint(dir), /blueprint\.yml/);
  await fs.writeFile(path.join(dir, "blueprint.yml"), "title: Only\n");
  await assert.rejects(() => loadBlueprint(dir), /blueprint\.yml/);
  await fs.writeFile(path.join(dir, "blueprint.yml"), "pages:\n  - type: cover\ntypes:\n  Conclusion:\n    template: summary\n");
  await assert.rejects(() => loadBlueprint(dir), /blueprint\.yml/);
  await fs.writeFile(path.join(dir, "blueprint.yml"), "pages:\n  - type: other\ntypes:\n  cover:\n    template: cover\n");
  await assert.rejects(() => loadBlueprint(dir), /unknown type "other"/);
  await fs.writeFile(path.join(dir, "blueprint.yml"), "pages:\n  - type: cover\ntypes:\n  cover:\n    template: poster\n");
  await assert.rejects(() => loadBlueprint(dir), /unknown template "poster"/);
}));

test("reads page types from filenames and comments", async () => fixture(async dir => {
  assert.equal(pageTypeFromFilename("slides/01_cover.slide.md"), "cover");
  assert.equal(pageTypeFromFilename("nameofdeck_cover.slide.md"), "cover");
  assert.equal(pageTypeFromFilename("slides/01-intro.slide.md"), null);
  assert.equal(pageTypeFromFilename("slides/01-intro.md"), null);

  await writeDeck(dir, {
    "slides/01_cover.slide.md": "<!-- type: conclusion -->\n# Cover\n",
    "nameofdeck_point.slide.md": "# Point\n"
  }, null);
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.slides[0].type, "cover");
  assert.equal(deck.slides[1].type, "point");
  assert.doesNotMatch(deck.slides[0].html, /type:/);
  assert.equal(deck.blueprint, null);

  const file = path.join(dir, "mixed.slide.md");
  await fs.writeFile(file, "# First\n\n---\n\n<!-- type: conclusion -->\n# End\n");
  const single = await loadSingleFile(file);
  assert.equal(single.slides[0].type, null);
  assert.equal(single.slides[1].type, "conclusion");
  assert.doesNotMatch(single.slides[1].html, /<!--/);

  await fs.writeFile(path.join(dir, "bad.slide.md"), "<!-- type: 1bad -->\n# Nope\n");
  await assert.rejects(() => loadSingleFile(path.join(dir, "bad.slide.md")), /Slide 1 uses invalid page type "1bad"/);
}));

test("checks page order and counts", async () => fixture(async dir => {
  await writeDeck(dir, passingSlides());
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.blueprint.pages.length, 3);

  await writeDeck(dir, {
    ...passingSlides(),
    "slides/06_point.slide.md": "# Four\n",
    "slides/07_point.slide.md": "# Five\n",
    "slides/08_point.slide.md": "# Six\n"
  });
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Talk\nslides:\n  - slides/01_cover.slide.md\n  - slides/02_point.slide.md\n  - slides/03_point.slide.md\n  - slides/04_point.slide.md\n  - slides/06_point.slide.md\n  - slides/07_point.slide.md\n  - slides/08_point.slide.md\n  - slides/05_conclusion.slide.md\n`);
  assert.equal((await loadDirectoryProject(dir)).slides.length, 8);

  await writeDeck(dir, {
    "slides/01_cover.slide.md": "# Cover\n",
    "slides/02_point.slide.md": "# One\n",
    "slides/03_point.slide.md": "# Two\n"
  });
  await assert.rejects(() => loadDirectoryProject(dir), /expected at least 3 point/);

  await writeDeck(dir, {
    "slides/01_cover.slide.md": "# Cover\n",
    "slides/02_conclusion.slide.md": "# End\n"
  });
  await assert.rejects(() => loadDirectoryProject(dir), /expected point, found conclusion/);

  await writeDeck(dir, { "slides/01-intro.md": "# Legacy\n" });
  await assert.rejects(() => loadDirectoryProject(dir), /slides\/01-intro\.md: slide has no page type/);

  await writeDeck(dir, {
    "slides/01_cover.slide.md": "# Cover\n",
    "slides/02_point.slide.md": "# One\n",
    "slides/03_point.slide.md": "# Two\n",
    "slides/04_point.slide.md": "# Three\n"
  });
  await assert.rejects(() => loadDirectoryProject(dir), /expected conclusion/);
}));

test("enforces content rules and template inheritance", async () => fixture(async dir => {
  const heading = "# Hi\n\n";
  await writeDeck(dir, passingSlides(`${heading}${"a".repeat(248)}\n`));
  const ok = await loadDirectoryProject(dir);
  assert.equal(ok.slides[0].template, "cover");
  assert.equal(ok.slides.at(-1).template, "summary");
  assert.equal(ok.slides[1].template, "flow");

  await writeDeck(dir, passingSlides(`${heading}${"a".repeat(249)}\n`));
  await assert.rejects(() => loadDirectoryProject(dir), /visible text is 251 characters; maximum is 250/);

  await writeDeck(dir, passingSlides("# End\n\n- a point\n"));
  await assert.rejects(() => loadDirectoryProject(dir), /list is not allowed/);
  await writeDeck(dir, passingSlides("# End\n\n```\ncode\n```\n"));
  await assert.rejects(() => loadDirectoryProject(dir), /code is not allowed/);
  await writeDeck(dir, passingSlides("# End\n\n![Alt](https://example.com/a.png)\n"));
  await assert.rejects(() => loadDirectoryProject(dir), /image is not allowed/);
  await writeDeck(dir, passingSlides("# End\n\n> Remember\n"));
  await assert.rejects(() => loadDirectoryProject(dir), /blockquote is not allowed/);
  await writeDeck(dir, passingSlides("# End\n\n| A |\n| --- |\n| b |\n"));
  await assert.rejects(() => loadDirectoryProject(dir), /table is not allowed/);

  await writeDeck(dir, {
    "slides/01_cover.slide.md": "# Cover\n",
    "slides/02_point.slide.md": "```\ncode\n```\n",
    "slides/03_point.slide.md": "# Two\n",
    "slides/04_point.slide.md": "# Three\n",
    "slides/05_conclusion.slide.md": "# End\n"
  });
  await assert.rejects(() => loadDirectoryProject(dir), /code is not allowed/);

  const slides = passingSlides("# End\n\nShort.\n");
  slides["slides/05_conclusion.slide.md"] = "<!-- template: cover -->\n# End\n\nShort.\n";
  await writeDeck(dir, slides);
  await assert.rejects(() => loadDirectoryProject(dir), /template is cover; blueprint type conclusion requires summary/);

  const limited = talkBlueprint.replace("  - type: conclusion\n", "  - type: conclusion\n    max_chars: 10\n");
  await writeDeck(dir, passingSlides("# End\n\nHello there\n"), limited);
  await assert.rejects(() => loadDirectoryProject(dir), /maximum is 10/);
}));

test("flipbook check gates show and export", async () => fixture(async dir => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    await writeDeck(dir, { "slides/01-intro.md": "# Hello\n" }, null);
    const open = await check(dir);
    assert.equal(open.blueprint, null);
    assert.match(logs.join("\n"), /no blueprint/);

    logs.length = 0;
    await writeDeck(dir, passingSlides());
    const matched = await check(dir);
    assert.equal(matched.slides.length, 5);
    assert.match(logs.join("\n"), /5 slide\(s\) match the blueprint/);
  } finally {
    console.log = original;
  }

  await writeDeck(dir, passingSlides(`# Hi\n\n${"a".repeat(249)}\n`));
  const failed = spawnSync(process.execPath, [bin, "check", dir], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /visible text is 251 characters; maximum is 250/);
  assert.doesNotMatch(failed.stdout, /Open:/);

  const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /flipbook check/);

  const showLogs = [];
  console.log = (...args) => showLogs.push(args.join(" "));
  try {
    await assert.rejects(() => show(dir), /maximum is 250/);
  } finally {
    console.log = original;
  }
  assert.equal(showLogs.some((line) => line.includes("Open:")), false);

  const output = path.join(dir, "out");
  await assert.rejects(() => exportSlides(dir, { preset: "instagram", outputDir: output }), /maximum is 250/);
  await assert.rejects(fs.access(output));
}));

test("counts top-level list items across a slide", () => {
  assert.equal(measureMarkdown("# T\n\nText.\n").items, 0);
  assert.equal(measureMarkdown("# T\n\n- a\n- b\n  - nested\n\n1. c\n").items, 3);
  assert.equal(measureMarkdown("# T\n\n> - quoted\n").items, 0);
});

test("enforces max_items and require", async () => fixture(async dir => {
  const rules = talkBlueprint
    .replace("    allow: [heading, paragraph, list]\n", "    allow: [heading, paragraph, list]\n    max_items: 5\n    require: [list]\n");
  const deck = (point) => ({
    "slides/01_cover.slide.md": "# Cover\n",
    "slides/02_point.slide.md": point,
    "slides/03_point.slide.md": "# Two\n\nText.\n\n- a\n",
    "slides/04_point.slide.md": "# Three\n\nText.\n\n- b\n",
    "slides/05_conclusion.slide.md": "# End\n\nDone.\n"
  });
  const bullets = (n) => `# One\n\n${Array.from({ length: n }, (_, i) => `- item ${i + 1}`).join("\n")}\n`;

  await writeDeck(dir, deck(bullets(5)), rules);
  assert.equal((await loadDirectoryProject(dir)).slides.length, 5);

  await writeDeck(dir, deck(bullets(6)), rules);
  await assert.rejects(() => loadDirectoryProject(dir), /02_point\.slide\.md: lists have 6 items; maximum is 5/);

  await writeDeck(dir, deck("# One\n\nOnly text.\n"), rules);
  await assert.rejects(() => loadDirectoryProject(dir), /02_point\.slide\.md: list is required/);

  const stepOverride = rules.replace("      max: 6\n", "      max: 6\n    max_items: 7\n    require: [paragraph]\n");
  await writeDeck(dir, deck(`# One\n\nIntro.\n\n${bullets(7).split("\n\n")[1]}`), stepOverride);
  assert.equal((await loadDirectoryProject(dir)).slides.length, 5);
  await writeDeck(dir, deck(bullets(3)), stepOverride);
  await assert.rejects(() => loadDirectoryProject(dir), /paragraph is required/);

  for (const bad of ["max_items: -1", "max_items: two", "require: [chart]", "require: list"]) {
    await writeDeck(dir, deck(bullets(1)), rules.replace("    max_items: 5\n    require: [list]\n", `    ${bad}\n`));
    await assert.rejects(() => loadDirectoryProject(dir), /blueprint\.yml type "point" has an invalid (max_items|require)/);
  }
}));
