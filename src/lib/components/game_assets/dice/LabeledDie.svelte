<!--
  LabeledDie — a single die with its face value printed below.
  Renders a Die component and a numeric label beneath it. The label is omitted
  when the value is 0 (not yet rolled).
-->
<script lang="ts">
  import Die from './Die.svelte'

  type Props = {
    value: number
  }

  let { value }: Props = $props()
</script>

<div class="flex flex-col items-center gap-1">
  <div class="h-9 w-9 sm:h-13 sm:w-13">
    <Die {value} />
  </div>
  <span class="font-mono text-xs font-medium text-white">
    {value > 0 ? value : ''}
  </span>
</div>
