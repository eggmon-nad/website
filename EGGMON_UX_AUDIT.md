# EGGMON UX / performance audit

## Main issues found

1. Mobile layout had too much visual load: decorative flying eggs, glow layers, large click FX, and large buttons all competed on narrow screens.
2. Buttons were clean but not arranged as a proper responsive CTA grid on desktop.
3. Token Info modal worked, but it did not use the native `hidden` attribute, did not update `aria-expanded`, and could be smoother on iOS-style touch scrolling.
4. Audio was preloaded in the HTML head, which can waste mobile bandwidth before the user interacts.
5. Every mascot click sent an immediate API request, which is expensive during spam-clicking and weaker on mobile networks.
6. Counter / buttons needed stronger shared visual language and focus states.
7. Mobile performance could be improved by reducing animated particles and background animation cost.

## Changes applied

- Removed eager audio preload from the HTML head.
- Added `color-scheme` metadata.
- Improved Token Info modal semantics with `hidden`, `aria-expanded`, and `aria-describedby`.
- Added better modal close/open behavior and delayed `hidden` state restoration.
- Converted CTA buttons into a responsive grid for desktop and a clean one-column stack on mobile.
- Added stronger focus-visible states for keyboard/accessibility.
- Reduced mobile clutter by hiding background flying eggs on small screens.
- Tightened mobile spacing, mascot sizing, button sizing, lore card sizing, and disclaimer spacing.
- Improved iOS modal scrolling with `overscroll-behavior` and `-webkit-overflow-scrolling`.
- Reduced mobile liquid FX drops and capped stacked audio instances.
- Changed audio preload from `auto` to `metadata`.
- Batched click-counter POST requests to reduce network spam.
- Updated `/api/count` to support `delta` via `INCRBY` while preserving normal single-click `INCR` behavior.

## Files changed

- `index.html`
- `styles.css`
- `script.js`
- `api/count.js`
