---
name: pearl-color-theme
description: >
  How to add a new pearl color theme or theme group to the game. Each theme
  gives a player's board a custom 12-color palette (one color per row). Use
  this skill whenever a user requests a new theme or group — national flag,
  seasonal, aesthetic, etc.
compatibility: SvelteKit, Svelte 5, TailwindCSS v4
---

## Overview

Themes are organised into named groups. Both are defined in a single
source-of-truth file. The picker UI, board rendering, confetti, Redis
persistence, and localStorage are all wired up — adding a theme requires
touching exactly three files; adding a group requires one extra step on top.

### Data model (`src/lib/pearlThemes.ts`)

```
THEME_GROUPS: readonly ThemeGroup[]   ← source of truth; defines order
  └─ ThemeGroup { id, themes }
       └─ PearlTheme { id, name, colors[12] }

PEARL_THEMES = THEME_GROUPS.flatMap(g => g.themes)   ← flat list, derived
DEFAULT_THEME_ID = 'rainbow'
```

Existing groups and their IDs:

| Group ID  | Themes |
|-----------|--------|
| `colors`  | rainbow, pride, galaxy, neon, pastel |
| `nature`  | ocean, sunset, forest, sakura, arctic |
| `seasons` | autumn |
| `flags`   | france, italy, brazil, germany, usa |

---

## Adding a theme (3 files)

### File 1 — `src/lib/pearlThemes.ts`

Add a new entry inside the appropriate group's `themes` array in
`THEME_GROUPS`. Do **not** touch `PEARL_THEMES` — it is derived automatically.

```typescript
{
  id: 'my-theme',       // kebab-case, unique, stable (stored in Redis)
  name: 'My Theme',     // internal fallback; displayed label comes from i18n
  colors: [             // exactly 12 hex strings, one per board row 1–12
    '#rrggbb',
    // ...
  ],
},
```

### Color rules

**Exactly 12 colors** — the board has 12 rows; index 0 → row 1, index 11 → row 12.

**Valid 6-digit lowercase hex** — e.g. `#ff2c2c`, not `rgb(...)` or named colors.

**Sufficient contrast** — each color is rendered as a glossy sphere with a white
radial-gradient highlight. Very light colors (near white) become nearly invisible;
use a minimum brightness of ~`#c0c0c0` for any "white" band.

**Adjacent rows must be visually distinct.** For themes with only 2–3 base
colors (e.g. flag themes), distribute the 12 slots across color bands and use
saturation/brightness variants *within each band* so neighbouring rows do not
look identical. Typical approach: 4 rows per band, 4 variants per band.

```
// Germany flag example — 4 rows per band
// Black band: 4 brightness variants
'#141414', '#1a1a1a', '#2e2e2e', '#424242',
// Red band: 4 saturation/brightness variants
'#b30000', '#cc0000', '#d91a1a', '#e60000',
// Gold band: 4 saturation/brightness variants
'#ccaa00', '#e6b800', '#f5c830', '#ffd700',
```

For themes with 6 distinct hues (e.g. pride flag), 2 rows per hue works well.

**Confetti picks up the theme automatically** — `GameBoard` passes
`(colors ?? PEARL_COLORS)[i]` as the first confetti color for cleared rows,
so no extra work is needed.

### File 2 — `messages/en.json` and `messages/de.json`

Add a localization key for the theme name. The key convention is `theme_<id>`
where `<id>` matches the theme's `id` field (hyphens replaced with underscores).

`messages/en.json`:
```json
"theme_my_theme": "My Theme",
```

`messages/de.json`:
```json
"theme_my_theme": "Mein Thema",
```

### File 3 — `src/lib/components/PearlThemePicker.svelte`

Add an entry to the `THEME_LABELS` Record so the dropdown renders the
localized name instead of the raw ID:

```typescript
'my-theme': m.theme_my_theme,
```

Place the new entry in the same logical position as the theme appears in its
group. A missing entry silently returns the raw ID string, which breaks search
filtering and displays an unlocalized label.

---

## Adding a group (1 extra step on top of the above)

A group is a named section header in the picker dropdown. To add one:

### Step 1 — `src/lib/pearlThemes.ts`

Add a new `ThemeGroup` entry to `THEME_GROUPS` at the desired position. Put
the group's themes inside it (they can be new themes or moved from another
group):

```typescript
{
  id: 'my-group',
  themes: [
    { id: 'my-theme', name: 'My Theme', colors: [...] },
  ],
},
```

### Step 2 — `messages/en.json` and `messages/de.json`

Add a localization key for the group header. Convention: `theme_group_<id>`.

`messages/en.json`:
```json
"theme_group_my_group": "My Group",
```

`messages/de.json`:
```json
"theme_group_my_group": "Meine Gruppe",
```

### Step 3 — `src/lib/components/PearlThemePicker.svelte`

Add an entry to the `GROUP_LABELS` Record:

```typescript
'my-group': m.theme_group_my_group,
```

A missing entry silently renders the raw group ID as the section header.

---

## Nothing else to change

The following are already wired up and require no modification:

| Concern | Where it's handled |
|---|---|
| Picker UI + localStorage | `PearlThemePicker.svelte` reads `THEME_GROUPS` directly |
| Flat theme lookup | `PEARL_THEMES` derived from `THEME_GROUPS.flatMap(...)` |
| Form submission | Hidden `<input name="pearlTheme">` in `PearlThemePicker` |
| Redis persistence | `playerRepository.create(name, pearlTheme)` stores the `id` string |
| Board rendering | `GameBoard` `colors` prop, resolved by `getThemeColors(player.pearlTheme)` |
| Confetti on row clear | Uses `(colors ?? PEARL_COLORS)[i]` — inherits theme automatically |
| Spectator view | `viewedPlayer.pearlTheme` flows through `[inviteCode]/+page.server.ts` |
| All-boards view | `boards/+page.svelte` calls `getThemeColors(player.pearlTheme)` per card |

---

## Checklist — new theme

- [ ] New entry added inside the correct group in `THEME_GROUPS` (`src/lib/pearlThemes.ts`)
- [ ] `id` is kebab-case and unique across all existing themes
- [ ] Exactly 12 hex colors in the `colors` array
- [ ] Adjacent rows are visually distinct (use variants if few base colors)
- [ ] No color is lighter than ~`#c0c0c0` (pearl visibility on light backgrounds)
- [ ] `theme_<id>` key added to `messages/en.json`
- [ ] `theme_<id>` key added to `messages/de.json`
- [ ] `'<id>': m.theme_<id>` added to `THEME_LABELS` in `PearlThemePicker.svelte`
- [ ] `pnpm check` passes
- [ ] `pnpm lint` passes (run `pnpm format` first if needed)
- [ ] Unit test coverage is automatic via `every theme has exactly 12 colors` and `all color values are valid hex`

## Checklist — new group

- [ ] All of the above for any new themes inside the group
- [ ] New `ThemeGroup` entry added to `THEME_GROUPS` at the correct position
- [ ] `theme_group_<id>` key added to `messages/en.json`
- [ ] `theme_group_<id>` key added to `messages/de.json`
- [ ] `'<id>': m.theme_group_<id>` added to `GROUP_LABELS` in `PearlThemePicker.svelte`
