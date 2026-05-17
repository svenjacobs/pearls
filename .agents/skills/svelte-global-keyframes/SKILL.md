---
name: svelte-global-keyframes
description: >
  Teaches agents how to define globally referenceable @keyframes animations
  inside Svelte component <style> blocks using the -global- prefix. Use this
  skill whenever a Svelte component needs a custom keyframe animation that is
  referenced from a Tailwind arbitrary-value class (e.g. animate-[name_...])
  or from any other CSS rule outside the component's scoped styles.
compatibility: Svelte 5, SvelteKit, TailwindCSS v4
---

## Problem

Svelte scopes `@keyframes` names defined in `<style>` blocks by appending a
unique hash to the name at compile time. This means a keyframe defined as:

```css
@keyframes pop { … }
```

becomes something like `@keyframes pop-abc123 { … }` in the output. Any
reference to `pop` from a Tailwind arbitrary-value class such as
`animate-[pop_0.3s_ease]` will break because the compiled name no longer
matches.

## Solution: the `-global-` prefix

Prefix the keyframe name with `-global-`. Svelte strips this prefix and emits
the name *without* scoping:

```css
/* In the component <style> block */
@keyframes -global-pop {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
```

The compiled output is `@keyframes pop { … }` — globally referenceable.

### Referencing from Tailwind

```svelte
<div class="animate-[pop_0.3s_ease_forwards]">…</div>
```

### Referencing from sibling CSS rules

```css
.my-element {
  animation: pop 0.3s ease forwards;
}
```

Both work because the keyframe name is not scoped.

## Rules

1. **Always** use `-global-` when a keyframe name must be referenced outside
   the component's own scoped selectors (e.g. from Tailwind utilities or from
   a parent element's CSS).
2. Keep the keyframe definition co-located with the component that owns it.
   Avoid moving keyframes to `app.css` just to work around scoping — the
   `-global-` prefix is the correct solution.
3. Choose descriptive, collision-resistant names (e.g. `balloon-rise`,
   `pearl-pop`) since the name is now global and could clash with other
   components.

## Reference

- [Svelte global styles — `:global()`](https://svelte.dev/docs/svelte/global-styles#:global())
