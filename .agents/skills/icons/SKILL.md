---
name: icons
description: Add icons to the UI using Iconify with the heroicons set. Use when the user asks to add, change, or remove an icon, or when an icon would improve a UI element.
compatibility: Requires internet access to browse https://icon-sets.iconify.design/heroicons/
allowed-tools: WebFetch
---

## Setup

This project uses Iconify with Tailwind CSS v4. The prefix is `iconify` and clean selectors for the `heroicons` set are already configured. No additional setup is needed.

## Finding an icon

1. Browse the heroicons set at https://icon-sets.iconify.design/heroicons/
2. Search or scroll to find a suitable icon. Prefer solid variants for interactive elements, outline variants for decorative or secondary elements.
3. Click the icon and open the **Tailwind CSS** tab.
4. The displayed class name looks like `icon-[heroicons--adjustments-horizontal-solid]`. The icon name is everything inside the brackets: `heroicons--adjustments-horizontal-solid`.

## Adding an icon

Use the following HTML, replacing `SUFFIX` with the full icon name:

```html
<span class="iconify heroicons--SUFFIX"></span>
```

Example:

```html
<span class="iconify heroicons--adjustments-horizontal-solid"></span>
```

## Styling

Style icons with Tailwind utility classes on the same element:

```html
<span class="iconify heroicons--check size-5 text-green-500"></span>
<span class="iconify heroicons--trash size-4 text-red-600 dark:text-red-400"></span>
```

- Use `size-*` (e.g. `size-4`, `size-5`, `size-6`) to control icon dimensions.
- Use `text-*` color utilities to set the icon color.
- Include `dark:` variants when the surrounding UI supports dark mode.
- Icons inherit `currentColor` by default, so placing them inside a colored element works without extra classes.
