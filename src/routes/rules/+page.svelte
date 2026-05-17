<script lang="ts">
  import { GameBoard } from '$lib'
  import CloseButton from '$lib/components/CloseButton.svelte'
  import * as m from '$lib/paraglide/messages.js'

  // ── Board states used as visual examples ────────────────────────────────────

  // Setup: every row full, nothing staged.
  const setupBoard = Array<number>(12).fill(7)
  const noStaged = Array<number>(12).fill(0)

  // Mid-turn: player locked on 4, rolled three 4s this roll, staged them.
  // Rows 2 and 7 show prior progress from earlier turns.
  const midBoard = [7, 5, 7, 4, 7, 7, 3, 7, 7, 7, 7, 7]
  const midStaged = [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0]

  // Cleared-row bonus: row 7 (index 6) just reached 0 — turn resets.
  const bonusBoard = [7, 5, 7, 1, 7, 7, 0, 7, 7, 7, 7, 7]
</script>

<svelte:head>
  <title>{m.rules_heading()} · Pearls</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center px-6 py-10">
  <div class="w-full max-w-2xl">
    <div class="mb-8 flex justify-end">
      <CloseButton />
    </div>

    <h1 class="font-display mb-10 text-4xl font-black tracking-tight text-gray-900 dark:text-white">
      {m.rules_heading()}
    </h1>

    <!-- ── Objective ──────────────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_objective_heading()}
      </h2>
      <div class="md:flex md:items-start md:gap-8">
        <div class="text-base leading-relaxed text-gray-700 md:flex-1 dark:text-gray-300">
          <p>
            {m.rules_objective_p1_a()}<strong>{m.rules_objective_p1_strong1()}</strong
            >{m.rules_objective_p1_b()}<strong>{m.rules_objective_p1_strong2()}</strong
            >{m.rules_objective_p1_c()}
          </p>
          <p class="mt-3">
            {m.rules_objective_p2()}
          </p>
        </div>
        <div class="mt-6 w-44 shrink-0 sm:w-52 md:mt-0">
          <GameBoard board={setupBoard} staged={noStaged} class="w-full" />
        </div>
      </div>
    </section>

    <!-- ── Setup ─────────────────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_setup_heading()}
      </h2>
      <ol class="list-none space-y-2 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >1</span
          >
          {m.rules_setup_step1()}
        </li>
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >2</span
          >
          {m.rules_setup_step2()}
        </li>
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >3</span
          >
          {m.rules_setup_step3()}
        </li>
      </ol>
    </section>

    <!-- ── Turn structure ────────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_turn_heading()}
      </h2>
      <p class="mb-6 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        {m.rules_turn_intro()}
      </p>
      <ol class="list-none space-y-4 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >1</span
          >
          <div>
            <strong class="text-gray-900 dark:text-white">{m.rules_step1_strong()}</strong>
            <p class="mt-1 text-gray-600 dark:text-gray-400">
              {m.rules_step1_sub()}
            </p>
          </div>
        </li>
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >2</span
          >
          <div>
            <strong class="text-gray-900 dark:text-white">{m.rules_step2_strong()}</strong>
            <p class="mt-1 text-gray-600 dark:text-gray-400">{m.rules_step2_sub()}</p>
            <ul class="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li class="flex gap-2">
                <span
                  class="mt-0.5 shrink-0 font-mono text-xs font-bold text-amber-600 dark:text-amber-400"
                  >1–6</span
                >
                <span>{m.rules_step2_bullet_low()}</span>
              </li>
              <li class="flex gap-2">
                <span
                  class="mt-0.5 shrink-0 font-mono text-xs font-bold text-amber-600 dark:text-amber-400"
                  >7–12</span
                >
                <span>{m.rules_step2_bullet_high()}</span>
              </li>
            </ul>
          </div>
        </li>
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >3</span
          >
          <div>
            <strong class="text-gray-900 dark:text-white">{m.rules_step3_strong()}</strong>
            <p class="mt-1 text-gray-600 dark:text-gray-400">
              {m.rules_step3_sub()}
            </p>
          </div>
        </li>
        <li class="flex gap-3">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
            >4</span
          >
          <div>
            <strong class="text-gray-900 dark:text-white">{m.rules_step4_strong()}</strong>
            <p class="mt-1 text-gray-600 dark:text-gray-400">
              {m.rules_step4_sub()}
            </p>
          </div>
        </li>
      </ol>

      <!-- Example board: staged pearls -->
      <div
        class="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20"
      >
        <div class="md:flex md:items-start md:gap-6">
          <div class="w-44 shrink-0 sm:w-52">
            <GameBoard board={midBoard} staged={midStaged} class="w-full" />
          </div>
          <div class="mt-4 md:mt-0">
            <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {m.rules_example_label()}
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {m.rules_example_p_a()}<span class="font-mono font-bold">4 4 4</span
              >{m.rules_example_p_b()}<strong>4</strong>{m.rules_example_p_c()}<strong
                >{m.rules_example_p_strong()}</strong
              >{m.rules_example_p_d()}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Cleared-row bonus ─────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_cleared_heading()}
      </h2>
      <div class="md:flex md:items-start md:gap-8">
        <div class="text-base leading-relaxed text-gray-700 md:flex-1 dark:text-gray-300">
          <p>
            {m.rules_cleared_p1_a()}<strong>{m.rules_cleared_p1_strong()}</strong
            >{m.rules_cleared_p1_b()}
          </p>
          <p class="mt-3 text-gray-600 dark:text-gray-400">
            {m.rules_cleared_p2()}
          </p>
        </div>
        <div class="mt-6 w-44 shrink-0 sm:w-52 md:mt-0">
          <GameBoard board={bonusBoard} staged={noStaged} class="w-full" />
        </div>
      </div>
    </section>

    <!-- ── Winning ────────────────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_winning_heading()}
      </h2>
      <p class="text-base leading-relaxed text-gray-700 dark:text-gray-300">
        {m.rules_winning_p_a()}<strong>{m.rules_winning_p_strong()}</strong>{m.rules_winning_p_b()}
      </p>
    </section>

    <!-- ── Scoring ────────────────────────────────────────────────────────── -->
    <section class="mb-12">
      <h2 class="font-display mb-4 text-xl font-bold text-gray-900 dark:text-white">
        {m.rules_scoring_heading()}
      </h2>
      <p class="text-base leading-relaxed text-gray-700 dark:text-gray-300">
        {m.rules_scoring_p()}
      </p>
      <div
        class="mt-4 inline-block rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <span class="text-gray-500 dark:text-gray-400">{m.rules_scoring_formula_label()}</span>
        <span class="text-gray-900 dark:text-white">{m.rules_scoring_formula()}</span>
      </div>
      <p class="mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-400">
        {m.rules_scoring_example()}
      </p>
    </section>
  </div>
</div>
