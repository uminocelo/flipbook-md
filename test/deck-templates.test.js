import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { loadDirectoryProject, loadSingleFile } from "../src/presentation.js";
import { startServer } from "../src/server.js";
import { renderExportDocument } from "../src/export.js";
import {
  deckTemplateCss,
  loadDeckTemplates,
  parsePlacement,
  parseTemplatesDocument
} from "../src/templates.js";

const bin = path.resolve("bin/flipbook.js");
const realLibrary = path.join(os.homedir(), "Documents", "flipbook", "templates");
const quoteFields = { column: 1, row: 2, width: 2, height: 1, align: "start" };

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function listing(directory) {
  try {
    return (await fs.readdir(directory)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function run(args, cwd, home) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FLIPBOOK_HOME: home }
  });
}

async function writeProject(dir, { templates, blueprint, slides }) {
  await fs.mkdir(path.join(dir, "slides"), { recursive: true });
  const names = Object.keys(slides);
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Placements\nslides:\n${names.map((name) => `  - ${name}\n`).join("")}`);
  if (templates) await fs.writeFile(path.join(dir, "templates.yml"), templates);
  if (blueprint) await fs.writeFile(path.join(dir, "blueprint.yml"), blueprint);
  for (const [name, body] of Object.entries(slides)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), body);
  }
}

test("parses a quote placement and rejects a bad templates.yml", async () => fixture(async dir => {
  assert.deepEqual(await loadDeckTemplates(dir), {});

  const quote = parsePlacement("quote", quoteFields);
  assert.deepEqual(
    { column: quote.column, row: quote.row, width: quote.width, height: quote.height, align: quote.align },
    quoteFields
  );
  assert.deepEqual(quote.area, { column: "1 / 3", row: "2" });
  assert.equal(parsePlacement("wide", { column: 1, row: 1, width: 3, height: 1, align: "center" }).area.column, "1 / 4");
  assert.equal(parsePlacement("tall", { column: 2, row: 2, width: 1, height: 2, align: "end" }).area.row, "2 / 4");

  const parsed = parseTemplatesDocument({
    Quote: quoteFields,
    wide: { column: 1, row: 1, width: 3, height: 1, align: "center" }
  });
  assert.equal(parsed.quote.name, "quote");
  assert.equal(parsed.wide.align, "center");
  assert.equal(parsed.Quote, undefined);

  assert.throws(() => parsePlacement("cover", quoteFields), /templates\.yml/);
  assert.throws(() => parsePlacement("2wide", quoteFields), /templates\.yml/);
  assert.throws(() => parsePlacement("quote", { ...quoteFields, column: 1.5 }), /templates\.yml/);
  assert.throws(() => parsePlacement("quote", { ...quoteFields, column: 3, width: 2 }), /templates\.yml/);
  assert.throws(() => parsePlacement("quote", { ...quoteFields, align: "left" }), /templates\.yml/);
  assert.throws(() => parsePlacement("quote", "start"), /templates\.yml/);
  assert.throws(() => parseTemplatesDocument(["quote"]), /templates\.yml/);

  await fs.writeFile(path.join(dir, "templates.yml"), "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n");
  const loaded = await loadDeckTemplates(dir);
  assert.equal(loaded.quote.area.column, "1 / 3");
  assert.equal(loaded.quote.area.row, "2");

  await fs.writeFile(path.join(dir, "templates.yml"), "- quote\n");
  await assert.rejects(() => loadDeckTemplates(dir), /templates\.yml/);
  await fs.writeFile(path.join(dir, "templates.yml"), "cover:\n  column: 1\n  row: 1\n  width: 1\n  height: 1\n  align: center\n");
  await assert.rejects(() => loadDeckTemplates(dir), /templates\.yml/);
}));

test("a named slide loads and a blueprint may require that name", async () => fixture(async dir => {
  await writeProject(dir, {
    templates: "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n",
    slides: {
      "slides/01-quote.slide.md": "<!-- template: quote -->\n# Quote\n\nLeft.\n",
      "slides/02-cover.slide.md": "<!-- template: cover -->\n# Cover\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.slides[0].template, "quote");
  assert.equal(deck.slides[1].template, "cover");
  assert.doesNotMatch(deck.slides[0].html, /template:/);
  assert.equal(deck.templates.quote.align, "start");

  await fs.writeFile(path.join(dir, "slides/01-quote.slide.md"), "<!-- template: banner -->\n# Nope\n");
  await assert.rejects(() => loadDirectoryProject(dir), /Slide 1 uses unknown template "banner"/);

  const blueprint = `pages:
  - type: aside
types:
  aside:
    template: quote
    allow: [heading, paragraph]
`;
  await writeProject(dir, {
    templates: "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n",
    blueprint,
    slides: { "slides/01_aside.slide.md": "# Aside\n\nHello.\n" }
  });
  const inherited = await loadDirectoryProject(dir);
  assert.equal(inherited.slides[0].template, "quote");
  assert.equal(inherited.blueprint.types.aside.template, "quote");

  await writeProject(dir, {
    templates: "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n",
    blueprint: blueprint.replace("template: quote", "template: poster"),
    slides: { "slides/01_aside.slide.md": "# Aside\n\nHello.\n" }
  });
  await assert.rejects(() => loadDirectoryProject(dir), /blueprint\.yml[\s\S]*unknown template "poster"/);

  await fs.rm(path.join(dir, "templates.yml"));
  await writeProject(dir, {
    blueprint: blueprint,
    slides: { "slides/01_aside.slide.md": "# Aside\n\nHello.\n" }
  });
  await assert.rejects(() => loadDirectoryProject(dir), /blueprint\.yml[\s\S]*unknown template "quote"/);

  await fs.rm(path.join(dir, "blueprint.yml"));
  const file = path.join(dir, "one.slide.md");
  await fs.writeFile(path.join(dir, "templates.yml"), "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n");
  await fs.writeFile(file, "<!-- template: quote -->\n# Quote\n");
  assert.equal((await loadSingleFile(file)).slides[0].template, "quote");
}));

test("serves quote placement between the base sheet and the theme", async () => fixture(async dir => {
  const css = deckTemplateCss(".slide-root", {
    quote: parsePlacement("quote", quoteFields),
    banner: parsePlacement("banner", { column: 2, row: 2, width: 1, height: 2, align: "center" }),
    close: parsePlacement("close", { column: 3, row: 3, width: 1, height: 1, align: "end" })
  });
  assert.match(css, /:host:has\(\.slide-root\[data-template="quote"\]\)/);
  assert.match(css, /\.slide-root\[data-template="quote"\] \.slide-body\{grid-column:1 \/ 3;grid-row:2;align-self:start;justify-self:start\}/);
  assert.match(css, /\.slide-root\[data-template="banner"\] \.slide-body\{[^}]*align-self:center;justify-self:center;text-align:center\}/);
  assert.match(css, /\.slide-root\[data-template="close"\] \.slide-body\{[^}]*align-self:end;justify-self:end\}/);
  assert.equal(deckTemplateCss(".slide-root", {}), "");
  assert.doesNotMatch(deckTemplateCss(".content", { quote: parsePlacement("quote", quoteFields) }), /:host/);

  await writeProject(dir, {
    templates: "quote:\n  column: 1\n  row: 2\n  width: 2\n  height: 1\n  align: start\n",
    slides: { "slides/01-quote.slide.md": "<!-- template: quote -->\n# Quote\n" }
  });
  const deck = await loadDirectoryProject(dir);
  const instance = await startServer(deck);
  try {
    const app = await fs.readFile(path.resolve("public/app.js"), "utf8");
    const slideAt = app.indexOf('href = "/slide.css"');
    const templatesAt = app.indexOf('href = "/templates.css"');
    const themeAt = app.indexOf('href = "/presentation.css"');
    assert.ok(slideAt >= 0 && slideAt < templatesAt && templatesAt < themeAt);

    const response = await fetch(`${instance.url}/templates.css`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
    const served = await response.text();
    assert.match(served, /grid-column:1 \/ 3/);
    assert.match(served, /grid-row:2/);
    assert.match(served, /align-self:start/);
    const slideCss = await fetch(`${instance.url}/slide.css`).then((body) => body.text());
    assert.match(slideCss, /data-template="cover"/);
    assert.match(slideCss, /data-template="summary"/);

    const html = await renderExportDocument(deck, deck.slides[0], 0, { width: 1080, height: 1080, label: "x" });
    assert.match(html, /data-template=\\"quote\\"/);
    assert.match(html, /\.content\[data-template=\\"quote\\"\]\{display:grid/);
    assert.match(html, /\.content\[data-template=\\"quote\\"\] \.slide-body\{grid-column:1 \/ 3;grid-row:2;align-self:start;justify-self:start\}/);
    assert.match(html, /class=\\"top\\"/);
    assert.match(html, /class=\\"footer\\"/);
    assert.doesNotMatch(html, /\.top\[data-template|\.footer\[data-template/);
    assert.match(html, /\\u003cdiv class=\\"top\\"\\u003e[\s\S]*\\u003cmain class=\\"content\\" data-template=\\"quote\\"\\u003e[\s\S]*\\u003cdiv class=\\"footer\\"\\u003e/);
    const topAt = html.indexOf('class=\\"top\\"');
    const contentAt = html.indexOf('class=\\"content\\"');
    const footerAt = html.indexOf('class=\\"footer\\"');
    assert.ok(topAt < contentAt && contentAt < footerAt);
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
}));

test("a deck without templates.yml still uses built-in cover and summary", async () => fixture(async dir => {
  await writeProject(dir, {
    slides: {
      "slides/01-cover.slide.md": "<!-- template: cover -->\n# Cover\n",
      "slides/02-summary.slide.md": "<!-- template: summary -->\n# Summary\n"
    }
  });
  const deck = await loadDirectoryProject(dir);
  assert.equal(deck.slides[0].template, "cover");
  assert.equal(deck.slides[1].template, "summary");
  assert.deepEqual(deck.templates, {});
  const instance = await startServer(deck);
  try {
    const served = await fetch(`${instance.url}/templates.css`).then((body) => body.text());
    assert.equal(served, "");
    const slideCss = await fetch(`${instance.url}/slide.css`).then((body) => body.text());
    assert.match(slideCss, /grid-column:\s*2\s*;/);
    assert.match(slideCss, /grid-column:\s*2\s*\/\s*4/);
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
  const cover = await renderExportDocument(deck, deck.slides[0], 0, { width: 1080, height: 1350, label: "instagram" });
  const summary = await renderExportDocument(deck, deck.slides[1], 1, { width: 1080, height: 1350, label: "instagram" });
  assert.match(cover, /grid-column:2;grid-row:2/);
  assert.match(summary, /grid-column:2 \/ 4;grid-row:2 \/ 4/);
  assert.doesNotMatch(cover, /data-template=\\"quote\\"/);
}));

test("flipbook template add writes the library and merges the deck", async () => fixture(async dir => {
  const home = path.join(dir, "home");
  const deck = path.join(dir, "deck");
  const loose = path.join(dir, "loose");
  await fs.mkdir(deck, { recursive: true });
  await fs.mkdir(loose, { recursive: true });
  await fs.writeFile(path.join(deck, "presentation.yml"), "title: Deck\nslides:\n  - slides/01-open.slide.md\n");
  await fs.mkdir(path.join(deck, "slides"), { recursive: true });
  await fs.writeFile(path.join(deck, "slides/01-open.slide.md"), "# Open\n");
  const existing = "aside:\n  column: 3\n  row: 3\n  width: 1\n  height: 1\n  align: end\n";
  await fs.writeFile(path.join(deck, "templates.yml"), existing);
  const before = await listing(realLibrary);

  const added = run(
    ["template", "add", "quote", "--column", "1", "--row", "2", "--width", "2", "--height", "1", "--align", "start"],
    deck,
    home
  );
  assert.equal(added.status, 0, added.stderr);
  const libraryFile = path.join(home, "templates", "quote.yml");
  const library = parseYaml(await fs.readFile(libraryFile, "utf8"));
  const merged = parseYaml(await fs.readFile(path.join(deck, "templates.yml"), "utf8"));
  assert.deepEqual(library, quoteFields);
  assert.deepEqual(merged.quote, quoteFields);
  assert.deepEqual(merged.aside, { column: 3, row: 3, width: 1, height: 1, align: "end" });
  assert.match(added.stdout, /quote\.yml/);

  const onlyLibrary = run(
    ["template", "add", "banner", "--align", "center", "--width", "1", "--height", "1", "--column", "2", "--row", "1"],
    loose,
    home
  );
  assert.equal(onlyLibrary.status, 0, onlyLibrary.stderr);
  assert.deepEqual(parseYaml(await fs.readFile(path.join(home, "templates", "banner.yml"), "utf8")), {
    column: 2, row: 1, width: 1, height: 1, align: "center"
  });
  await assert.rejects(fs.access(path.join(loose, "templates.yml")));

  const beforeReject = await fs.readFile(path.join(deck, "templates.yml"), "utf8");
  const reserved = run(["template", "add", "cover", "--column", "1", "--row", "1", "--width", "1", "--height", "1", "--align", "center"], deck, home);
  assert.equal(reserved.status, 1);
  assert.match(reserved.stderr, /Flipbook MD:/);
  await assert.rejects(fs.access(path.join(home, "templates", "cover.yml")));
  assert.equal(await fs.readFile(path.join(deck, "templates.yml"), "utf8"), beforeReject);

  const outside = run(["template", "add", "wide", "--column", "3", "--row", "1", "--width", "2", "--height", "1", "--align", "start"], deck, home);
  assert.equal(outside.status, 1);
  await assert.rejects(fs.access(path.join(home, "templates", "wide.yml")));

  const missing = run(["template", "add", "narrow", "--column", "1", "--row", "1", "--width", "1", "--height", "1"], deck, home);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--align/);
  await assert.rejects(fs.access(path.join(home, "templates", "narrow.yml")));
  assert.deepEqual(parseYaml(await fs.readFile(path.join(deck, "templates.yml"), "utf8")).quote, quoteFields);

  const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /flipbook template add <name> --column <n> --row <n> --width <n> --height <n> --align start\|center\|end/);
  assert.match(help.stdout, /flipbook template add quote --column 1 --row 2 --width 2 --height 1 --align start/);
  assert.deepEqual(await listing(realLibrary), before);
}));
