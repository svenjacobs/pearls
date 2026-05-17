<!--
  DiceShaker — the leather dice cup, purely presentational.
  Renders the tapered cup body and plays the shake animation while shaking is
  active. Contains no game logic; all state and behaviour are driven by props
  from a parent (e.g. DiceRoller).
-->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js'

  type Props = {
    /** Whether the shake animation is active. */
    shaking?: boolean
    /** Whether the cup button is interactive. */
    canShake?: boolean
    /** Called when the user clicks the cup. */
    onShake?: () => void
    /** When true, shows a green open-lock icon (staged dice will clear the target row). */
    clearRow?: boolean
    /** When true, shows a green arrow-up icon (player must tap a board row to pick target). */
    pickTarget?: boolean
  }

  let {
    shaking = false,
    canShake = true,
    onShake,
    clearRow = false,
    pickTarget = false,
  }: Props = $props()
</script>

<button
  class="cup relative flex shrink-0 cursor-pointer flex-col items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed"
  class:cup--shaking={shaking}
  onclick={onShake}
  disabled={!canShake}
  aria-label={shaking
    ? m.a11y_cup_shaking()
    : canShake
      ? m.a11y_cup_shake()
      : m.a11y_cup_disabled()}
>
  <div
    class="cup__body flex h-20 w-14 items-center justify-center rounded-t-md sm:h-26.25 sm:w-18.5"
  ></div>
  {#if pickTarget && !shaking}
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        class="iconify heroicons--arrow-up-20-solid size-6 text-green-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      ></span>
    </span>
  {:else if !canShake && !shaking}
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        class="iconify heroicons--x-mark-20-solid size-6 text-red-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      ></span>
    </span>
  {:else if clearRow && !shaking}
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        class="iconify heroicons--lock-open-20-solid size-6 text-green-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      ></span>
    </span>
  {/if}
</button>

<style>
  .cup {
    transform-origin: bottom center;
    filter: drop-shadow(0 5px 14px rgba(0, 0, 0, 0.65));
    transition: filter 0.15s;
    animation: none;
  }

  .cup--shaking {
    animation: shake 0.7s ease-in-out;
  }

  .cup:not(:disabled):hover {
    filter: drop-shadow(0 5px 14px rgba(0, 0, 0, 0.65)) brightness(1.2);
  }

  .cup__body {
    clip-path: polygon(0% 0%, 100% 0%, 82% 100%, 18% 100%);
    background:
      linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, transparent 28%),
      linear-gradient(to top, rgba(255, 180, 60, 0.06) 0%, transparent 20%),
      linear-gradient(
        to right,
        #1c0e07 0%,
        #4a2814 14%,
        #6d3e20 38%,
        #5a3018 58%,
        #3c1e0a 84%,
        #1c0e07 100%
      );
  }

  @keyframes shake {
    0%,
    100% {
      transform: rotate(0deg) translate(0, 0);
    }
    12% {
      transform: rotate(-14deg) translate(-3px, -5px);
    }
    25% {
      transform: rotate(14deg) translate(3px, -9px);
    }
    37% {
      transform: rotate(-10deg) translate(-2px, -6px);
    }
    50% {
      transform: rotate(10deg) translate(2px, -9px);
    }
    62% {
      transform: rotate(-6deg) translate(-1px, -4px);
    }
    75% {
      transform: rotate(6deg) translate(1px, -6px);
    }
    87% {
      transform: rotate(-2deg) translate(0, -2px);
    }
  }
</style>
