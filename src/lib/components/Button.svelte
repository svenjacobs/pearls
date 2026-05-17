<!--
  Button — primary interactive element supporting 5 visual variants.
  Renders as <a> when href is provided, otherwise as <button>.
  Use the class prop to supply sizing, rounding, and layout; variant handles colors.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { twMerge } from 'tailwind-merge'

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'

  type Props = Omit<HTMLButtonAttributes, 'class'> & {
    variant?: Variant
    href?: string
    class?: string
    children: Snippet
  }

  let { variant = 'primary', href, class: className = '', children, ...rest }: Props = $props()

  const variants: Record<Variant, string> = {
    primary:
      'bg-amber-600 text-white shadow-md shadow-amber-600/20 transition-all hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-600/30 disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-gray-700',
    secondary:
      'bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50',
    ghost:
      'border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50',
    danger: 'bg-red-600 text-white transition-colors hover:bg-red-500 disabled:opacity-50',
    'danger-ghost':
      'border border-red-300 text-red-600 transition-colors hover:border-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:border-red-600 dark:hover:bg-red-950/30 disabled:opacity-50',
  }

  const base =
    'inline-flex cursor-pointer items-center justify-center active:scale-[0.97] disabled:cursor-not-allowed'

  const classes = $derived(twMerge(base, variants[variant], className))
</script>

{#if href}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a {href} class={classes} {...rest as Record<string, unknown>}>
    {@render children()}
  </a>
{:else}
  <button class={classes} {...rest}>
    {@render children()}
  </button>
{/if}
