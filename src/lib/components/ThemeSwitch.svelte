<script lang="ts">
  import { browser } from '$app/environment'
  import * as m from '$lib/paraglide/messages.js'
  import { getTheme, setTheme, type Theme } from '$lib/storage'

  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()

  const cycle: Theme[] = ['system', 'light', 'dark']

  const config: Record<Theme, { icon: string; label: () => string }> = {
    system: { icon: 'heroicons--computer-desktop-20-solid', label: () => m.menu_theme_system() },
    light: { icon: 'heroicons--sun-20-solid', label: () => m.menu_theme_light() },
    dark: { icon: 'heroicons--moon-20-solid', label: () => m.menu_theme_dark() },
  }

  let theme = $state<Theme>('system')

  $effect(() => {
    if (!browser) return
    theme = getTheme()
  })

  const advance = () => {
    const next = cycle[(cycle.indexOf(theme) + 1) % cycle.length]
    theme = next
    setTheme(next)
    const root = document.documentElement
    // Add theme-transition before toggling dark so the CSS rule is active when
    // the class change triggers a repaint. Removed after the transition completes.
    root.classList.add('theme-transition')
    if (next === 'dark') {
      root.classList.add('dark')
    } else if (next === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    setTimeout(() => root.classList.remove('theme-transition'), 250)
  }
</script>

<button
  type="button"
  onclick={advance}
  title={m.a11y_theme_switch()}
  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors {className}"
>
  <span class="iconify {config[theme].icon} size-4 shrink-0"></span>
  {config[theme].label()}
</button>
