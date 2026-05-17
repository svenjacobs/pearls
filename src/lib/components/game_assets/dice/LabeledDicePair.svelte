<!--
  LabeledDicePair — two dice selected together as a pair (targets 7–12).
  Renders the dice as a diagonal stack (first die top-left behind, second
  bottom-right in front) with their combined sum printed below.
-->
<script lang="ts">
  import Die from './Die.svelte'

  type Props = {
    values: [number, number]
  }

  let { values }: Props = $props()

  const sum = $derived(values[0] + values[1])
</script>

<div class="flex flex-col items-center gap-1">
  <!--
    Container matches a regular die (h-9/h-13). Individual dice are slightly
    smaller (h-7/h-11) so both fit inside the same footprint with an 8 px
    diagonal offset — first die top-left, second bottom-right.
  -->
  <div class="relative h-9 w-9 shrink-0 sm:h-13 sm:w-13">
    <div class="absolute top-0 left-0 h-7 w-7 sm:h-11 sm:w-11">
      <Die value={values[0]} />
    </div>
    <div class="absolute right-0 bottom-0 h-7 w-7 drop-shadow-md sm:h-11 sm:w-11">
      <Die value={values[1]} />
    </div>
  </div>
  <span class="font-mono text-xs font-medium text-white">{sum}</span>
</div>
