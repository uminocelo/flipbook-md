import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportVideo } from "../src/export.js";

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

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], (error, stdout) => {
      if (error) reject(error);
      else resolve(Number(stdout.trim()));
    });
  });
}

test("video export rejects a missing duration before it renders", async () => {
  const presentation = { title: "Short", theme: "midnight", themeCss: "", root: os.tmpdir(), slides: [{ index: 0, title: "One", html: "<h1>One</h1>" }] };
  await assert.rejects(() => exportVideo(presentation, { outputDir: os.tmpdir() }), /duration/);
});

test("exports an mp4 from configuration.yml with CLI overrides", { timeout: 120_000 }, async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "---\ntitle: Two Beats\n---\n# One\n\nFirst frame.\n\n---\n\n# Two\n\nSecond frame.\n");
  await fs.writeFile(path.join(dir, "configuration.yml"), "export:\n  format: video\n  duration: 9\n  preset: instagram\n  fps: 12\n");
  const output = path.join(dir, "talk.mp4");
  const result = await runFlipbook(["export", ".", "--duration", "2", "--preset", "x", "--fps", "10", "--output", output], dir);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /exported a 2s video/);
  assert.match(result.stdout, /x \(1080 × 1080\), 10 fps/);
  assert.doesNotMatch(result.stdout, /9s/);
  const stat = await fs.stat(output);
  assert.equal(stat.isFile(), true);
  assert.ok(stat.size > 1000);
  const duration = await probeDuration(output);
  assert.ok(duration >= 1.9 && duration <= 2.15, `expected about 2s, got ${duration}`);
  const names = await fs.readdir(dir);
  assert.equal(names.some((name) => name.endsWith(".png")), false);
  const readme = await fs.readFile(path.join(dir, "talk.mp4.txt"), "utf8");
  assert.match(readme, /Format: video/);
  assert.match(readme, /talk\.mp4/);
}));
