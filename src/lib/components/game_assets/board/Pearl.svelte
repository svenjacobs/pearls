<!--
  Pearl — a single glossy bead rendered as a circle.
  The pearl colour is supplied by the parent; the gloss effect is achieved
  via a radial gradient from white to the base colour. Spent pearls (already
  slid off the board) are rendered desaturated.
-->
<script lang="ts">
  type Props = {
    /** CSS colour value for the pearl body. */
    color: string
    /**
     * Whether this pearl has been spent (slid off the active side).
     * When true, the pearl is rendered desaturated.
     * Defaults to false — no visual difference by default.
     */
    spent?: boolean
  }

  let { color, spent = false }: Props = $props()
</script>

<div class="pearl h-full w-full rounded-full" class:saturate-80={spent} style="--c: {color}"></div>

<style>
  .pearl {
    /* Glossy sphere: white specular highlight fading to the row colour */
    background: radial-gradient(circle at 36% 30%, #fff 0%, var(--c) 46%);
    box-shadow:
      1px 2px 5px rgba(0, 0, 0, 0.55),
      inset -1px -2px 3px rgba(0, 0, 0, 0.22);
  }
</style>
