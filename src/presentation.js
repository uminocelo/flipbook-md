import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

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

function splitSlides(markdown) {
  // A separator must occupy its own line. Frontmatter is removed before splitting.
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/^\s*---\s*$/m)
    .map((slide) => slide.trim())
    .filter(Boolean);
}

function renderMarkdown(markdown) {
  const raw = marked.parse(markdown);
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "data"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  });
}

function normalizedSlide(markdown, index) {
  const parsed = matter(markdown);
  const content = parsed.content.trim();
  return {
    index,
    title: String(parsed.data.title ?? findTitle(content) ?? `Slide ${index + 1}`),
    html: renderMarkdown(content)
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

  return {
    title: String(parsed.data.title ?? path.basename(absolutePath, ".slide.md")),
    theme: String(parsed.data.theme ?? "midnight"),
    sourcePath: absolutePath,
    slides: chunks.map((chunk, index) => normalizedSlide(chunk, index))
  };
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
    slides.push(normalizedSlide(markdown, index));
  }

  return {
    title: String(manifest.title ?? path.basename(root)),
    theme: String(manifest.theme ?? "midnight"),
    sourcePath: root,
    slides
  };
}

export async function discoverPresentation(inputPath = ".") {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute).catch(() => {
    throw new Error(`Path does not exist: ${absolute}`);
  });

  if (stat.isFile()) {
    if (path.basename(absolute).endsWith(".slide.md")) return loadSingleFile(absolute);
    if (path.basename(absolute) === "presentation.yml") {
      return loadDirectoryProject(path.dirname(absolute));
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
    return loadDirectoryProject(absolute);
  }

  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const candidate = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".slide.md"))
    .map((entry) => entry.name)
    .sort()[0];
  if (!candidate) {
    throw new Error(`No presentation found in ${absolute}. Add a *.slide.md file or presentation.yml.`);
  }
  return loadSingleFile(path.join(absolute, candidate));
}
