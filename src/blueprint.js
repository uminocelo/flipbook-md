import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import { TEMPLATES } from "./templates.js";

const TYPE_NAME = /^[a-z][a-z0-9-]*$/;
const FILENAME_TYPE = /_([a-zA-Z][a-zA-Z0-9-]*)\.slide\.md$/;
const TYPE_COMMENT = /<!--\s*type:\s*([^>]*?)\s*-->/gi;
const DIRECTIVE_COMMENT = /<!--\s*(?:template|type):\s*[^>]*?-->/gi;
const KINDS = new Set(["heading", "paragraph", "list", "code", "image", "blockquote", "table"]);

export class BlueprintError extends Error {
  constructor(violations) {
    super(violations.join("\n"));
    this.violations = violations;
  }
}

export function pageTypeFromFilename(filePath) {
  const match = path.basename(String(filePath ?? "")).match(FILENAME_TYPE);
  if (!match) return null;
  const name = match[1].toLowerCase();
  return TYPE_NAME.test(name) ? name : null;
}

export function readPageType(markdown, slideNumber) {
  const comments = [];
  const body = String(markdown ?? "").replace(TYPE_COMMENT, (_, raw) => {
    comments.push(String(raw).trim());
    return "";
  });
  if (!comments[0]) return { type: null, body };
  const name = comments[0].toLowerCase();
  if (!TYPE_NAME.test(name)) {
    throw new Error(`Slide ${slideNumber} uses invalid page type "${name}".`);
  }
  return { type: name, body };
}

export function measureMarkdown(markdown) {
  const source = String(markdown ?? "").replace(DIRECTIVE_COMMENT, "");
  const seen = walkBlocks(marked.lexer(source), false);
  return {
    kinds: [...seen.kinds],
    chars: Array.from(seen.text).length,
    items: seen.items
  };
}

function walkBlocks(tokens, inside) {
  let text = "";
  let items = 0;
  const kinds = new Set();
  for (const token of tokens ?? []) {
    if (token.type === "space" || token.type === "hr" || token.type === "html") continue;
    if (token.type === "heading") {
      if (!inside) kinds.add("heading");
      text += inlineText(token.tokens);
    } else if (token.type === "paragraph") {
      const inline = inlineParts(token.tokens);
      if (!inside) {
        if (inline.textual || !inline.kinds.has("image")) kinds.add("paragraph");
        for (const kind of inline.kinds) kinds.add(kind);
      }
      text += inline.text;
    } else if (token.type === "text") {
      text += token.tokens?.length ? inlineText(token.tokens) : (token.text ?? "");
    } else if (token.type === "list") {
      if (!inside) {
        kinds.add("list");
        items += token.items?.length ?? 0;
      }
      for (const item of token.items ?? []) {
        const inner = walkBlocks(item.tokens, true);
        text += inner.text;
      }
    } else if (token.type === "code") {
      if (!inside) kinds.add("code");
      text += token.text ?? "";
    } else if (token.type === "blockquote") {
      if (!inside) kinds.add("blockquote");
      const inner = walkBlocks(token.tokens, true);
      text += inner.text;
    } else if (token.type === "table") {
      if (!inside) kinds.add("table");
      for (const cell of token.header ?? []) text += inlineText(cell.tokens);
      for (const row of token.rows ?? []) {
        for (const cell of row) text += inlineText(cell.tokens);
      }
    }
  }
  return { text, kinds, items };
}

function inlineParts(tokens) {
  let text = "";
  const kinds = new Set();
  let textual = false;
  for (const token of tokens ?? []) {
    if (token.type === "image") {
      kinds.add("image");
      text += token.text ?? "";
      continue;
    }
    const piece = token.tokens?.length ? inlineText(token.tokens) : (token.text ?? "");
    if (piece.trim()) textual = true;
    text += piece;
  }
  return { text, kinds, textual };
}

function inlineText(tokens) {
  return inlineParts(tokens).text;
}

export async function loadBlueprint(root, extraTemplates = {}) {
  const file = path.join(root, "blueprint.yml");
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(file);
  const relative = path.relative(realRoot, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("blueprint.yml resolves outside the presentation directory.");
  }
  let parsed;
  try {
    parsed = parseYaml(await fs.readFile(real, "utf8"));
  } catch {
    throw new Error("blueprint.yml is not valid YAML.");
  }
  return normalizeBlueprint(parsed, extraTemplates);
}

function normalizeBlueprint(parsed, extraTemplates = {}) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("blueprint.yml must contain a YAML object.");
  }
  if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error("blueprint.yml must define a non-empty \"pages\" list.");
  }
  if (!parsed.types || typeof parsed.types !== "object" || Array.isArray(parsed.types)) {
    throw new Error("blueprint.yml must define a \"types\" map.");
  }

  const types = {};
  for (const [name, rules] of Object.entries(parsed.types)) {
    if (!TYPE_NAME.test(name)) {
      throw new Error(`blueprint.yml type "${name}" is not a valid type name.`);
    }
    types[name] = normalizeRules(rules, `type "${name}"`, extraTemplates);
  }

  const pages = parsed.pages.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error(`blueprint.yml page ${index + 1} must be a mapping.`);
    }
    const type = String(step.type ?? "");
    if (!TYPE_NAME.test(type)) {
      throw new Error(`blueprint.yml page ${index + 1} has an invalid type "${type}".`);
    }
    if (!types[type]) {
      throw new Error(`blueprint.yml page ${index + 1} uses unknown type "${type}".`);
    }
    return {
      type,
      repeat: normalizeRepeat(step.repeat, `page ${index + 1}`),
      ...overrides(step, `page ${index + 1}`)
    };
  });

  return { pages, types };
}

