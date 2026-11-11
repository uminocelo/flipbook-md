import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parseChrome } from "./chrome.js";
import { parsePlacement, templateLibraryDirs } from "./templates.js";

const GROUP_NAME = /^[a-z][a-z0-9_-]*$/;
const THEME_NAME = /^[a-z0-9-]+$/;
const CANVASES = new Set(["midnight", "light", "paper", "forest"]);

export async function loadGroup(name) {
  const key = String(name ?? "").trim();
  if (!GROUP_NAME.test(key)) throw new Error(`Template group "${name}" is not a valid name.`);
  const file = await findGroupFile(key);
  if (!file) throw new Error(`Unknown template group "${key}".`);
  let parsed;
  try {
    parsed = parseYaml(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error(`Template group "${key}" is not valid YAML.`);
  }
  return normalizeGroup(parsed, key);
}

export function normalizeGroup(parsed, key) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Template group "${key}" must be a YAML object.`);
  }
  const name = String(parsed.name ?? "").trim();
  if (name !== key) throw new Error(`Template group file ${key}.yml must set name to "${key}".`);
  const themes = normalizeThemes(parsed.themes, key);
  const style = String(parsed.style ?? "").trim();
  if (!THEME_NAME.test(style) || (themes.length && !themes.includes(style))) {
    throw new Error(`Template group "${key}" style must be one of its themes.`);
  }
  const canvas = String(parsed.canvas ?? "midnight").trim();
  if (!CANVASES.has(canvas)) throw new Error(`Template group "${key}" has an invalid canvas.`);
  if (!parsed.templates || typeof parsed.templates !== "object" || Array.isArray(parsed.templates)) {
    throw new Error(`Template group "${key}" must define templates.`);
  }
  const templates = {};
  for (const [templateName, value] of Object.entries(parsed.templates)) {
    const placement = parsePlacement(templateName, value);
    if (!placement.name.startsWith(`${key}_`)) {
      throw new Error(`Template group "${key}" template "${placement.name}" must start with ${key}_.`);
    }
    templates[placement.name] = placement;
  }
  if (!parsed.blueprint || typeof parsed.blueprint !== "object" || Array.isArray(parsed.blueprint)) {
    throw new Error(`Template group "${key}" must define a blueprint.`);
  }
  return {
    name,
    description: String(parsed.description ?? "").trim(),
    themes,
    style,
    canvas,
    chrome: parseChrome(parsed.chrome),
    chromeSource: parsed.chrome,
    templates,
    blueprint: parsed.blueprint
  };
}

async function findGroupFile(key) {
  for (const dir of templateLibraryDirs()) {
    const candidate = path.join(dir, `${key}.yml`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the built-in library after the home library.
    }
  }
  return null;
}

function normalizeThemes(value, key) {
  if (!Array.isArray(value) || value.length === 0 || value.some((theme) => !THEME_NAME.test(String(theme)))) {
    throw new Error(`Template group "${key}" must list its themes.`);
  }
  return value.map((theme) => String(theme));
}
