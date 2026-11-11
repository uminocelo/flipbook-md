#!/usr/bin/env node
import { show, exportSlides, check, templateAdd } from "../src/cli.js";
import { PRESETS } from "../src/export.js";

const [command, ...rest] = process.argv.slice(2);
// The path is optional. A first argument that is a flag means the current directory.
const hasPath = rest.length > 0 && !rest[0].startsWith("-");
const inputPath = hasPath ? rest[0] : ".";
const args = hasPath ? rest.slice(1) : rest;
const EXPORT_FLAGS = ["--format", "--preset", "--output", "--duration", "--fps", "--transition", "--transition-duration"];
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  // A negative number is a value, so the range check can report it.
  if (value == null || (value.startsWith("-") && !/^-\d/.test(value))) {
    throw new Error(`${name} needs a value.`);
  }
  return value;
}
function rejectUnknownFlags(known) {
  const unknown = args.find((arg) => arg.startsWith("--") && !known.includes(arg));
  if (unknown) throw new Error(`Unknown option: ${unknown}. Run "flipbook --help" for usage.`);
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
    rejectUnknownFlags(EXPORT_FLAGS);
    await exportSlides(inputPath, {
      format: option("--format"),
      preset: option("--preset"),
      outputDir: option("--output"),
      duration: option("--duration"),
      fps: option("--fps"),
      transition: option("--transition"),
      transitionDuration: option("--transition-duration")
    });
  } else if (["--help", "-h", "help"].includes(command)) {
    console.log(`Flipbook MD

Usage:
  flipbook show [path]
  flipbook check [path]
  flipbook template add <name> --column <n> --row <n> --width <n> --height <n> --align start|center|end
  flipbook export [path] [--format carousel|video] [--preset <preset>] [--output <dir-or-file>]
  flipbook export [path] --format video --duration <seconds> [--fps <n>] [--preset <preset>]
                  [--transition none|fade|slide] [--transition-duration <seconds>]

A flag you omit is read from configuration.yml in the deck. Video duration is the whole MP4, in seconds.

Examples:
  flipbook show .
  flipbook check .
  flipbook template add quote --column 1 --row 2 --width 2 --height 1 --align start
  flipbook export examples/system-design.slide.md --preset instagram
  flipbook export . --preset x --output dist/x-carousel
  flipbook export . --format video --duration 60 --preset instagram
  flipbook export . --format video --duration 60 --transition fade

Export presets:
${Object.values(PRESETS).map((preset) => `  ${preset.label.padEnd(20)}${`${preset.width} × ${preset.height}`.padEnd(13)}${preset.use}`).join("\n")}

Carousel and video export need Chromium. After npm install, run: npx playwright install chromium
Video export also needs ffmpeg on PATH.`);
  } else throw new Error(`Unknown command: ${command}. Run "flipbook --help" for usage.`);
} catch (error) {
  if (Array.isArray(error.violations)) console.error(error.violations.join("\n"));
  else console.error(`\nFlipbook MD: ${error.message}\n`);
  process.exitCode = 1;
}
