<!--
  Die — renders a single six-sided die face.
  Displays pips in the standard Western layout for values 1–6.
  Value 0 renders a blank, dimmed face (die not yet rolled).
-->
<script lang="ts">
  type Props = {
    /** Face value 1–6. Pass 0 for an unrolled (blank) face. */
    value: number
  }

  let { value }: Props = $props()

  /**
   * Pip occupancy for each face value, mapped to a flat 9-cell grid (3×3,
   * row-major). Position indices:
   *   0 1 2
   *   3 4 5
   *   6 7 8
   *
   * Matches standard Western die orientation.
   */
  const PIP_MAP: Readonly<Record<number, readonly boolean[]>> = {
    0: [false, false, false, false, false, false, false, false, false],
    1: [false, false, false, false, true, false, false, false, false],
    2: [false, false, true, false, false, false, true, false, false],
    3: [false, false, true, false, true, false, true, false, false],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true],
  }

  const CELL_INDICES = Array.from({ length: 9 }, (_, k) => k)

  const pips = $derived(PIP_MAP[value] ?? PIP_MAP[0])
</script>

<div
  class="die box-border grid h-full w-full grid-cols-3 gap-[10%] rounded-[18%] p-[12%] {value === 0
    ? 'opacity-[0.35]'
    : ''}"
  role="img"
  aria-label={value === 0 ? 'Unrolled die' : `Die showing ${value}`}
>
  {#each CELL_INDICES as k (k)}
    <div class="aspect-square w-full rounded-full" class:pip--active={pips[k]}></div>
  {/each}
</div>

<style>
  .die {
    background: linear-gradient(145deg, #faf7ef 0%, #ece8dc 100%);
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      inset 0 -1px 2px rgba(0, 0, 0, 0.1);
  }

  .pip--active {
    background: radial-gradient(circle at 35% 30%, #555, #111);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }
</style>
