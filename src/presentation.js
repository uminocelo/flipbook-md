import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { loadNamedTheme, loadThemeCss } from "./theme.js";
import { rewriteAttachmentHtml } from "./attachments.js";
import { loadDeckTemplates, resolveSlideTemplate } from "./templates.js";
import { applyBlueprint, pageTypeFromFilename, readPageType } from "./blueprint.js";
import { mergeChrome, parseChrome } from "./chrome.js";
import { loadGroup } from "./groups.js";
import { loadConfiguration, playbackFromConfiguration } from "./configuration.js";

marked.setOptions({
  gfm: true,
  breaks: false
});

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "img", "h1", "h2", "h3", "h4", "pre", "code", "hr", "input", "del"
];
const ALLOWED_ATTRIBUTES = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  code: ["class"],
  input: ["type", "checked", "disabled"]
};

const NOTES_COMMENT = /<!--\s*notes:\s*([\s\S]*?)-->/gi;

function noteString(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error("Slide notes must be a string.");
}

export function extractNotes(markdown, frontmatterNotes) {
  const chunks = [];
  const fromFrontmatter = noteString(frontmatterNotes);
  if (fromFrontmatter) chunks.push(fromFrontmatter);
  NOTES_COMMENT.lastIndex = 0;
  const body = String(markdown ?? "").replace(NOTES_COMMENT, (_, notes) => {
    const text = String(notes).trim();
    if (text) chunks.push(text);
    return "";
  });
  return { body, notes: chunks.join("\n\n") };
}

// Markdown reads a `---` line right under text as a heading underline. In a note it
// is meant as a divider, so it gets the blank line that makes it a rule.
function notesMarkdown(notes) {
  return String(notes).replace(/([^\n])\n([ \t]*-{3,}[ \t]*)(?=\n|$)/g, "$1\n\n$2");
}

function splitSlides(markdown) {
  // A separator must occupy its own line. Frontmatter is removed before splitting.
  // Notes comments are masked first so a `---` line inside speaker notes stays in the note.
  const held = [];
  NOTES_COMMENT.lastIndex = 0;
  const masked = String(markdown).replace(NOTES_COMMENT, (match) => {
    held.push(match);
    return `\u0000NOTES${held.length - 1}\u0000`;
  });
  return masked
    .replace(/\r\n/g, "\n")
    .split(/^\s*---\s*$/m)
    .map((slide) => slide.replace(/\u0000NOTES(\d+)\u0000/g, (_, index) => held[Number(index)]).trim())
    .filter(Boolean);
}

const CALLOUT_LABELS = [
  ["tip", ["Tip", "Dica"]],
  ["reminder", ["Reminder", "Lembrete"]],
  ["learn-more", ["Learn more", "Saiba mais"]],
  ["next", ["Next", "A seguir", "Próximo"]],
  ["cta", ["CTA"]],
  ["remember", ["Remember", "Lembre-se"]]
];
const CALLOUT_KEY = new Map(
  CALLOUT_LABELS.flatMap(([key, labels]) => labels.map((label) => [label.toLowerCase(), key]))
);
const CALLOUT_RE = new RegExp(
  `<blockquote>\\s*<p>\\s*<strong>(${CALLOUT_LABELS
    .flatMap(([, labels]) => labels)
    .sort((a, b) => b.length - a.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")}):?<\\/strong>:?\\s*`,
  "gi"
);

function renderMarkdown(markdown) {
  const raw = marked.parse(markdown);
  const clean = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "data"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  });
  return markCallouts(clean);
}

function markCallouts(html) {
  return String(html).replace(CALLOUT_RE, (match, label) => {
    const key = CALLOUT_KEY.get(String(label).toLowerCase());
    if (!key) return match;
    return `<blockquote class="callout" data-callout="${key}"><p><span class="callout-label">${label}</span> `;
  });
}

async function normalizedSlide(markdown, index, root, fromDir, source, templates) {
  const parsed = matter(markdown);
  const typed = readPageType(parsed.content, index + 1);
  const resolved = resolveSlideTemplate(parsed.data.template, typed.body, index + 1, templates);
  let extracted;
  try {
    extracted = extractNotes(resolved.body, parsed.data.notes);
  } catch (error) {
    throw new Error(`Slide ${index + 1} (${source}): ${error.message}`);
  }
  const content = extracted.body.trim();
  return {
    index,
    source,
    title: String(parsed.data.title ?? findTitle(content) ?? `Slide ${index + 1}`),
    template: resolved.template,
    templateExplicit: resolved.explicit,
    type: pageTypeFromFilename(source) ?? typed.type,
    markdown: content,
    notes: extracted.notes,
    notesHtml: extracted.notes ? await rewriteAttachmentHtml(renderMarkdown(notesMarkdown(extracted.notes)), root, fromDir) : "",
    html: await rewriteAttachmentHtml(renderMarkdown(content), root, fromDir)
  };
}

