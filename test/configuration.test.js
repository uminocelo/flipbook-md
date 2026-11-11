import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfiguration, playbackFromConfiguration, resolveExportOptions } from "../src/configuration.js";
import { discoverPresentation } from "../src/presentation.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function runFlipbook(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repo, "bin/flipbook.js"), ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("reads export and playback settings from configuration.yml", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "configuration.yml"), `export:\n  format: video\n  duration: 9\n  preset: instagram\n  fps: 12\n  output: dist/custom\npresentation:\n  interval: 4\n`);
  const config = await loadConfiguration(dir);
  assert.equal(playbackFromConfiguration(config).interval, 4);
  const resolved = resolveExportOptions(config, { duration: "2", preset: "x" });
  assert.equal(resolved.format, "video");
  assert.equal(resolved.duration, 2);
  assert.equal(resolved.preset, "x");
  assert.equal(resolved.fps, 12);
  assert.equal(resolved.outputDir, "dist/custom");
  assert.deepEqual(resolveExportOptions(config, { format: "carousel" }), {
    format: "carousel",
    preset: "instagram",
    outputDir: "dist/custom",
    duration: 9,
    fps: 12,
    transition: "none",
    transitionDuration: 0.4
  });
}));

test("accepts top-level export aliases when export does not set them", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "configuration.yml"), "format: video\nduration: 8\npreset: tiktok\n");
  const resolved = resolveExportOptions(await loadConfiguration(dir), {});
  assert.equal(resolved.format, "video");
  assert.equal(resolved.duration, 8);
  assert.equal(resolved.preset, "tiktok");
  assert.equal(resolved.fps, 30);
  assert.equal(resolved.outputDir, "dist/video");
}));

test("rejects a video export without a duration", () => {
  assert.throws(() => resolveExportOptions({ export: { format: "video" } }, {}), /duration/);
  assert.throws(() => resolveExportOptions({ export: { format: "video", duration: 10, fps: 1.5 } }, {}), /fps/);
  assert.throws(() => resolveExportOptions({ export: { format: "video", duration: 1801 } }, {}), /1800/);
  assert.throws(() => resolveExportOptions({ export: { format: "gif" } }, {}), /carousel or video/);
});

test("attaches playback from configuration.yml and defaults the interval", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "a.slide.md"), "# A\n\n---\n\n# B\n");
  assert.equal((await discoverPresentation(dir)).playback.interval, 5);
  await fs.writeFile(path.join(dir, "configuration.yml"), "presentation:\n  interval: 8\n");
  assert.equal((await discoverPresentation(dir)).playback.interval, 8);
  await fs.writeFile(path.join(dir, "configuration.yml"), "presentation:\n  interval: 0\n");
  await assert.rejects(() => discoverPresentation(dir), /presentation\.interval/);
  await fs.writeFile(path.join(dir, "configuration.yml"), "export: [\n");
  await assert.rejects(() => discoverPresentation(dir), /not valid YAML/);
}));

test("rejects a configuration.yml symlink that leaves the deck", async () => fixture(async (dir) => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-outside-"));
  try {
    await fs.writeFile(path.join(outside, "configuration.yml"), "presentation:\n  interval: 2\n");
    await fs.symlink(path.join(outside, "configuration.yml"), path.join(dir, "configuration.yml"));
    await fs.writeFile(path.join(dir, "a.slide.md"), "# A\n");
    await assert.rejects(() => discoverPresentation(dir), /outside the presentation directory/);
  } finally {
    await fs.rm(outside, { recursive: true, force: true });
  }
}));

test("the CLI refuses a video export that has no duration", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# One\n\n---\n\n# Two\n");
  const result = await runFlipbook(["export", ".", "--format", "video"], dir);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /duration/);
}));

test("the CLI treats the path as optional and names a flag it cannot read", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# One\n\n---\n\n# Two\n");
  const noPath = await runFlipbook(["export", "--format", "video"], dir);
  assert.equal(noPath.code, 1);
  assert.match(noPath.stderr, /needs a duration/);
  assert.doesNotMatch(noPath.stderr, /Path does not exist/);
  const noValue = await runFlipbook(["export", ".", "--format"], dir);
  assert.equal(noValue.code, 1);
  assert.match(noValue.stderr, /--format needs a value/);
  const flagAsValue = await runFlipbook(["export", "--duration", "--format", "video"], dir);
  assert.match(flagAsValue.stderr, /--duration needs a value/);
  const typo = await runFlipbook(["export", ".", "--transtion", "fade"], dir);
  assert.equal(typo.code, 1);
  assert.match(typo.stderr, /Unknown option: --transtion/);
  const negative = await runFlipbook(["export", ".", "--format", "video", "--duration", "-5"], dir);
  assert.match(negative.stderr, /greater than 0/);
}));
