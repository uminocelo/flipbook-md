import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfiguration, playbackFromConfiguration, resolveExportOptions } from "../src/configuration.js";
import { exportVideo } from "../src/export.js";
import { discoverPresentation } from "../src/presentation.js";
import { startServer } from "../src/server.js";

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function probe(file) {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames:format=duration", "-of", "csv=p=0", file], (error, stdout) => {
      if (error) return reject(error);
      const [frames, duration] = stdout.trim().split(/\s+/).map(Number);
      resolve({ frames, duration });
    });
  });
}

const deckSource = "---\ntitle: Moves\n---\n# One\n\n<!-- notes:\n![chart](assets/chart.png)\n-->\n\n---\n\n# Two\n\n---\n\n# Three\n";

test("reads transitions for the player and the video, with flags over the file", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "configuration.yml"), "transition: slide\nexport:\n  transition: fade\n  transition_duration: 0.8\n");
  const config = await loadConfiguration(dir);
  assert.deepEqual(playbackFromConfiguration(config).transition, { type: "slide", duration: 0.4 });
  const fromFile = resolveExportOptions(config, {});
  assert.equal(fromFile.transition, "fade");
  assert.equal(fromFile.transitionDuration, 0.8);
  const fromFlags = resolveExportOptions(config, { transition: "slide", transitionDuration: "0.2" });
  assert.equal(fromFlags.transition, "slide");
  assert.equal(fromFlags.transitionDuration, 0.2);
  assert.deepEqual(playbackFromConfiguration({ presentation: {} }).transition, { type: "none", duration: 0.4 });
  assert.throws(() => resolveExportOptions(config, { transition: "zoom" }), /none, fade, or slide/);
  assert.throws(() => resolveExportOptions(config, { transitionDuration: "9" }), /at most 5/);
  await fs.writeFile(path.join(dir, "configuration.yml"), "presentation:\n  transition: spin\n");
  await assert.rejects(async () => playbackFromConfiguration(await loadConfiguration(dir)), /presentation\.transition/);
}));

test("video export refuses a duration or a transition that the slides do not fit", async () => {
  const slides = Array.from({ length: 8 }, (_, index) => ({ index, title: `S${index}`, html: "<h1>S</h1>" }));
  const presentation = { title: "Fit", theme: "midnight", themeCss: "", root: os.tmpdir(), slides };
  await assert.rejects(() => exportVideo(presentation, { outputDir: os.tmpdir(), duration: 0.1, fps: 10 }), /too short for 8 slide/);
  await assert.rejects(() => exportVideo(presentation, { outputDir: os.tmpdir(), duration: 4, transition: "fade", transitionDuration: 1 }), /does not fit 8 slide/);
  await assert.rejects(() => exportVideo(presentation, { outputDir: os.tmpdir(), duration: 4, transition: "zoom" }), /none, fade, or slide/);
});

test("a faded video keeps its duration and leaves README.txt alone", { timeout: 120_000 }, async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "---\ntitle: Moves\n---\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n");
  await fs.writeFile(path.join(dir, "README.txt"), "mine\n");
  const output = path.join(dir, "talk.mp4");
  const result = await exportVideo(await discoverPresentation(dir), { preset: "x", outputDir: output, duration: 3, fps: 10, transition: "fade", transitionDuration: 0.5 });
  assert.equal(result.transition, "fade");
  const { frames, duration } = await probe(output);
  assert.equal(frames, 30);
  assert.ok(Math.abs(duration - 3) < 0.05, `expected 3s, got ${duration}`);
  assert.equal(await fs.readFile(path.join(dir, "README.txt"), "utf8"), "mine\n");
  assert.match(await fs.readFile(`${output}.txt`, "utf8"), /Transition: fade, 0\.5s/);
}));

test("the player animates a slide change, frees browser shortcuts, and stops when the playing tab closes", { timeout: 60_000 }, async () => fixture(async (dir) => {
  await fs.mkdir(path.join(dir, "assets"));
  await fs.writeFile(path.join(dir, "assets", "chart.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  await fs.writeFile(path.join(dir, "talk.slide.md"), deckSource);
  await fs.writeFile(path.join(dir, "configuration.yml"), "presentation:\n  interval: 30\n  transition: slide\n  transition_duration: 2\n");
  const deck = await discoverPresentation(dir);
  const instance = await startServer(deck);
  const browser = await chromium.launch({ headless: true });
  try {
    const payload = await fetch(`${instance.url}/api/presentation`).then((response) => response.json());
    assert.deepEqual(payload.playback.transition, { type: "slide", duration: 2 });
    const noteImage = payload.slides[0].notesHtml.match(/src="([^"]+)"/)[1];
    assert.notEqual(noteImage, "assets/chart.png");
    assert.equal((await fetch(new URL(noteImage, `${instance.url}/announcer`))).status, 200);

    const context = await browser.newContext();
    const audience = await context.newPage();
    const announcer = await context.newPage();
    await audience.goto(instance.url);
    await announcer.goto(`${instance.url}/announcer`);
    const running = (page) => page.evaluate(() => document.querySelector("#slide").shadowRoot.querySelector(".slide-root").getAnimations().length);
    await audience.waitForFunction(() => document.querySelector("#counter")?.textContent === "1 / 3");
    await announcer.waitForFunction(() => document.querySelector("#counter")?.textContent === "1 / 3");
    assert.equal(await running(audience), 0);

    await announcer.click("#next");
    await audience.waitForFunction(() => document.querySelector("#counter")?.textContent === "2 / 3");
    assert.equal(await running(audience), 1);
    assert.equal(await running(announcer), 1);

    const printKept = await audience.evaluate(() => {
      const event = new KeyboardEvent("keydown", { key: "p", metaKey: true, cancelable: true, bubbles: true });
      document.dispatchEvent(event);
      return !event.defaultPrevented && document.querySelector("#play").getAttribute("aria-pressed") === "false";
    });
    assert.equal(printKept, true);

    await audience.click("#play");
    await announcer.waitForFunction(() => document.querySelector("#play")?.getAttribute("aria-pressed") === "true");
    await audience.close();
    await announcer.waitForFunction(() => document.querySelector("#play")?.getAttribute("aria-pressed") === "false");

    const still = await context.newPage();
    await still.emulateMedia({ reducedMotion: "reduce" });
    await still.goto(instance.url);
    await still.waitForFunction(() => document.querySelector("#counter")?.textContent === "2 / 3");
    await still.click("#next");
    await still.waitForFunction(() => document.querySelector("#counter")?.textContent === "3 / 3");
    assert.equal(await running(still), 0);
  } finally {
    await browser.close();
    await new Promise((resolve) => instance.server.close(resolve));
  }
}));
