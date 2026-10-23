# Flipbook MD

**Markdown in. Slides out.** Flipbook MD is a small local-first CLI that serves a Markdown presentation in your browser.

The core workflow is:

```sh
flipbook show .
```

Flipbook finds a supported presentation in the current directory, starts a local HTTP server on an available port, and prints the URL. It tries to open the URL in your default browser; if that isn't possible, open the printed URL yourself.

## Requirements

- Node.js 20 or newer
- npm

## Install and run locally

From this repository:

```sh
npm install
npm link
cd examples/database-indexes-project
flipbook show .
```

Or without linking the command globally:

```sh
npm install
npm run start
```

To use the CLI without `npm link`:

```sh
node /path/to/flipbook-md/bin/flipbook.js show .
```

## Supported source formats

### 1. Single-file presentation

Create `intro.slide.md`:

```markdown
---
title: "My presentation"
theme: "midnight"
---

# Hello, world!

Markdown becomes a slide.

---

# Second slide

- Write familiar Markdown
- Separate slides with a line containing `---`
```

Then run:

```sh
flipbook show intro.slide.md
```

The YAML frontmatter is optional. The first slide separator is the line `---` after the frontmatter.

### 2. Directory-based presentation

A directory project has a `presentation.yml` manifest and one Markdown file per slide:

```text
my-talk/
├── presentation.yml
└── slides/
    ├── 01-intro.md
    └── 02-next.md
```

`presentation.yml`:

```yaml
title: "My presentation"
theme: "midnight"
slides:
  - slides/01-intro.md
  - slides/02-next.md
```

Run:

```sh
flipbook show ./my-talk
```

Slide paths must stay inside the presentation directory. Flipbook rejects manifest paths that escape the project directory.

## What `flipbook show <path>` does

- A `.slide.md` path loads that single-file presentation.
- A directory containing `presentation.yml` loads the listed slide files.
- A directory without a manifest searches for the first `*.slide.md` file in that directory.
- If the path is omitted, `.` is used.
- The server binds to `127.0.0.1` and asks the operating system for an available port (port `0`), rather than assuming a port is free.
- Press **← / →** or **Space** to navigate, **Home / End** to jump, and **F** to toggle fullscreen.
- Press **Esc** to leave fullscreen (browser behavior).

## Current scope

This is an initial MVP: local presentation discovery, Markdown rendering, a responsive slide player, and basic tests. It does not yet include live reload, a visual editor, PPTX export, collaboration, or automatic parsing of every possible Markdown extension. The `theme` field is metadata for future themes; the first version uses the built-in midnight theme.

## Development

```sh
npm test
npm run start
```

Project structure:

```text
bin/       CLI entry point
src/       discovery, parsing, HTTP server, browser launch
public/    browser player
examples/  sample presentations
test/      automated tests
```

## Security notes

Flipbook is designed for local authoring. The server listens on loopback only. Rendered Markdown is sanitized before being sent to the browser, and directory manifest slide paths are checked to prevent traversal outside the project. Do not expose this development server to an untrusted network.

## License

MIT


## Export slides as social carousel images

Flipbook MD can export each slide as a separate, ready-to-upload PNG image.

### Install the browser used for image rendering

After installing project dependencies, install Playwright's Chromium browser once:

```bash
npm install
npx playwright install chromium
```

### Export

```bash
# Instagram-friendly portrait images (1080 × 1350, 4:5)
flipbook export examples/system-design.slide.md --format carousel --preset instagram

# Square images for X multi-image posts (1080 × 1080, 1:1)
flipbook export examples/system-design.slide.md --format carousel --preset x

# Choose the output folder
flipbook export . --format carousel --preset instagram --output dist/instagram
```

`flipbook export` accepts the same inputs as `flipbook show`: a `.slide.md` file, a directory containing a `.slide.md` file, a directory project with `presentation.yml`, or a path to `presentation.yml`.

Each slide is rendered as a numbered PNG, using the presentation theme and slide content. A `README.txt` is also written to the output folder. Upload the images in numeric order. Platform publishing features and limits can change, so check the current rules before posting.

### Export presets

| Preset | Dimensions | Shape | Intended use |
| --- | ---: | --- | --- |
| `instagram` | 1080 × 1350 | 4:5 portrait | Instagram carousel |
| `x` | 1080 × 1080 | 1:1 square | X multi-image post |

The browser-based presenter remains available via `flipbook show .`. Image export is a separate command and does not alter the source Markdown.
