# Slide templates and deck blueprints

## Goal
Add optional CSS-grid slide templates and an optional blueprint that checks page types and content rules, while decks that use neither keep their current layout and commands.

## Branches
| Dir | Branch | Purpose | Parallel with |
| --- | --- | --- | --- |
| [branches/1](branches/1/) | Slide templates | Place one content region on a 3×3 grid in the player and in export | None |
| [branches/2](branches/2/) | Deck blueprint | Declare page types, order, and content rules, then reject a deck that breaks them | None — after Branch 1 |
| [branches/4](branches/4/) | Saved templates | Let a deck add 3×3 placements from `templates.yml`, with a library folder and `flipbook template add` | None — after Branch 2 |
| [branches/3](branches/3/) | Authoring | Document the contract, add a passing example, and point deck generation at it | None — after Branch 4 |

## Branch execution
- Branch 1 starts first. It owns the `template` field on each slide and the grid CSS.
- Branch 2 waits on Branch 1. A type rule names a template. In this branch the name is a built-in: `flow`, `cover`, or `summary`.
- Branch 4 waits on Branch 2. It teaches the loader to accept extra names from the deck's `templates.yml`. It edits the same lookup Branch 2 uses for `template`.
- Branch 3 waits on Branch 4. Docs and the example deck call `flipbook check`. explain-deck asks about saved templates only after `templates.yml` loads.
- No two branches are parallel-eligible.

## Execution order
1. [1.1.1.1](branches/1/milestones/1/1.1.md) — register `flow`, `cover`, and `summary`
2. [1.1.2.1](branches/1/milestones/1/1.2.md) — parse `template` onto each slide (after 1.1.1)
3. [1.2.1.1](branches/1/milestones/2/2.1.md) and [1.2.2.1](branches/1/milestones/2/2.2.md) — player and export, after the template field exists
4. Branch 2: blueprint file, page types, order, content measurement, `flipbook check`
5. Branch 4: `templates.yml`, generated grid CSS, `~/Documents/flipbook/templates/`, and `flipbook template add`
6. Branch 3: README, example deck, explain-deck contract

## Blocking tasks
- **1.1.1.1** blocks: [1.1.2.1](branches/1/milestones/1/1.2.md) (parser accepts only registered names)
- **1.1.2.2** blocks: [1.2.1.1](branches/1/milestones/2/2.1.md) and [1.2.2.1](branches/1/milestones/2/2.2.md) (renderers read `slide.template`)
- **2.1.1.1** and **2.1.2.1** block: [2.1.3.1](branches/2/milestones/1/1.3.md)
- **2.2.1.1** and **2.1.3.1** block: [2.2.2.1](branches/2/milestones/2/2.2.md)
- **2.2.2.2** blocks: [2.2.3.1](branches/2/milestones/2/2.3.md)
- Branch 4 blocks on [2.2.3](branches/2/milestones/2/2.3.md) (blueprint `template` stays a built-in name until the deck file extends it)
- Branch 3 blocks on [4.2.1](branches/4/milestones/2/2.1.md) (explain-deck lists the library only after the command and the deck file exist)

## Parallelizable work
- After Milestone 1.1, [Issue 1.2.1](branches/1/milestones/2/2.1.md) (player) and [Issue 1.2.2](branches/1/milestones/2/2.2.md) (export) can run at the same time.
- After the blueprint loader and the type reader exist, [Issue 2.1.3](branches/2/milestones/1/1.3.md) (order) and [Issue 2.2.1](branches/2/milestones/2/2.1.md) (measurement) can run at the same time.
- Branches themselves stay in order: 1, then 2, then 4, then 3.

## Constraints
- Built-in templates are `flow` (default), `cover`, and `summary`. Each of `cover` and `summary` is a 3×3 CSS grid with a single `.slide-body`. Empty cells stay empty. There are no multi-region slots in this plan. Branch 4 adds more names on that same grid.
- `cover` places `.slide-body` in row 2, column 2, centered. `summary` places `.slide-body` across rows 2–3 and columns 2–3 (the lower-right four cells). `flow` keeps today's block layout.
- A slide sets the template with `<!-- template: cover -->`. That comment works in a directory slide and in a single-file deck, where a line that is only `---` already splits slides. A directory slide may also set `template` in YAML frontmatter. When both are set, frontmatter wins. The comment is not rendered.
- An unknown template name fails the load and names the slide. A missing template is `flow`. Existing decks do not gain a grid.
- Branch 2 accepts only `flow`, `cover`, and `summary` as a blueprint type's `template`. Branch 4 also accepts names defined in the deck's `templates.yml`.
- The grid fills the slide content surface: the player article, and `.content` in export. Player controls stay in `public/styles.css`. Export header and footer stay outside the grid.
- Grid CSS lives in `public/slide.css` and in the export document. `presentation.css` may restyle a known `[data-template]` because it loads after the base sheet. It cannot invent a new template name.
- A blueprint is an optional `blueprint.yml` beside `presentation.yml`, or beside a single-file deck when that directory is the deck root. No file means no checks.
- Flipbook does not write slide prose and does not call a model. `flipbook check` validates. `show` and `export` refuse a deck whose blueprint fails.
- The page type of a directory slide is the `_<type>` suffix before `.slide.md`: `slides/01_cover.slide.md` and `nameofdeck_cover.slide.md` are both type `cover`. `slides/01-intro.slide.md` and `slides/01-intro.md` have no type. A single-file deck sets `<!-- type: cover -->` on each slide, because one filename cannot type every slide.
- Content rules read Markdown structure, not HTML. Visible text drops Markdown markers. `max_chars` counts Unicode code points of that text. Kinds are `heading`, `paragraph`, `list`, `code`, `image`, `blockquote`, and `table`.
- A type owns the default content rules and the required template. A `pages` entry may override `max_chars`, `allow`, and `forbid` for that step. The shipped conclusion example allows only `heading` and `paragraph`, with `max_chars: 250`.
- When a slide omits `template` and its blueprint type names one, the load uses the type's template. A slide template that disagrees with the type fails the check.
- Saved templates live in `~/Documents/flipbook/templates/<name>.yml`. `flipbook show` does not read that folder. The skill and `flipbook template add` copy the chosen entries into `<deck>/templates.yml`, which is the file the player and the export read.
- A saved template is one content region on the same 3×3 grid: `column`, `row`, `width`, `height`, and `align` (`start`, `center`, or `end`). `column` and `row` start at 1. `column + width` and `row + height` stay inside the grid (at most 4). The filename is the template name. `flow`, `cover`, and `summary` cannot be replaced by a saved file.
- explain-deck asks before writing, in the same moment as the theme question. The choices are the built-in defaults, one or more files from `~/Documents/flipbook/templates/`, or a new placement saved into that folder and copied into the deck. Built-in `flow`, `cover`, and `summary` stay available either way. Skip the saved list when the directory is missing. Do not ask again when the user already names a template.
- `flipbook init` is out of this plan. Adding a placement is `flipbook template add`.
- Do not rename slides in `examples/database-indexes-project`. Add a new example.
- Tests run with `npm test` (`node --test`).
