import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const FORMATS = new Set(["carousel", "video"]);
const TRANSITIONS = new Set(["none", "fade", "slide"]);
const DEFAULT_TRANSITION_SECONDS = 0.4;

// `where` names the setting in the error, such as "--transition" or "presentation.transition".
export function parseTransition(type, duration, where) {
  const name = String(type == null || type === "" ? "none" : type).trim().toLowerCase();
  if (!TRANSITIONS.has(name)) throw new Error(`${where} must be none, fade, or slide.`);
  const seconds = duration == null || duration === "" ? DEFAULT_TRANSITION_SECONDS : Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 5) {
    throw new Error(`${where} duration must be a number of seconds greater than 0 and at most 5.`);
  }
  return { type: name, duration: seconds };
}

function defined(...values) {
  return values.find((value) => value != null && value !== "");
}

export async function loadConfiguration(root) {
  const file = path.join(root, "configuration.yml");
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { export: {}, presentation: {} };
    throw error;
  }
  const realRoot = await fs.realpath(root);
  const realFile = await fs.realpath(file);
  const relative = path.relative(realRoot, realFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("configuration.yml resolves outside the presentation directory.");
  }
  let parsed;
  try {
    parsed = parseYaml(raw);
  } catch {
    throw new Error("configuration.yml is not valid YAML.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("configuration.yml must contain a YAML object.");
  }
  const exp = parsed.export && typeof parsed.export === "object" && !Array.isArray(parsed.export) ? parsed.export : {};
  const presentation = parsed.presentation && typeof parsed.presentation === "object" && !Array.isArray(parsed.presentation) ? parsed.presentation : {};
  return {
    export: {
      format: defined(exp.format, parsed.format),
      duration: defined(exp.duration, parsed.duration),
      preset: defined(exp.preset, parsed.preset),
      fps: defined(exp.fps, parsed.fps),
      output: defined(exp.output, parsed.output),
      transition: defined(exp.transition, parsed.transition),
      transitionDuration: defined(exp.transition_duration, parsed.transition_duration)
    },
    presentation: {
      interval: presentation.interval,
      transition: defined(presentation.transition, parsed.transition),
      transitionDuration: defined(presentation.transition_duration, parsed.transition_duration)
    }
  };
}

export function playbackFromConfiguration(config) {
  const raw = config?.presentation?.interval;
  const transition = parseTransition(
    config?.presentation?.transition,
    config?.presentation?.transitionDuration,
    "configuration.yml presentation.transition"
  );
  if (raw == null || raw === "") return { interval: 5, transition };
  const interval = Number(raw);
  if (!Number.isFinite(interval) || interval <= 0 || interval > 600) {
    throw new Error("configuration.yml presentation.interval must be a number of seconds greater than 0 and at most 600.");
  }
  return { interval, transition };
}

export function resolveExportOptions(config, cli = {}) {
  const format = String(defined(cli.format, config?.export?.format, "carousel"));
  if (!FORMATS.has(format)) {
    throw new Error(`Unsupported export format: ${format}. Use carousel or video.`);
  }
  const preset = String(defined(cli.preset, config?.export?.preset, "instagram"));
  const outputDir = String(defined(cli.outputDir, config?.export?.output, `dist/${format}`));
  const durationRaw = defined(cli.duration, config?.export?.duration);
  const fpsRaw = defined(cli.fps, config?.export?.fps, 30);
  const duration = durationRaw == null ? null : Number(durationRaw);
  const fps = Number(fpsRaw);
  if (format === "video") {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) {
      throw new Error("Video export needs a duration in seconds, greater than 0 and at most 1800. Pass --duration or set export.duration in configuration.yml.");
    }
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
      throw new Error("Video fps must be an integer from 1 to 60.");
    }
  }
  const transition = parseTransition(
    defined(cli.transition, config?.export?.transition),
    defined(cli.transitionDuration, config?.export?.transitionDuration),
    "Video transition"
  );
  return { format, preset, outputDir, duration, fps, transition: transition.type, transitionDuration: transition.duration };
}
