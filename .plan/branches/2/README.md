# Branch 2: Deck blueprint

**Purpose:** Let a deck declare the order of page types and the content allowed on each type. `flipbook check` reports violations. `show` and `export` refuse a deck that has a blueprint and fails it.
**Depends on:** [Branch 1](../1/)
**Parallel with:** None

A blueprint type's `template` is `flow`, `cover`, or `summary` in this branch. [Branch 4](../4/) extends that list with names from the deck's `templates.yml`.

## Milestones
- [Milestone 2.1 — Blueprint file and page types](milestones/1/)
- [Milestone 2.2 — Content rules and check](milestones/2/)
