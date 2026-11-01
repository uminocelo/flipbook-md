import { spawn } from "node:child_process";
import { discoverPresentation } from "./presentation.js";
import { addSavedTemplate } from "./templates.js";
import { startServer } from "./server.js";
import { exportCarousel } from "./export.js";

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open"
    : platform === "win32" ? "cmd"
    : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Printing the URL is enough if the browser cannot be launched.
  }
}

export async function show(inputPath = ".") {
  const presentation = await discoverPresentation(inputPath);
  const instance = await startServer(presentation);
  console.log("");
  console.log(`  Flipbook MD — ${presentation.title}`);
  console.log(`  ${presentation.slides.length} slide(s)`);
  if (presentation.themeCss) console.log("  Custom theme: presentation.css");
  console.log("");
  console.log(`  Open: ${instance.url}`);
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");
  openBrowser(instance.url);
  return instance;
}


export async function check(inputPath = ".") {
  const presentation = await discoverPresentation(inputPath);
  console.log("");
  if (!presentation.blueprint) console.log("  Flipbook MD — no blueprint");
  else console.log(`  Flipbook MD — ${presentation.slides.length} slide(s) match the blueprint`);
  console.log("");
  return presentation;
}

export async function templateAdd(args, deckDir = process.cwd()) {
  const [name, ...flags] = args;
  if (!name || name.startsWith("-")) throw new Error("flipbook template add requires a template name.");
  const column = flagValue(flags, "--column");
  const row = flagValue(flags, "--row");
  const width = flagValue(flags, "--width");
  const height = flagValue(flags, "--height");
  const align = flagValue(flags, "--align");
  if ([column, row, width, height, align].some((value) => value == null)) {
    throw new Error("flipbook template add requires --column, --row, --width, --height, and --align.");
  }
  const numbers = { column, row, width, height };
  for (const [key, value] of Object.entries(numbers)) {
    if (!/^\d+$/.test(value)) throw new Error(`flipbook template add: --${key} must be an integer.`);
    numbers[key] = Number(value);
  }
  const result = await addSavedTemplate({ name, align, ...numbers }, deckDir);
  console.log("");
  console.log(`  Flipbook MD — template ${result.placement.name}`);
  console.log(`  Library: ${result.libraryFile}`);
  if (result.deckFile) console.log(`  Deck: ${result.deckFile}`);
  console.log("");
  return result;
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) return undefined;
  return value;
}

export async function exportSlides(inputPath = ".", options = {}) {
  const presentation = await discoverPresentation(inputPath);
  const result = await exportCarousel(presentation, options);
  console.log("");
  console.log(`  Flipbook MD — exported ${result.count} slide image(s)`);
  console.log(`  Format: ${result.preset} (${result.width} × ${result.height})`);
  console.log(`  Output: ${result.outputDir}`);
  console.log("");
  return result;
}
