import fs from "node:fs/promises";
import path from "node:path";
import { assetMime, presentationFileUrl, resolveThemeAsset } from "./theme.js";

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const ATTR = /\s(src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const FILE_URL = /\/presentation-file\/([^"'\\\s)]+)/g;
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

function splitUrlSuffix(value) {
  const index = value.search(/[?#]/);
  if (index === -1) return { pathname: value, suffix: "" };
  return { pathname: value.slice(0, index), suffix: value.slice(index) };
}

// Local slide attachments resolve from the slide file, then from the deck root.
export async function localAssetUrl(root, fromDir, raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.startsWith("#") || EXTERNAL.test(value)) return null;
  const { pathname } = splitUrlSuffix(value);
  if (!pathname || pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0")) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const bases = [];
  const add = (base) => {
    const resolved = path.resolve(base);
    if (!bases.includes(resolved)) bases.push(resolved);
  };
  if (decoded.startsWith(".")) add(fromDir);
  add(root);
  if (!decoded.startsWith(".")) add(fromDir);

  const lexical = [];
  for (const base of bases) {
    const url = presentationFileUrl(root, path.resolve(base, decoded));
    if (url) lexical.push({ absolute: path.resolve(base, decoded), url });
  }
  for (const candidate of lexical) {
    const stat = await fs.stat(candidate.absolute).catch(() => null);
    if (stat?.isFile()) return candidate.url;
  }
  return lexical[0]?.url ?? null;
}

export async function rewriteAttachmentHtml(html, root, fromDir) {
  const source = String(html ?? "");
  const matches = [...source.matchAll(ATTR)];
  if (matches.length === 0) return source;
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += source.slice(cursor, match.index);
    const value = match[3] ?? match[4] ?? "";
    const quote = match[3] !== undefined ? '"' : "'";
    const url = await localAssetUrl(root, fromDir, value);
    result += url ? ` ${match[1]}=${quote}${url}${quote}` : match[0];
    cursor = match.index + match[0].length;
  }
  return result + source.slice(cursor);
}

export async function inlinePresentationFiles(html, root) {
  const source = String(html ?? "");
  if (!source.includes("/presentation-file/") || !root) return source;
  let result = "";
  let cursor = 0;
  for (const match of source.matchAll(FILE_URL)) {
    result += source.slice(cursor, match.index);
    let relative = match[1];
    try {
      relative = decodeURIComponent(relative.split(/[?#]/)[0]);
    } catch {
      result += match[0];
      cursor = match.index + match[0].length;
      continue;
    }
    const file = await resolveThemeAsset(root, relative);
    const mime = file ? assetMime(file) : null;
    if (!file || !mime?.startsWith("image/")) {
      result += match[0];
    } else {
      const data = await fs.readFile(file);
      result += data.length > MAX_INLINE_BYTES
        ? match[0]
        : `data:${mime};base64,${data.toString("base64")}`;
    }
    cursor = match.index + match[0].length;
  }
  return result + source.slice(cursor);
}
