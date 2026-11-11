import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Placements are CSS grid lines on a 3×3 grid. `flow` has no area.
export const DEFAULT_TEMPLATE = "flow";

export const TEMPLATES = {
  flow: { name: "flow", area: null },
  cover: { name: "cover", area: { column: "2", row: "2" } },
  summary: { name: "summary", area: { column: "2 / 4", row: "2 / 4" } }
};

const TEMPLATE_COMMENT = /<!--\s*template:\s*([^>]*?)\s*-->/gi;
const TEMPLATE_NAME = /^[a-z][a-z0-9_-]*$/;
const ALIGNS = new Set(["start", "center", "end"]);
const ROLES = new Set(["cover", "toc", "topics", "media", "quote", "callout", "timeline", "content"]);
const LAYOUTS = new Set(["poster", "list", "topics", "media", "quote", "callout", "timeline", "content"]);
const DENSITIES = new Set(["short", "medium"]);

export function lookupTemplate(name, extra = {}) {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return { found: false, name: "" };
  const template = TEMPLATES[key] ?? extra?.[key];
  if (!template) return { found: false, name: key };
  return { found: true, template };
}

export function resolveSlideTemplate(frontmatterValue, markdown, slideNumber, extra = {}) {
  const comments = [];
  const body = String(markdown ?? "").replace(TEMPLATE_COMMENT, (_, raw) => {
    comments.push(String(raw).trim());
    return "";
  });
  const frontmatter = frontmatterValue == null ? "" : String(frontmatterValue).trim();
  const raw = frontmatter || comments[0] || "";
  if (!raw) return { template: DEFAULT_TEMPLATE, explicit: false, body };
  const result = lookupTemplate(raw, extra);
  if (!result.found) {
    throw new Error(`Slide ${slideNumber} uses unknown template "${result.name}".`);
  }
  return { template: result.template.name, explicit: true, body };
}

export function flipbookHome() {
  const override = process.env.FLIPBOOK_HOME;
  if (override && override.trim()) return path.resolve(override);
  return path.join(os.homedir(), "Documents", "flipbook");
}

export function libraryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../library");
}

export function templateLibraryDirs() {
  return [path.join(flipbookHome(), "templates"), path.join(libraryRoot(), "templates")];
}

export function themeLibraryDirs() {
  return [path.join(flipbookHome(), "themes"), path.join(libraryRoot(), "themes")];
}

