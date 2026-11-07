import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { PRESETS, exportCarousel, renderExportDocument } from "../src/export.js";

const presentation = {
  title: "Presets",
  theme: "midnight",
  themeCss: "",
  root: os.tmpdir(),
  slides: [{ index: 0, title: "One", template: "flow", html: "<h1>One</h1><p>Body</p>" }]
};

test("defines the LinkedIn, YouTube, and TikTok presets", () => {
  const sizes = Object.fromEntries(Object.entries(PRESETS).map(([name, preset]) => [name, `${preset.width}x${preset.height}`]));
  assert.deepEqual(sizes, {
    instagram: "1080x1350",
    x: "1080x1080",
    linkedin: "1080x1350",
    "linkedin-square": "1080x1080",
    "linkedin-landscape": "1200x627",
    youtube: "1080x1080",
    tiktok: "1080x1920"
  });
  for (const [name, preset] of Object.entries(PRESETS)) assert.equal(preset.label, name);
});

test("scales type to the preset's height", async () => {
  const render = (name) => renderExportDocument(presentation, presentation.slides[0], 0, PRESETS[name]);
  const bodySize = (html) => Number(html.match(/\.content\{flex:1;min-height:0;overflow:hidden;font-size:(\d+)px/)[1]);

  assert.equal(bodySize(await render("x")), 29);
  assert.equal(bodySize(await render("instagram")), 32);
  assert.equal(bodySize(await render("linkedin-landscape")), 17);
  assert.equal(bodySize(await render("tiktok")), 38);

  const landscape = await render("linkedin-landscape");
  assert.match(landscape, /width:1200px/);
  assert.match(landscape, /height:627px/);
});

test("an unknown preset lists every preset", async () => {
  await assert.rejects(
    () => exportCarousel(presentation, { preset: "myspace", outputDir: os.tmpdir() }),
    (error) => {
      assert.match(error.message, /Unknown preset "myspace"/);
      for (const name of Object.keys(PRESETS)) assert.ok(error.message.includes(`"${name}"`), name);
      return true;
    }
  );
});
