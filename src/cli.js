import { spawn } from "node:child_process";
import { discoverPresentation } from "./presentation.js";
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
  console.log("");
  console.log(`  Open: ${instance.url}`);
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");
  openBrowser(instance.url);
  return instance;
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
