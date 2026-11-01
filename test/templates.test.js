import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEMPLATE, TEMPLATES, lookupTemplate, templateAreaCss } from "../src/templates.js";
import { renderExportDocument } from "../src/export.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("registers flow, cover, and summary placements", () => {
  assert.equal(DEFAULT_TEMPLATE, "flow");
  assert.equal(TEMPLATES.flow.area, null);
  assert.deepEqual(TEMPLATES.cover.area, { column: "2", row: "2" });
  assert.deepEqual(TEMPLATES.summary.area, { column: "2 / 4", row: "2 / 4" });
  assert.equal(lookupTemplate("cover").template.name, "cover");
  assert.equal(lookupTemplate("summary").template.area.column, "2 / 4");
  assert.equal(lookupTemplate("summary").template.area.row, "2 / 4");
  assert.deepEqual(lookupTemplate("poster"), { found: false, name: "poster" });
});

test("player stylesheet places cover and summary on the grid", async () => {
  const css = await fs.readFile(path.join(root, "public/slide.css"), "utf8");
  const app = await fs.readFile(path.join(root, "public/app.js"), "utf8");
  assert.match(css, /@layer base/);
  assert.match(app, /data-template/);
  assert.match(app, /slide-body/);

  const cover = block(css, '.slide-root[data-template="cover"] .slide-body');
  assert.match(cover, /grid-column:\s*2\s*;/);
  assert.match(cover, /grid-row:\s*2\s*;/);
  assert.match(cover, /text-align:\s*center/);

  const summary = block(css, '.slide-root[data-template="summary"] .slide-body');
  assert.match(summary, /grid-column:\s*2\s*\/\s*4/);
  assert.match(summary, /grid-row:\s*2\s*\/\s*4/);

  const grid = block(css, '.slide-root[data-template="cover"],');
  assert.match(grid, /grid-template-columns:\s*repeat\(3/);
  assert.match(grid, /grid-template-rows:\s*repeat\(3/);
  assert.equal(css.includes('.slide-root {') && css.includes("display: grid") , true);
  assert.doesNotMatch(block(css, ".slide-root {"), /display:\s*grid/);
});

test("export document places cover, summary, and flow", async () => {
  const presentation = {
    title: "Templates",
    theme: "midnight",
    themeCss: "",
    root: os.tmpdir(),
    slides: [
      { index: 0, title: "Cover", template: "cover", html: "<h1>Cover</h1>" },
      { index: 1, title: "Summary", template: "summary", html: "<h1>Summary</h1>" },
      { index: 2, title: "Flow", template: "flow", html: "<h1>Flow</h1><p>Body</p><ul><li>Item</li></ul>" }
    ]
  };
  const preset = { width: 1080, height: 1080 };
  const cover = await renderExportDocument(presentation, presentation.slides[0], 0, preset);
  const summary = await renderExportDocument(presentation, presentation.slides[1], 1, preset);
  const flow = await renderExportDocument(presentation, presentation.slides[2], 2, preset);
  const area = templateAreaCss(".content").replaceAll('"', '\\"');

  assert.match(cover, /data-template=\\"cover\\"/);
  assert.match(cover, /class=\\"slide-body\\"/);
  assert.match(cover, /Cover/);
  assert.ok(cover.includes(area));
  assert.match(cover, /grid-column:2;grid-row:2/);
  assert.match(cover, /grid-column:2 \/ 4;grid-row:2 \/ 4/);
  assert.match(cover, /class=\\"top\\"/);
  assert.match(cover, /class=\\"rule\\"/);
  assert.match(cover, /class=\\"footer\\"/);

  assert.match(summary, /data-template=\\"summary\\"/);
  assert.match(summary, /class=\\"slide-body\\"/);
  assert.match(summary, /Summary/);
  assert.ok(summary.includes(area));

  assert.match(flow, /data-template=\\"flow\\"/);
  assert.match(flow, /class=\\"slide-body\\"/);
  assert.match(flow, /Flow/);
  assert.match(flow, /Body/);
  assert.match(flow, /Item/);
  assert.match(flow, /class=\\"top\\"/);
  assert.match(flow, /class=\\"footer\\"/);
});

function block(css, selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf("}", start));
}
