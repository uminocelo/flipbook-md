import fs from "node:fs/promises";
import path from "node:path";

const MAX_THEME_CSS_BYTES = 512 * 1024;

const ASSET_MIME = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const THEME_URL_SOURCE = String.raw`url\(\s*([^)]+?)\s*\)`;

function themeUrlPattern() {
  return new RegExp(THEME_URL_SOURCE, "gi");
}

export function assetMime(filePath) {
  return ASSET_MIME[path.extname(filePath).toLowerCase()] ?? null;
}

// A deck file that stays inside root and has an attachment type, as a player URL.
export function presentationFileUrl(root, absolutePath) {
  const rel = path.relative(root, absolutePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!assetMime(rel)) return null;
  const encoded = rel.split(path.sep).map((part) => encodeURIComponent(part)).join("/");
  return `/presentation-file/${encoded}`;
}

// The slide shadow host is the theme root. :root in an author file targets that host.
export function scopeThemeCss(css) {
  return String(css).replace(/:root\b/g, ":host");
}

function unquoteUrl(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote && trimmed.length >= 2) {
    return { quote, value: trimmed.slice(1, -1).trim() };
  }
  return { quote: "", value: trimmed };
}

function isExternalUrl(value) {
  return /^(?:data:|https?:|blob:|\/\/)/i.test(value);
}

// Returns the deck-relative asset path, or null when the url is not a local theme file.
export function themeAssetPath(value) {
  const { pathname, suffix } = splitUrlSuffix(String(value).trim());
  if (!pathname || pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0")) return null;
  const parts = [];
  for (const part of pathname.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  if (parts.length === 0 || !ASSET_MIME[path.extname(parts.at(-1)).toLowerCase()]) return null;
  return { relative: parts.join("/"), suffix };
}

function splitUrlSuffix(value) {
  const index = value.search(/[?#]/);
  if (index === -1) return { pathname: value, suffix: "" };
  return { pathname: value.slice(0, index), suffix: value.slice(index) };
}

export function rewriteThemeUrls(css) {
  return String(css).replace(themeUrlPattern(), (full, inner) => {
    const { quote, value } = unquoteUrl(inner);
    if (!value || isExternalUrl(value) || value.startsWith("#")) return full;
    const asset = themeAssetPath(value);
    if (!asset) return full;
    const encoded = asset.relative.split("/").map(encodeURIComponent).join("/");
    return `url(${quote}/presentation-file/${encoded}${asset.suffix}${quote})`;
  });
}

export async function resolveThemeAsset(root, relative) {
  const asset = themeAssetPath(relative);
  if (!asset || !root) return null;
  const absolute = path.resolve(root, asset.relative);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  let realRoot;
  let realFile;
  try {
    realRoot = await fs.realpath(root);
    realFile = await fs.realpath(absolute);
  } catch {
    return null;
  }
  const realRel = path.relative(realRoot, realFile);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) return null;
  if (!assetMime(realFile)) return null;
  return realFile;
}

export async function inlineThemeAssets(css, root) {
  const source = String(css ?? "");
  if (!source || !root) return source;
  let result = "";
  let cursor = 0;
  for (const match of source.matchAll(themeUrlPattern())) {
    result += source.slice(cursor, match.index);
    const { value } = unquoteUrl(match[1]);
    const asset = !value || isExternalUrl(value) ? null : themeAssetPath(value);
    const file = asset ? await resolveThemeAsset(root, asset.relative) : null;
    if (!file) {
      result += match[0];
    } else {
      const mime = assetMime(file);
      const data = await fs.readFile(file);
      result += `url("data:${mime};base64,${data.toString("base64")}")`;
    }
    cursor = match.index + match[0].length;
  }
  return result + source.slice(cursor);
}

export function cssForStyleTag(css) {
  // Keep "</style>" from closing an HTML style tag. "\3C " is "<" in CSS.
  return String(css).replace(/</g, "\\3C ");
}

export async function loadThemeCss(directory) {
  const cssPath = path.join(directory, "presentation.css");
  let stat;
  try {
    stat = await fs.stat(cssPath);
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
  if (!stat.isFile()) throw new Error(`${cssPath} must be a file.`);

  const realDir = await fs.realpath(directory);
  const realFile = await fs.realpath(cssPath);
  const rel = path.relative(realDir, realFile);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("presentation.css resolves outside the presentation directory.");
  }

  const css = scopeThemeCss(await fs.readFile(realFile, "utf8")).replace(/^\uFEFF/, "");
  if (Buffer.byteLength(css) > MAX_THEME_CSS_BYTES) {
    throw new Error("presentation.css is larger than 512 KB.");
  }
  return css.trim() ? css : "";
}
