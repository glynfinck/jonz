# The Jonz style guide

How Jonz looks and behaves, on a phone and on a laptop. Every rule here is
one Glyn has decided (it names where) or one he approved with this guide
(marked **New**, 31 October 2026). When this guide and an older spec or PR
description disagree, this guide wins; fix the older one.

Read the page for the topic you're working on before you change a screen:

| Topic | What it covers |
| --- | --- |
| [feel.md](feel.md) | Bin Night: colour, signage, voice, icons, Day and Night, drafts |
| [words.md](words.md) | The six text roles, caps, cut-off labels, text size |
| [layout.md](layout.md) | Phone and laptop: sizes, tabs and rail, the title bar, side panels, sheets, menus, depth |
| [lists.md](lists.md) | Rows, groups, spacing, order, long lists, admin lists, calendars, empty lists |
| [controls.md](controls.md) | Buttons, button rows, icon buttons, tap sizes, toggles, focus |
| [states.md](states.md) | Status marks, waiting, loading, errors, undo and "Are you sure?", motion |
| [decisions.md](decisions.md) | The log: every design pick, newest first, with its PR |

The values themselves (colours, spacing, sizes, the text roles) live in
code, not here: `packages/core/src/bin-night.ts` for colours,
`apps/client/src/theme.ts` for everything else. The brand guide
(`docs/brand/README.md`) covers the logo, the sign and the voice outside the
app.

## Each rule says where it came from

A rule ends with its source in brackets: a PR (`#59`), a decision date, or
**New**. "Backed by" names the outside guide that agrees with it: Apple's
Human Interface Guidelines (HIG), Google's Material Design, the web's
accessibility standard WCAG 2.2, Nielsen Norman Group (NN/g) or the
GOV.UK Design System. "Differs" says where Jonz chose otherwise and why.

## Changing a rule

The guide stays true only if every design decision lands in it.

1. When Glyn picks an option (a decision card, "A looks great", "go with
   B"), the PR that builds it also edits the rule here **and** adds a line
   to [decisions.md](decisions.md): the date, the pick in a sentence, the PR.
2. A rule that a pick replaces is rewritten, not left beside the new one.
3. A new kind of screen with no rule yet: follow the nearest rule, and say
   in the PR which gap you filled, so Glyn can confirm it.
4. Never change a rule without a pick behind it. Ask instead.

## For agents

Load the `house-style` skill (`.claude/skills/house-style/SKILL.md`) for any
change to a screen, a component or a draft: it is the checklist that goes
with this guide.
