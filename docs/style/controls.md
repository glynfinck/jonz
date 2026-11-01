# Buttons and controls

## Sizes

- **Every control is at least `TAP` (48) tall,** links included (`TextLink`,
  or `Button` with `href`). (AGENTS.md) *Backed by* Material's 48dp, above
  the HIG's 44pt and WCAG 2.2's 24px minimum.
- Icons in buttons are 20; icon-only buttons are a 48 square. (**New**)

## Kinds of button

- `Button` `primary` (amber): the one thing to do on a screen, **at most one
  per screen**. `outline`: the secondary. `ghost`: no edge. `hazard`: a
  choice that strikes something out, edged in hazard, words in ink.
  (Focus, #17)
- `TextButton`: a quiet action or a link onward (Undo, See all, Change
  dates ›). (Focus, #17)
- One of a pair you pick from (the vote) uses `chosen`: ink edge on the
  tint, never amber. (Focus, #17)
- A wide action on its own is full width (Copy key, Send report). (Copy key
  A, #75)
- Screens never restyle a button: no `style` on `Button`, and no hand-made
  `Pressable` dressed as one outside `components/`. (**New**, enforced by
  lint)

## Buttons together

- **Buttons side by side are equal widths,** never sized to their words.
  When they don't both fit on one line (below `NARROW`, or when a label
  would wrap), they stack at full width, the main action first. Use the
  shared button row; never lay one out by hand. (**New**, from the bug
  report drafts, 31 Oct) *Backed by* the HIG's two-button alerts, which sit
  side by side at equal widths and stack when a label is too long, and
  GOV.UK's button groups.
- A primary and its secondary are the same height and width, whether side
  by side or stacked. (**New**)

## Icon buttons

- Close, `•••`, the sparkles and any other icon-only control are one size
  (a 48 square, 20 icon) with one look: no edge, or the outline button's
  edge. Never a heavier ink border. Each has a spoken name. (**New**)
  *Backed by* Nielsen's "consistency and standards" and WCAG 4.1.2.
- **A toggle shows its state in its icon,** with no grey square behind it
  while it's on. (Sparkles A, #48)

## Inputs

- A chat's message box grows as you type to about 5 lines, then scrolls;
  the send arrow sits inside the box. (Ask Jonz, #37)
- Forms sit in a column capped at `FORM_MAX` (520) on a laptop. (**New**)
- A short select opens in place (`PickRow`); a radio or checkbox is a
  `ChoiceRow`. (AGENTS.md)
- **Sign-in and password boxes work with password managers.** On the web
  each step is a real form (`SignInForm`), Enter sends it, the email box is
  `username` and a new password is `new-password` (with `passwordRules` on
  iOS); where the step has no email box, `HiddenUsername` names the account.
  No spellcheck or autocorrect on either. (Glyn, 1 Nov) *Backed by*
  Chrome's and Apple's password autofill guides.

## One move, one place

Every John action (tick, photo, undo, immunity, swap, dispute, vote) lives in
the John sheet, opened by tapping that John anywhere. (Focus, #17)

## State and focus

- A chosen, ticked or pressed state is an `aria-*` prop (`aria-checked`,
  `aria-selected`, `aria-disabled`; `aria-pressed` and `aria-expanded` on the
  web), never `accessibilityState`, which react-native-web ignores.
  (AGENTS.md)
- **A focus ring shows for the keyboard, never after a tap,** and never on a
  sheet's close button just because the sheet opened. (**New**) *Backed by*
  WCAG 2.4.7 and the browser's focus-visible behaviour.
