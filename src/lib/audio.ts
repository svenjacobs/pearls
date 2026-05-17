import { getMute, setMute } from '$lib/storage'

let ctx: AudioContext | null = null

const getCtx = (): AudioContext => {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export const isMuted = (): boolean => getMute()

export const toggleMute = (): boolean => {
  const next = !isMuted()
  setMute(next)
  return next
}

const guard = (): AudioContext | null => {
  if (isMuted()) return null
  try {
    const c = getCtx()
    return c.state === 'running' ? c : null
  } catch {
    return null
  }
}

type ToneParams = {
  type: OscillatorType
  t: number
  freqStart: number
  freqEnd?: number
  gainStart: number
  dur: number
}

const playTone = (
  c: AudioContext,
  { type, t, freqStart, freqEnd, gainStart, dur }: ToneParams,
): void => {
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, t)
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)

  const gain = c.createGain()
  gain.gain.setValueAtTime(gainStart, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

  osc.connect(gain)
  gain.connect(c.destination)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
  osc.start(t)
  osc.stop(t + dur)
}

type NoteParams = {
  freq: number
  start: number
  dur: number
}

const playNoteSequence = (
  c: AudioContext,
  notes: NoteParams[],
  buildNote: (c: AudioContext, note: NoteParams) => void,
): void => {
  notes.forEach((note) => buildNote(c, note))
}

export const playDiceShake = (): void => {
  if (isMuted()) return
  let c: AudioContext
  try {
    c = getCtx()
    if (c.state === 'suspended') void c.resume()
  } catch {
    return
  }

  const bufferSize = Math.ceil(c.sampleRate * 0.65)
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const source = c.createBufferSource()
  source.buffer = buffer

  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 600
  filter.Q.value = 0.8

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.25, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.65)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
  source.start()
}

export const playDieLand = (delayMs = 0): void => {
  const c = guard()
  if (!c) return
  playTone(c, {
    type: 'triangle',
    t: c.currentTime + delayMs / 1_000,
    freqStart: 180,
    freqEnd: 80,
    gainStart: 0.35,
    dur: 0.1,
  })
}

export const playDieSelect = (): void => {
  const c = guard()
  if (!c) return
  playTone(c, { type: 'sine', t: c.currentTime, freqStart: 900, gainStart: 0.12, dur: 0.05 })
}

export const playPearlDrop = (): void => {
  const c = guard()
  if (!c) return
  playTone(c, {
    type: 'sine',
    t: c.currentTime,
    freqStart: 520,
    freqEnd: 280,
    gainStart: 0.22,
    dur: 0.2,
  })
}

export const playRowClear = (): void => {
  const c = guard()
  if (!c) return

  const freqs = [523, 659, 1_047] // C5, E5, C6
  playNoteSequence(
    c,
    freqs.map((freq, i) => ({ freq, start: i * 0.1, dur: 0.4 })),
    (ctx, { freq, start, dur }) => {
      playTone(ctx, {
        type: 'sine',
        t: ctx.currentTime + start,
        freqStart: freq,
        gainStart: 0.28,
        dur,
      })
    },
  )
}

export const playIllegalSelection = (): void => {
  const c = guard()
  if (!c) return

  const t = c.currentTime

  // Short dissonant buzz: two detuned sawtooth waves a minor 2nd apart
  const freqs = [220, 233] // A3 + Bb3
  freqs.forEach((freq) => {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq

    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600

    const gain = c.createGain()
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(c.destination)
    osc.onended = () => {
      osc.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
    osc.start(t)
    osc.stop(t + 0.18)
  })
}

export const playLose = (): void => {
  const c = guard()
  if (!c) return

  // Descending chromatic line — sad trombone: D5 → C5 → Bb4 → Ab4
  const notes: NoteParams[] = [
    { freq: 587, start: 0.0, dur: 0.18 },
    { freq: 523, start: 0.19, dur: 0.18 },
    { freq: 466, start: 0.38, dur: 0.18 },
    { freq: 415, start: 0.57, dur: 0.72 },
  ]

  playNoteSequence(c, notes, (ctx, { freq, start, dur }) => {
    const t = ctx.currentTime + start

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.22, t + 0.02)
    gain.gain.setValueAtTime(0.22, t + dur * 0.6)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.onended = () => {
      osc.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
    osc.start(t)
    osc.stop(t + dur)
  })
}

export const playBust = (): void => {
  const c = guard()
  if (!c) return
  playTone(c, {
    type: 'sawtooth',
    t: c.currentTime,
    freqStart: 350,
    freqEnd: 120,
    gainStart: 0.18,
    dur: 0.5,
  })
}

export const playVictory = (): void => {
  const c = guard()
  if (!c) return

  // Ascending fanfare: G4 → C5 → E5 → G5 → C6 (sustained)
  const notes: NoteParams[] = [
    { freq: 392, start: 0.0, dur: 0.11 },
    { freq: 523, start: 0.12, dur: 0.11 },
    { freq: 659, start: 0.24, dur: 0.17 },
    { freq: 784, start: 0.42, dur: 0.17 },
    { freq: 1_047, start: 0.6, dur: 0.75 },
  ]

  playNoteSequence(c, notes, (ctx, { freq, start, dur }) => {
    const t = ctx.currentTime + start

    // Triangle for clarity; low sawtooth blend for brass body
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq

    const osc2 = ctx.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.value = freq

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = freq * 3

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.28, t + 0.015)
    gain.gain.setValueAtTime(0.28, t + dur * 0.7)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    const gain2 = ctx.createGain()
    gain2.gain.value = 0.07

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc2.connect(gain2)
    gain2.connect(filter)
    filter.connect(ctx.destination)

    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
    osc2.onended = () => {
      osc2.disconnect()
      gain2.disconnect()
      filter.disconnect()
    }
    osc.start(t)
    osc.stop(t + dur)
    osc2.start(t)
    osc2.stop(t + dur)
  })
}
