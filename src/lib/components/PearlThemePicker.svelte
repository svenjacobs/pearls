<!--
  PearlThemePicker — dropdown theme selector for the game entry form.
  Shows the selected theme in a trigger button; opens a scrollable dropdown
  with a search field and actual Pearl previews. Persists to localStorage.
-->
<script lang="ts">
  import Pearl from '$lib/components/game_assets/board/Pearl.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import {
    DEFAULT_THEME_ID,
    PEARL_THEMES,
    type PearlTheme,
    THEME_GROUPS,
    type ThemeGroup,
  } from '$lib/pearlThemes'
  import { getPearlTheme, setPearlTheme } from '$lib/storage'

  let selected = $state(DEFAULT_THEME_ID)
  let open = $state(false)
  let query = $state('')
  let wrapperEl = $state<HTMLElement | null>(null)
  let searchEl = $state<HTMLInputElement | null>(null)

  const selectedTheme = $derived(PEARL_THEMES.find((t) => t.id === selected) ?? PEARL_THEMES[0])

  const THEME_LABELS: Record<string, () => string> = {
    rainbow: m.theme_rainbow,
    pride: m.theme_pride,
    ocean: m.theme_ocean,
    sunset: m.theme_sunset,
    forest: m.theme_forest,
    spring: m.theme_spring,
    summer: m.theme_summer,
    autumn: m.theme_autumn,
    winter: m.theme_winter,
    sakura: m.theme_sakura,
    galaxy: m.theme_galaxy,
    neon: m.theme_neon,
    pastel: m.theme_pastel,
    arctic: m.theme_arctic,
    france: m.theme_france,
    italy: m.theme_italy,
    brazil: m.theme_brazil,
    germany: m.theme_germany,
    usa: m.theme_usa,
  }

  const GROUP_LABELS: Record<string, () => string> = {
    colors: m.theme_group_colors,
    nature: m.theme_group_nature,
    seasons: m.theme_group_seasons,
    flags: m.theme_group_flags,
  }

  const themeLabel = (id: string): string => THEME_LABELS[id]?.() ?? id
  const groupLabel = (id: string): string => GROUP_LABELS[id]?.() ?? id

  const filteredGroups = $derived(
    query.trim()
      ? THEME_GROUPS.map((g: ThemeGroup) => ({
          id: g.id,
          themes: g.themes.filter((t: PearlTheme) =>
            themeLabel(t.id).toLowerCase().includes(query.trim().toLowerCase()),
          ),
        })).filter((g: { id: string; themes: PearlTheme[] }) => g.themes.length > 0)
      : [...THEME_GROUPS],
  )

  $effect(() => {
    const saved = getPearlTheme()
    if (saved && PEARL_THEMES.some((t) => t.id === saved)) {
      selected = saved
    }
  })

  // Reset search when dropdown closes.
  $effect(() => {
    if (!open) query = ''
  })

  // Auto-focus search input when dropdown opens — skip on touch devices to avoid keyboard pop-up.
  $effect(() => {
    if (open && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      searchEl?.focus()
    }
  })

  // Close when clicking outside the wrapper.
  $effect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrapperEl?.contains(e.target as Node)) open = false
    }
    window.addEventListener('click', close, true)
    return () => window.removeEventListener('click', close, true)
  })

  // Close on Escape.
  $effect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const select = (id: string) => {
    selected = id
    setPearlTheme(id)
    open = false
  }
</script>

<input type="hidden" name="pearlTheme" value={selected} />

<div class="flex w-full flex-col gap-3">
  <p class="text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">
    {m.form_pearl_theme_label()}
  </p>

  <div bind:this={wrapperEl} class="relative">
    <!-- Trigger -->
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onclick={() => (open = !open)}
      class="flex w-full items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      <span
        class="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-700 dark:text-gray-200"
      >
        {themeLabel(selected)}
      </span>
      <div class="flex shrink-0 gap-px">
        {#each selectedTheme.colors as color, ci (ci)}
          <div class="size-3">
            <Pearl {color} />
          </div>
        {/each}
      </div>
      <span
        class="iconify heroicons--chevron-down-20-solid size-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500"
        class:rotate-180={open}
      ></span>
    </button>

    <!-- Dropdown -->
    {#if open}
      <div
        class="absolute right-0 left-0 z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      >
        <!-- Search field -->
        <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <div class="flex items-center gap-2">
            <span
              class="iconify heroicons--magnifying-glass-20-solid size-4 shrink-0 text-gray-400 dark:text-gray-500"
            ></span>
            <input
              bind:this={searchEl}
              bind:value={query}
              type="text"
              placeholder={m.form_pearl_theme_search_placeholder()}
              class="min-w-0 flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none dark:text-gray-200 dark:placeholder-gray-500"
            />
            {#if query}
              <button
                type="button"
                aria-label={m.nav_close()}
                onclick={() => (query = '')}
                class="iconify heroicons--x-mark-20-solid size-4 shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              ></button>
            {/if}
          </div>
        </div>

        <!-- Theme list -->
        <ul role="listbox" aria-label={m.form_pearl_theme_label()} class="max-h-48 overflow-y-auto">
          {#each filteredGroups as group (group.id)}
            <li
              role="presentation"
              class="list-none px-4 pt-2.5 pb-1 text-xs font-semibold tracking-widest text-gray-400 uppercase dark:text-gray-500"
            >
              {groupLabel(group.id)}
            </li>
            {#each group.themes as theme (theme.id)}
              {@const isSelected = selected === theme.id}
              <li role="option" aria-selected={isSelected} class="list-none">
                <button
                  type="button"
                  onclick={() => select(theme.id)}
                  class="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 {isSelected
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : ''}"
                >
                  <span
                    class="min-w-0 flex-1 truncate text-left text-sm font-semibold {isSelected
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-700 dark:text-gray-200'}"
                  >
                    {themeLabel(theme.id)}
                  </span>
                  <div class="flex shrink-0 gap-px">
                    {#each theme.colors as color, ci (ci)}
                      <div class="size-3">
                        <Pearl {color} />
                      </div>
                    {/each}
                  </div>
                  {#if isSelected}
                    <span class="iconify heroicons--check-20-solid size-4 shrink-0 text-amber-500"
                    ></span>
                  {:else}
                    <span class="size-4 shrink-0"></span>
                  {/if}
                </button>
              </li>
            {/each}
          {/each}
          {#if filteredGroups.length === 0}
            <li class="list-none px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
              {m.form_pearl_theme_no_results()}
            </li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
</div>