function findTitle(markdown) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

export async function loadSingleFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const parsed = matter(source);
  const chunks = splitSlides(parsed.content);
  if (chunks.length === 0) {
    throw new Error(`No slides found in ${absolutePath}. Add Markdown content after the frontmatter.`);
  }

  const root = await fs.realpath(path.dirname(absolutePath));
  const templates = await loadDeckTemplates(root);
  const deck = {
    title: String(parsed.data.title ?? path.basename(absolutePath, ".slide.md")),
    theme: String(parsed.data.theme ?? "midnight"),
    themeCss: await loadThemeCss(root),
    root,
    sourcePath: absolutePath,
    templates,
    slides: []
  };
  await applyDeckGroup(deck, parsed.data);
  deck.slides = await Promise.all(chunks.map((chunk, index) => normalizedSlide(chunk, index, root, root, `slide ${index + 1}`, deck.templates)));
  return applyBlueprint(deck);
}

export async function loadDirectoryProject(projectPath) {
  const root = await fs.realpath(path.resolve(projectPath));
  const manifestPath = path.join(root, "presentation.yml");
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const manifest = parseYaml(manifestSource);

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${manifestPath} must contain a YAML object.`);
  }
  if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) {
    throw new Error(`${manifestPath} must define a non-empty "slides" list.`);
  }

  const deck = {
    title: String(manifest.title ?? path.basename(root)),
    theme: String(manifest.theme ?? "midnight"),
    themeCss: await loadThemeCss(root),
    root,
    sourcePath: root,
    templates: await loadDeckTemplates(root),
    slides: []
  };
  await applyDeckGroup(deck, manifest);
  const slides = [];
  for (const [index, item] of manifest.slides.entries()) {
    const relative = typeof item === "string" ? item : item?.file;
    if (!relative || typeof relative !== "string") {
      throw new Error(`Slide ${index + 1} in presentation.yml must be a path string.`);
    }
    const absolute = path.resolve(root, relative);
    const relFromRoot = path.relative(root, absolute);
    if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
      throw new Error(`Slide path escapes the presentation directory: ${relative}`);
    }
    const real = await fs.realpath(absolute).catch(() => {
      throw new Error(`Slide file does not exist: ${relative}`);
    });
    const realRel = path.relative(root, real);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
      throw new Error(`Slide path resolves outside the presentation directory: ${relative}`);
    }
    const markdown = await fs.readFile(real, "utf8");
    const sourceLabel = relative.split(path.sep).join("/");
    slides.push(await normalizedSlide(markdown, index, root, path.dirname(real), sourceLabel, deck.templates));
  }

  deck.slides = slides;
  return applyBlueprint(deck);
}

async function applyDeckGroup(deck, meta) {
  const groupName = meta?.group == null ? "" : String(meta.group).trim();
  const group = groupName ? await loadGroup(groupName) : null;
  if (group) {
    deck.templates = { ...group.templates, ...deck.templates };
    deck.groupBlueprint = group.blueprint;
    deck.group = group.name;
  }
  const style = String(meta?.style ?? group?.style ?? "").trim();
  if (style) deck.style = style;
  if (!deck.themeCss && style) deck.themeCss = await loadNamedTheme(style);
  if ((meta?.theme == null || String(meta.theme).trim() === "") && group?.canvas) deck.theme = group.canvas;
  const chrome = parseChrome(mergeChrome(group?.chromeSource ?? null, meta?.chrome ?? null));
  if (chrome) deck.chrome = chrome;
}

export async function discoverPresentation(inputPath = ".") {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute).catch(() => {
    throw new Error(`Path does not exist: ${absolute}`);
  });

  if (stat.isFile()) {
    if (path.basename(absolute).endsWith(".slide.md")) return finishDeck(await loadSingleFile(absolute));
    if (path.basename(absolute) === "presentation.yml") {
      return finishDeck(await loadDirectoryProject(path.dirname(absolute)));
    }
    throw new Error(`Unsupported file: ${absolute}. Use a .slide.md file or a directory project.`);
  }

  if (!stat.isDirectory()) throw new Error(`Not a file or directory: ${absolute}`);

  const manifest = path.join(absolute, "presentation.yml");
  try {
    await fs.access(manifest);
  } catch {
    // No manifest: try the single-file convention below.
  }
  if (await fs.stat(manifest).then(() => true).catch(() => false)) {
    return finishDeck(await loadDirectoryProject(absolute));
  }

  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const candidate = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".slide.md"))
    .map((entry) => entry.name)
    .sort()[0];
  if (!candidate) {
    throw new Error(`No presentation found in ${absolute}. Add a *.slide.md file or presentation.yml.`);
  }
  return finishDeck(await loadSingleFile(path.join(absolute, candidate)));
}

async function finishDeck(deck) {
  deck.playback = playbackFromConfiguration(await loadConfiguration(deck.root));
  return deck;
}