function normalizeRules(rules, where, extraTemplates = {}) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new Error(`blueprint.yml ${where} must be a mapping.`);
  }
  const template = rules.template == null ? null : String(rules.template).trim().toLowerCase();
  if (template && !TEMPLATES[template] && !extraTemplates[template]) {
    throw new Error(`blueprint.yml ${where} uses unknown template "${template}".`);
  }
  return {
    template,
    ...overrides(rules, where)
  };
}

function overrides(source, where) {
  const result = {};
  if (source.max_chars != null) result.max_chars = normalizeCount(source.max_chars, where, "max_chars");
  if (source.max_items != null) result.max_items = normalizeCount(source.max_items, where, "max_items");
  if (source.require != null) result.require = normalizeKinds(source.require, where, "require");
  if (source.allow != null) result.allow = normalizeKinds(source.allow, where, "allow");
  if (source.forbid != null) result.forbid = normalizeKinds(source.forbid, where, "forbid");
  return result;
}

function normalizeCount(value, where, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`blueprint.yml ${where} has an invalid ${field}.`);
  }
  return value;
}

function normalizeKinds(value, where, field) {
  if (!Array.isArray(value) || value.some((kind) => !KINDS.has(kind))) {
    throw new Error(`blueprint.yml ${where} has an invalid ${field} list.`);
  }
  return [...value];
}

function normalizeRepeat(value, where) {
  if (value == null) return { min: 1, max: 1 };
  if (Number.isInteger(value) && value >= 1) return { min: value, max: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const min = value.min ?? 0;
    const max = value.max;
    if (Number.isInteger(min) && min >= 0 && Number.isInteger(max) && max >= min) {
      return { min, max };
    }
  }
  throw new Error(`blueprint.yml ${where} has an invalid repeat.`);
}

export function evaluateBlueprint(deck, blueprint) {
  const sequence = matchPages(deck.slides, blueprint.pages);
  if (!sequence.ok) return sequence.violations;
  const violations = [];
  for (const { slide, step } of sequence.pairs) {
    const rules = blueprint.types[slide.type];
    if (rules.template) {
      if (slide.templateExplicit && slide.template !== rules.template) {
        violations.push(`${slide.source}: template is ${slide.template}; blueprint type ${slide.type} requires ${rules.template}.`);
      } else if (!slide.templateExplicit) {
        slide.template = rules.template;
      }
    }
    const maxChars = step.max_chars ?? rules.max_chars;
    const allow = step.allow ?? rules.allow;
    const forbid = step.forbid ?? rules.forbid;
    const maxItems = step.max_items ?? rules.max_items;
    const require = step.require ?? rules.require;
    const measured = measureMarkdown(slide.markdown ?? "");
    if (maxChars != null && measured.chars > maxChars) {
      violations.push(`${slide.source}: visible text is ${measured.chars} characters; maximum is ${maxChars}.`);
    }
    if (maxItems != null && measured.items > maxItems) {
      violations.push(`${slide.source}: lists have ${measured.items} items; maximum is ${maxItems}.`);
    }
    for (const kind of require ?? []) {
      if (!measured.kinds.includes(kind)) violations.push(`${slide.source}: ${kind} is required.`);
    }
    for (const kind of measured.kinds) {
      if ((allow && !allow.includes(kind)) || (forbid && forbid.includes(kind))) {
        violations.push(`${slide.source}: ${kind} is not allowed.`);
      }
    }
  }
  return violations;
}

function matchPages(slides, pages) {
  const result = walk(slides, pages, 0, 0, []);
  return result.ok ? { ok: true, pairs: result.pairs } : { ok: false, violations: result.violations };
}

function walk(slides, pages, slideIndex, stepIndex, pairs) {
  if (stepIndex === pages.length) {
    if (slideIndex === slides.length) return { ok: true, pairs };
    return {
      ok: false,
      violations: slides.slice(slideIndex).map((slide) => {
        const found = slide.type ? `type ${slide.type}` : "no page type";
        return `${slide.source}: unexpected slide (${found}) after the blueprint pages.`;
      })
    };
  }

  const step = pages[stepIndex];
  let closest = null;
  for (let count = step.repeat.min; count <= step.repeat.max; count += 1) {
    const slice = slides.slice(slideIndex, slideIndex + count);
    if (slice.length !== count || slice.some((slide) => slide.type !== step.type)) continue;
    const next = walk(slides, pages, slideIndex + count, stepIndex + 1, pairs.concat(slice.map((slide) => ({ slide, step }))));
    if (next.ok) return next;
    if (!closest || next.violations.length < closest.violations.length) closest = next;
  }
  if (closest) return closest;

  const here = slides[slideIndex];
  if (!here) return { ok: false, violations: [`blueprint.yml: expected ${step.type} but the deck ended.`] };
  if (!here.type) return { ok: false, violations: [`${here.source}: slide has no page type. Expected ${step.type}.`] };
  const run = slides.slice(slideIndex).findIndex((slide) => slide.type !== step.type);
  const count = run === -1 ? slides.length - slideIndex : run;
  if (here.type === step.type && count < step.repeat.min) {
    return { ok: false, violations: [`${here.source}: expected at least ${step.repeat.min} ${step.type} slide(s), found ${count}.`] };
  }
  return { ok: false, violations: [`${here.source}: expected ${step.type}, found ${here.type}.`] };
}

export async function applyBlueprint(deck) {
  const blueprint = await loadBlueprint(deck.root, deck.templates ?? {});
  if (blueprint) {
    const violations = evaluateBlueprint(deck, blueprint);
    if (violations.length) throw new BlueprintError(violations);
  }
  for (const slide of deck.slides) {
    delete slide.markdown;
    delete slide.templateExplicit;
  }
  deck.blueprint = blueprint;
  return deck;
}
