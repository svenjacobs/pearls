<!--
  ReactionOverlay — full-screen pointer-events-none layer that renders floating
  emoji reactions. Each reaction floats from the bottom of the screen upward
  with a gentle balloon-like sway, then fades out.

  Two nested spans decouple the animations so they don't interfere:
  - Outer (.balloon-rise): constant linear upward movement + fade
  - Inner (.balloon-sway): smooth ease-in-out sinusoidal horizontal sway

  Z-index: z-9998 — below the notification bubble (z-9999) but above all
  other UI elements.
-->
<script lang="ts">
  export type FloatingReaction = {
    id: string
    emoji: string
    /** Horizontal start position as a percentage (10–85). */
    left: number
  }

  type Props = {
    reactions: FloatingReaction[]
  }

  let { reactions }: Props = $props()
</script>

<div class="pointer-events-none fixed inset-0 z-9998" aria-hidden="true">
  {#each reactions as reaction (reaction.id)}
    <span class="balloon-rise absolute bottom-0 select-none" style="left: {reaction.left}%">
      <span class="balloon-sway block text-4xl md:text-5xl">
        {reaction.emoji}
      </span>
    </span>
  {/each}
</div>

<style>
  /*
    Outer span: constant linear rise so the emoji never pauses mid-flight.
    Fade starts at 70% and completes at 100%.
  */
  .balloon-rise {
    animation: float-rise 3s linear forwards;
  }

  /*
    Inner span: ease-in-out sinusoidal sway (slow at extremes, fast through
    centre) so the horizontal motion feels natural without affecting the rise.
  */
  .balloon-sway {
    animation: float-sway 3s ease-in-out forwards;
  }

  @keyframes -global-float-rise {
    0% {
      transform: translateY(4rem);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: translateY(-65vh);
      opacity: 0;
    }
  }

  @keyframes -global-float-sway {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(1.5vw);
    }
    75% {
      transform: translateX(-1.5vw);
    }
    100% {
      transform: translateX(0);
    }
  }
</style>
