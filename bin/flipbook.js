#!/usr/bin/env node
import { show, exportSlides, check, templateAdd } from "../src/cli.js";
import { PRESETS } from "../src/export.js";

const [command, inputPath = ".", ...args] = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
try {
  if (!command || command === "show") {
    await show(command ? inputPath : ".");
  } else if (command === "check") {
    await check(inputPath);
  } else if (command === "template") {
    if (inputPath !== "add") throw new Error(`Unknown template command: ${inputPath}. Use "flipbook template add".`);
    await templateAdd(args);
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
  flipbook check [path]
  flipbook template add <name> --column <n> --row <n> --width <n> --height <n> --align start|center|end
  flipbook export [path] --format carousel --preset <preset> --output dist/carousel

Examples:
  flipbook show .
  flipbook check .
  flipbook template add quote --column 1 --row 2 --width 2 --height 1 --align start
  flipbook export examples/system-design.slide.md --preset instagram
  flipbook export . --preset x --output dist/x-carousel

Export presets:
${Object.values(PRESETS).map((preset) => `  ${preset.label.padEnd(20)}${`${preset.width} × ${preset.height}`.padEnd(13)}${preset.use}`).join("\n")}

Export requires Chromium. After npm install, run: npx playwright install chromium`);
  } else throw new Error(`Unknown command: ${command}. Run "flipbook --help" for usage.`);
} catch (error) {
  if (Array.isArray(error.violations)) console.error(error.violations.join("\n"));
  else console.error(`\nFlipbook MD: ${error.message}\n`);
  process.exitCode = 1;
}
