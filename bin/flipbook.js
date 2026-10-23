#!/usr/bin/env node
import { show, exportSlides } from "../src/cli.js";

const [command, inputPath = ".", ...args] = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
try {
  if (!command || command === "show") {
    await show(command ? inputPath : ".");
  } else if (command === "export") {
    const format = option("--format", "carousel");
    const preset = option("--preset", "instagram");
    const output = option("--output", `dist/${format}`);
    if (format !== "carousel") throw new Error(`Unsupported export format: ${format}. Currently supported: carousel.`);
    await exportSlides(inputPath, { preset, outputDir: output });
  } else if (["--help", "-h", "help"].includes(command)) {
    console.log(`Flipbook MD

Usage:
  flipbook show [path]
  flipbook export [path] --format carousel --preset instagram|x --output dist/carousel

Examples:
  flipbook show .
  flipbook export examples/system-design.slide.md --preset instagram
  flipbook export . --preset x --output dist/x-carousel

Export requires Chromium. After npm install, run: npx playwright install chromium`);
  } else throw new Error(`Unknown command: ${command}. Run "flipbook --help" for usage.`);
} catch (error) {
  console.error(`\nFlipbook MD: ${error.message}\n`);
  process.exitCode = 1;
}