export function parsePlacement(name, value) {
  const key = String(name ?? "").trim().toLowerCase();
  if (!TEMPLATE_NAME.test(key) || TEMPLATES[key]) {
    throw new Error(`templates.yml template "${name}" is not a valid template name.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`templates.yml template "${key}" must be a mapping.`);
  }
  const column = integerField(value.column, key, "column");
  const row = integerField(value.row, key, "row");
  const width = integerField(value.width, key, "width");
  const height = integerField(value.height, key, "height");
  const align = String(value.align ?? "").trim().toLowerCase();
  if (!ALIGNS.has(align)) throw new Error(`templates.yml template "${key}" has an invalid align.`);
  if (column < 1 || row < 1 || width < 1 || height < 1 || column + width > 4 || row + height > 4) {
    throw new Error(`templates.yml template "${key}" leaves the 3x3 grid.`);
  }
  return {
    name: key,
    column,
    row,
    width,
    height,
    align,
    role: optionalToken(value.role, ROLES, key, "role"),
    layout: optionalToken(value.layout, LAYOUTS, key, "layout"),
    density: optionalToken(value.density, DENSITIES, key, "density"),
    area: { column: lineSpan(column, width), row: lineSpan(row, height) }
  };
}

export function parseTemplatesDocument(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("templates.yml must contain a YAML object.");
  }
  const templates = {};
  for (const [name, value] of Object.entries(parsed)) {
    const placement = parsePlacement(name, value);
    templates[placement.name] = placement;
  }
  return templates;
}

export async function loadDeckTemplates(root) {
  const file = path.join(root, "templates.yml");
  try {
    await fs.access(file);
  } catch {
    return {};
  }
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(file);
  const relative = path.relative(realRoot, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("templates.yml resolves outside the presentation directory.");
  }
  let parsed;
  try {
    parsed = parseYaml(await fs.readFile(real, "utf8"));
  } catch {
    throw new Error("templates.yml is not valid YAML.");
  }
  return parseTemplatesDocument(parsed);
}

export function deckTemplateCss(hostSelector, templates = {}) {
  const list = Object.values(templates ?? {}).filter((template) => template?.area && TEMPLATE_NAME.test(template.name));
  if (!list.length) return "";
  let css = "";
  if (hostSelector === ".slide-root") {
    const hosts = list.map((template) => `:host:has(.slide-root[data-template="${template.name}"])`).join(",");
    const articles = list.map((template) => `.slide-root[data-template="${template.name}"]`).join(",");
    css += `${hosts}{height:min(65vh,660px)}${articles}{flex:1 1 auto;align-self:stretch;width:100%;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}`;
  } else {
    const hosts = list.map((template) => `${hostSelector}[data-template="${template.name}"]`).join(",");
    css += `${hosts}{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}`;
  }
  for (const template of list) {
    css += `${hostSelector}[data-template="${template.name}"] .slide-body{grid-column:${template.area.column};grid-row:${template.area.row};${alignDeclarations(template.align)}}`;
  }
  return css;
}

export async function addSavedTemplate(fields, deckDir = process.cwd()) {
  const placement = parsePlacement(fields.name, fields);
  const deck = await readDeckTemplates(deckDir);
  const libraryDir = path.join(flipbookHome(), "templates");
  await fs.mkdir(libraryDir, { recursive: true });
  const libraryFile = path.join(libraryDir, `${placement.name}.yml`);
  await fs.writeFile(libraryFile, placementSource(placement));
  let deckFile = null;
  if (deck) {
    deck.map[placement.name] = placementFields(placement);
    deckFile = path.join(deckDir, "templates.yml");
    await fs.writeFile(deckFile, stringifyYaml(deck.map));
  }
  return { libraryFile, deckFile, placement };
}

function lineSpan(start, size) {
  return size === 1 ? String(start) : `${start} / ${start + size}`;
}

function integerField(value, name, field) {
  if (!Number.isInteger(value)) throw new Error(`templates.yml template "${name}" has an invalid ${field}.`);
  return value;
}

function optionalToken(value, allowed, name, field) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim().toLowerCase();
  if (!allowed.has(text)) throw new Error(`templates.yml template "${name}" has an invalid ${field}.`);
  return text;
}

function alignDeclarations(align) {
  if (align === "center") return "align-self:center;justify-self:center;text-align:center";
  if (align === "end") return "align-self:end;justify-self:end";
  return "align-self:start;justify-self:start";
}

function placementFields(placement) {
  return {
    column: placement.column,
    row: placement.row,
    width: placement.width,
    height: placement.height,
    align: placement.align
  };
}

function placementSource(placement) {
  const fields = placementFields(placement);
  return `column: ${fields.column}\nrow: ${fields.row}\nwidth: ${fields.width}\nheight: ${fields.height}\nalign: ${fields.align}\n`;
}

async function readDeckTemplates(deckDir) {
  let entries = [];
  try {
    entries = await fs.readdir(deckDir);
  } catch {
    return null;
  }
  const deck = entries.includes("presentation.yml") || entries.some((name) => name.endsWith(".slide.md"));
  if (!deck) return null;
  const file = path.join(deckDir, "templates.yml");
  try {
    await fs.access(file);
  } catch {
    return { map: {} };
  }
  let parsed;
  try {
    parsed = parseYaml(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error("templates.yml is not valid YAML.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("templates.yml must contain a YAML object.");
  }
  return { map: parsed };
}

export function templateAreaCss(hostSelector) {
  const cover = TEMPLATES.cover.area;
  const summary = TEMPLATES.summary.area;
  return `${hostSelector}[data-template="cover"],${hostSelector}[data-template="summary"]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}${hostSelector}[data-template="cover"] .slide-body{grid-column:${cover.column};grid-row:${cover.row};align-self:center;justify-self:center;text-align:center}${hostSelector}[data-template="summary"] .slide-body{grid-column:${summary.column};grid-row:${summary.row};align-self:end;justify-self:stretch}`;
}
