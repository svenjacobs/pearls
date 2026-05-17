# AI Instructions — Pearls

## Project Overview

This is a web application implementation of the board game **Pearls**.
The app is built with **[SvelteKit](https://kit.svelte.dev/)**, **TypeScript**,
and **[TailwindCSS](https://tailwindcss.com/)**.

- **Package manager:** [pnpm](https://pnpm.io/) — always use `pnpm` to install or manage dependencies, never `npm` or `yarn`.
- **Runtime platform:** Node.js 26.
- **Dependency placement:** All packages go in `devDependencies` (`pnpm add -D`). SvelteKit/Vite bundles everything at build time, so `dependencies` is not needed unless a package explicitly cannot be bundled (e.g. native `.node` addons).
- **Commit and PR titles:** must follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/#specification) (e.g. `feat(game): add pearl theme picker`, `fix(score): correct score calculation`, `feat(ai): improve bot difficulty`, `chore(deps): update dependencies`, `refactor(sse): simplify reconnect logic`).

---

## The Game

### Components

- **One game board per player** — a wooden panel with 12 numbered slots (positions 1–12),
  each slot holding a row of pearls/beads that slide sideways.
- **7 pearls per slot** — each player starts with 84 pearls total (7 × 12).
- **6 dice** — standard six-sided dice.

### Objective

Be the **first player to remove all pearls** from your board by sliding them to the right
(i.e. off the board).

### Setup

1. Each player takes one game board.
2. All 12 slots are filled with their full complement of 7 pearls.
3. **Determine the starting player:** Either choose one randomly, or have every player
   roll a single die — the player with the highest result goes first (re-roll ties).

### Turn Structure

On your turn, you commit to a single target number and keep rolling until it can no
longer be formed:

1. **Roll all 6 dice** (using a dice cup if desired).
2. **If no number 1–12 can be formed** from the current dice for a slot that still
   has pearls, the turn ends immediately and the dice pass to the next player.
3. **Choose a target number (1–12) and select the dice that form it:**
   - **Numbers 1–6:** Select a single die showing that face value.
   - **Numbers 7–12:** Select a _pair_ of dice whose face values _sum_ to the target.
4. **Remove one pearl per selection used.** Each die (for numbers 1–6) or pair of dice
   (for numbers 7–12) that forms the target number removes one pearl from the
   corresponding slot. Multiple selections from the same roll each remove one pearl —
   e.g. four dice all showing 3 removes 4 pearls from slot 3 in one step. You cannot
   remove more pearls than remain in the slot.
5. **Set the used dice aside.** The chosen number is now locked for this turn — all
   subsequent rolls must target the **same number**.
6. **Bonus — cleared row:** If the last pearl of the target slot was just removed
   (the row is now empty), the player's turn resets: return all dice to the cup and
   go back to step 1 with all 6 dice, free to choose a new target number.
7. **Bonus — all dice used:** If every die has been set aside in step 5 but the target
   row still has pearls remaining, **return all 6 dice to the cup** and roll again
   for the same locked target number (go back to step 1, but the target stays locked).
8. **Re-roll the remaining dice** and repeat from step 5 using the same target number.
9. **Turn ends** when the remaining dice can no longer form the target number. The dice
   then pass to the next player (clockwise).

**Example:** A player rolls `[4, 6, 5, 5, 2, 3]` and picks **10** (4+6 and 5+5),
removing 2 pearls from slot 10 in one step. They set all four dice aside and re-roll
the remaining two: `[6, 1]`. These cannot sum to 10, so the turn ends and the next
player goes.

> **Key constraint:** The target number is fixed from the first selection of the turn.
> A die set aside in an earlier roll within the same turn is not available for
> subsequent rolls.

### End of Game

- **Winner:** The player who empties _all_ 12 slots first wins the round immediately.
- **Scoring for remaining players** (determines ranking):
  ```
  score = Σ slot_number × (7 − pearls_remaining_in_slot)   for slots 1..=12
  ```
  Maximum: 7 × (1 + 2 + … + 12) = 7 × 78 = 546.
  Higher score = more valuable rows cleared = better placement. The player with the highest score
  when the winner finishes comes second, and so on.

---

## Codebase

### Technology Stack

| Layer              | Technology                                                       |
| ------------------ | ---------------------------------------------------------------- |
| Language           | TypeScript                                                       |
| Frontend framework | [SvelteKit](https://kit.svelte.dev/) (Svelte 5, SSR)             |
| Styling            | [TailwindCSS](https://tailwindcss.com/) v4                       |
| Package manager    | pnpm                                                             |
| Build tool         | Vite                                                             |
| Code formatter     | [Prettier](https://prettier.io/) (with `prettier-plugin-svelte`) |
| Database           | [Redis](https://redis.io/)                                       |
| Utility library    | [es-toolkit](https://es-toolkit.slash.page/)                     |

### Coding Conventions

- Use TypeScript strict mode throughout. Implicit or explicit `any` types are treated as errors — always use precise types. Only add explicit type annotations when the TypeScript compiler cannot infer the type from context; let inference do the work everywhere else.
- Prefer **arrow functions** over the `function` keyword for all TypeScript declarations.
- Prefer **`async`/`await`** over `.then()`/`.catch()` chains for all Promise handling. Use an immediately-invoked async arrow (`void (async () => { ... })()`) when an async block is needed inside a non-async context (e.g. inside `$effect`).
- Follow SvelteKit file-based routing conventions (`+page.svelte`, `+layout.svelte`, `+server.ts`, etc.).
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) for reactivity — avoid the legacy Options API.
- Style exclusively with TailwindCSS utility classes; avoid inline styles or separate CSS files except for `app.css`. **Prefer Tailwind utility classes over custom CSS rules** — only reach for a `<style>` block or a custom class when a design requirement genuinely cannot be expressed with utilities (e.g. complex `clip-path`, `@keyframes` animations, or CSS that depends on a dynamic value not supported by Tailwind's arbitrary-value syntax).
- **Global keyframes in component style blocks:** Svelte scopes `@keyframes` names defined in `<style>` blocks by appending a hash, which breaks references from Tailwind arbitrary-value classes (e.g. `animate-[my-anim_...]`). To keep the keyframe co-located with its component while making it globally referenceable, prefix the name with `-global-`:
  ```css
  /* In the component <style> block — referenced as "pop" everywhere */
  @keyframes -global-pop { … }
  ```
  The `-global-` prefix is stripped from the output name, so `animate-[pop_...]` resolves correctly. See [Svelte global styles](<https://svelte.dev/docs/svelte/global-styles#:global()>).
- **Reducing HTML duplication — snippets vs components:** Choose the right tool based on where the duplication lives:
  - **Svelte 5 `{#snippet}`** — use when the same markup appears more than once _within a single file_. Snippets are declared inline with `{#snippet name(params)}…{/snippet}` and rendered with `{@render name(args)}`. They close over the component's reactive state, so no prop-threading is needed. Example: a board row whose inner content is identical across two outer-element variants (`<button>` vs `<div>`).
  - **Dedicated `.svelte` component** — use when the same markup appears in _more than one file_. Place shared UI in `src/lib/components/`. Only extract into a new file when it is genuinely reused across files; a single-file pattern stays as a snippet or inline HTML.
  - **Route-local `.svelte` component** — when a piece of UI is too large or too stateful to be a snippet but is only needed by one route, co-locate it next to the route file (e.g. `src/routes/[inviteCode]/ReactionOverlay.svelte`) rather than adding it to `src/lib/components/`. This keeps `src/lib/components/` limited to truly shared UI.

- **Light and dark theme:** All components and pages must look correct in both light and dark mode. The theme is driven by the browser's `prefers-color-scheme` preference — use Tailwind's `dark:` variant for every color that differs between modes (backgrounds, text, borders, placeholders, etc.). Never hardcode a color that only works on a dark or light background without providing the counterpart.
- Keep game logic in `src/lib/` as pure TypeScript functions (no side effects) with accompanying unit tests.
- Server-only code (DB access, secrets) must live under `src/lib/server/` to prevent accidental client exposure.
- All code must be formatted with **Prettier** before committing. Run `pnpm format` to format, `pnpm lint` to verify.
- After generating or modifying code that uses Tailwind classes, run `pnpx @tailwindcss/upgrade --force` to ensure all classes are valid and up to date.
- **Tailwind canonical classes:** prefer canonical utility syntax over bracket notation whenever a plain-number value has a canonical equivalent. For example, write `z-9999` not `z-9999`, `duration-300` not `duration-300`. Bracket notation is still correct for values with units that have no canonical form (e.g. `w-[14%]`, `rounded-[18%]`). When a `px` value has a canonical Tailwind equivalent, use it (e.g. `text-[10px]` → `text-xs`); otherwise convert to `rem` to respect user font-size preferences.
- **Numeric literals:** use underscores as thousands separators for any integer ≥ 1 000 (e.g. `1_000`, `4_000`, `1_047`, `86_400`). Applies to all TypeScript/JavaScript numeric literals; does not apply to numbers inside strings or HTML attributes.
- **Prefer [es-toolkit](https://es-toolkit.dev/) over custom utilities.** Before writing any helper function, check the [es-toolkit reference](https://es-toolkit.dev/reference/array/at.html) first. Key areas already in use:
  - **Promise:** `delay(ms)` — never write `new Promise(r => setTimeout(r, ms))` inline.
  - **Random:** `randomInt(min, max)` (max exclusive), `sample(arr)` (random element), `shuffle(arr)` — never use `Math.floor(Math.random() * ...)` or `.sort(() => Math.random() - 0.5)`.
  - **Array:** `chunk`, `groupBy`, `uniq`, `zip`, `difference`, `intersection`, etc.
  - **Math:** `clamp`, `sum`, `mean`, etc.
  - **Object:** `pick`, `omit`, `mapValues`, etc.
    Only write a custom utility when es-toolkit genuinely does not cover the need.

### Responsive Design

All components and HTML must be **fully responsive** — they must work well on small
smartphone screens (320 px and up) as well as large desktop screens and everything in between.

- **Mobile-first:** write base styles for the smallest screen, then layer larger-screen
  overrides with Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`).
- **Avoid non-scalable units:** do not use `px` values in Tailwind arbitrary values or custom
  CSS unless there is no suitable alternative (e.g. a 1 px hairline border). Prefer Tailwind's
  spacing/sizing scale (which maps to `rem`) or relative units (`%`, `rem`, `em`, `vw`, `vh`,
  `svh`) so that layouts scale with the user's font-size preference and viewport.
- **No fixed pixel widths** on layout containers — use relative units (`w-full`, `max-w-*`,
  `min-w-0`) so content reflows naturally.
- **Touch targets:** interactive elements (buttons, dice, pearls) must be at least 44 × 44 px
  on small screens; use `min-h-11 min-w-11` (or equivalent) as a baseline.
- **Typography:** prefer fluid text sizes using responsive variants (e.g. `text-sm md:text-base
lg:text-lg`) instead of a single fixed size.
- **Spacing & grids:** use Tailwind's responsive grid and flex utilities (`grid-cols-2
md:grid-cols-4`, `flex-wrap`, `gap-*`) rather than hard-coded pixel gaps.
- **Images & SVGs:** always include `max-w-full` / `h-auto` so they never overflow their
  container on narrow viewports.
- **Test mentally at these breakpoints:** 375 px (iPhone SE), 768 px (tablet), 1280 px
  (desktop), 1920 px (wide monitor).

### Building & Testing

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type-check
pnpm check

# Lint & format check
pnpm lint

# Format code
pnpm format

# Production build
pnpm build

# Unit tests
pnpm test

# Integration tests (repository layer — requires Podman or Docker)
pnpm test:integration
```

**Integration tests** use [Testcontainers](https://testcontainers.com/) to spin up a real Redis
instance in a container. Before running `pnpm test:integration`:

- **Podman** (default on this project): ensure the Podman machine is running —
  `podman machine start`. The script (`scripts/test-integration.sh`) auto-detects the
  socket: `podman machine inspect` on macOS, `$XDG_RUNTIME_DIR/podman/podman.sock` on Linux.
- **Docker**: set `DOCKER_HOST` manually before running the script, or Docker Desktop on
  macOS sets it automatically.

---

## Implementation Notes for AI Agents

- Local agent skills are available in `.agents/skills/`.
- Game logic should live in `src/lib/` as pure TypeScript functions, well-typed and unit-tested.
- The game board state per player is an array of 12 numbers (`number[12]`) where index `i` holds the pearl count for slot number `i + 1` (values 0–7). A zero means the slot is cleared.
- The maximum number of pearls removable in a single turn depends on the dice roll.
  The theoretical maximum with 6 dice is 6 removals (each die used independently for
  numbers 1–6) though pair combinations can cover higher-value slots.
- **Winning condition check:** `board.every(count => count === 0)`.
- **Score calculation:** `board.reduce((sum, count, i) => sum + (i + 1) * (7 - count), 0)` — each cleared pearl in slot N scores N points (max 546 = 7 × 78). Higher is better.

### Code Quality Workflow

After generating or modifying any code, run the full verification suite and fix all
reported problems before considering the task done:

```bash
pnpm check          # TypeScript type-checking
pnpm lint           # Prettier + ESLint (run `pnpm format` first to auto-fix formatting)
pnpm test           # Unit tests
pnpm test:integration  # Integration tests (requires Podman/Docker)
```

All four commands must exit cleanly (exit code 0). If any fail, read every reported
problem, fix it, and re-run until clean.

- Common lint issues to watch for:
  - `svelte/no-navigation-without-resolve` — do not call `goto()`, `pushState()`, or
    `replaceState()` in Svelte components. Use a `<form method="POST">` with a server
    action and `redirect()` instead.
  - Unresolved imports or missing type annotations caught by `typescript-eslint`.
  - Prettier formatting violations — run `pnpm format` to auto-fix, then re-run
    `pnpm lint` to confirm.

### Testing Requirements

Every code change must be accompanied by appropriate tests:

- **New pure functions or utilities** → add unit tests in a `*.test.ts` file co-located
  with the source file (e.g. `src/lib/foo.ts` → `src/lib/foo.test.ts`).
- **New or modified repository methods** → add or update integration tests in the
  corresponding `*.integration.test.ts` file under `src/lib/server/repository/`.
- **Bug fixes** → add a test that would have caught the bug.
- **Altered behaviour** → update existing tests to match the new behaviour; delete tests
  that no longer apply.

Do not leave new code paths untested. Passing `pnpm test` and `pnpm test:integration`
is the acceptance criterion — not just "the code compiles".

### Localization Workflow

After generating or adjusting any UI code, update the localization files accordingly:

- **New UI text** → add a new key to `messages/en.json` (English, source of truth) and
  `messages/de.json` (German translation).
- **Changed UI text** → update the corresponding key values in both files.
- **Removed UI text** → delete the key from both files.
- Key naming convention: `namespace_descriptor` (e.g. `game_waiting`, `action_leave`,
  `menu_copy_link`). Existing namespaces: `game_*`, `action_*`, `dice_*`, `form_*`,
  `error_*`, `a11y_*`, `menu_*`, `rules_*`, `nav_*`, `home_*`, `join_*`, `spectator_*`.
- When a placeholder value needs to be **formatted** (e.g. wrapped in a styled `<span>`),
  use the **sentinel pattern** — pass a unique marker string as the param, split the result,
  and render the styled element between the parts. This preserves correct word order for all
  languages. The pattern is widely documented; search _"i18n sentinel pattern"_ or
  _"i18n rich text interpolation"_ for background reading.

  ```svelte
  <!-- messages/en.json: "Playing as {name}" -->
  <!-- messages/de.json: "Du spielst als {name}" -->

  <!-- script -->
  const parts = $derived(m.game_playing_as({ name: '|||' }).split('|||') as [string, string])

  <!-- template -->
  {parts[0]}<span class="text-amber-600">{playerName}</span>{parts[1]}
  ```

  Never split a message into `_prefix` / `_suffix` keys — that hard-codes word order and
  breaks languages where the placeholder appears in a different position.

### Caveman

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:

- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
