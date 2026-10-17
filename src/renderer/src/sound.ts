import { useEffect, useState } from 'react'
import type { Cue, Sound, Sounds } from '../../shared/model'

// The player's own volumes, each from 0 to 1, kept on this computer: how loud the game is is the machine's business, not the save's.
export const VOLUME_KINDS = ['effects', 'ambience', 'music'] as const
export type VolumeKind = (typeof VOLUME_KINDS)[number]
export type Volumes = Record<VolumeKind, number>
const VOLUME_KEY = 'breedhaven.volume'
const DEFAULT_VOLUMES: Volumes = { effects: 0.7, ambience: 0.5, music: 0.4 }

// How long one ambience takes to give way to the next.
const FADE_MS = 1500
const FADE_STEP_MS = 50

let volumes = readVolumes()
const listeners = new Set<(volumes: Volumes) => void>()
let cues: Sounds['cues'] = {}

function readVolumes(): Volumes {
  try {
    return { ...DEFAULT_VOLUMES, ...(JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? '{}') as Partial<Volumes>) }
  } catch {
    return { ...DEFAULT_VOLUMES }
  }
}

export function setVolume(kind: VolumeKind, value: number): void {
  volumes = { ...volumes, [kind]: value }
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes))
  } catch {
    // Unkept, it lasts as long as the window does.
  }
  if (ambience) {
    window.clearInterval(fades.get(ambience.audio))
    ambience.audio.volume = ambience.sound.volume * volumes.ambience
  }
  if (poseLoop) {
    window.clearInterval(fades.get(poseLoop.audio))
    poseLoop.audio.volume = poseLoop.sound.volume * volumes.effects
  }
  listeners.forEach((listener) => listener(volumes))
}

/** The volumes as they stand, kept up to date as the player changes them. */
export function useVolumes(): Volumes {
  const [current, setCurrent] = useState(volumes)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => void listeners.delete(setCurrent)
  }, [])
  return current
}

const url = (file: string) => `content://pack/${file}`

// A notice usually says what an event cue has just played for, and is not heard on top of it.
const NOTICE_GAP_MS = 300
const EVENT_CUES: Cue[] = ['message', 'coins', 'skill', 'bond', 'pregnancy', 'birth']
let lastEventAt = 0

/** Plays a cue once, over whatever else is playing. A cue the content has no sound for is silent. */
export function play(cue: Cue): void {
  const sound = cues[cue]
  if (!sound || volumes.effects === 0) return
  if (EVENT_CUES.includes(cue)) lastEventAt = Date.now()
  else if (cue === 'notice' && Date.now() - lastEventAt < NOTICE_GAP_MS) return
  const audio = new Audio(url(sound.file))
  audio.volume = sound.volume * volumes.effects
  // A sound that cannot play is no reason to stop anything else.
  audio.play().catch(() => undefined)
}

// The loop playing behind the place, and the timer of each loop still fading in or out.
let ambience: { sound: Sound; audio: HTMLAudioElement } | null = null
const fades = new WeakMap<HTMLAudioElement, number>()

function fade(audio: HTMLAudioElement, to: number, done?: () => void): void {
  window.clearInterval(fades.get(audio))
  const step = (to - audio.volume) / (FADE_MS / FADE_STEP_MS)
  const timer = window.setInterval(() => {
    const next = audio.volume + step
    if (step === 0 || (step > 0 ? next >= to : next <= to)) {
      audio.volume = to
      window.clearInterval(timer)
      done?.()
    } else audio.volume = next
  }, FADE_STEP_MS)
  fades.set(audio, timer)
}

/** Sets the loop behind the place, fading from the one before. The same file carries on where it was. */
export function setAmbience(sound: Sound | undefined): void {
  if (ambience && sound && ambience.sound.file === sound.file) {
    ambience.sound = sound
    fade(ambience.audio, sound.volume * volumes.ambience)
    return
  }
  if (ambience) {
    const { audio } = ambience
    fade(audio, 0, () => audio.pause())
  }
  ambience = null
  if (!sound) return
  const audio = new Audio(url(sound.file))
  audio.loop = true
  audio.volume = 0
  audio.play().catch(() => undefined)
  fade(audio, sound.volume * volumes.ambience)
  ambience = { sound, audio }
}

// The loop behind an NSFW pose while it is up: on the effects volume, and quick to come and go with the picture.
let poseLoop: { sound: Sound; audio: HTMLAudioElement } | null = null
const POSE_FADE_MS = 300

/** Sets the loop behind the pose that is up, or stops it. The same file carries on where it was. */
export function setPoseLoop(sound: Sound | undefined): void {
  if (poseLoop && sound && poseLoop.sound.file === sound.file) return
  if (poseLoop) {
    const { audio } = poseLoop
    fadeFor(audio, 0, POSE_FADE_MS, () => audio.pause())
  }
  poseLoop = null
  if (!sound || volumes.effects === 0) return
  const audio = new Audio(url(sound.file))
  audio.loop = true
  audio.volume = 0
  audio.play().catch(() => undefined)
  fadeFor(audio, sound.volume * volumes.effects, POSE_FADE_MS)
  poseLoop = { sound, audio }
}

function fadeFor(audio: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  window.clearInterval(fades.get(audio))
  const steps = Math.max(1, ms / FADE_STEP_MS)
  const step = (to - audio.volume) / steps
  const timer = window.setInterval(() => {
    const next = audio.volume + step
    if (step === 0 || (step > 0 ? next >= to : next <= to)) {
      audio.volume = Math.max(0, Math.min(1, to))
      window.clearInterval(timer)
      done?.()
    } else audio.volume = Math.max(0, Math.min(1, next))
  }, FADE_STEP_MS)
  fades.set(audio, timer)
}

/**
 * Takes the game's sounds from its content, and clicks for every button pressed anywhere: one listener for
 * the whole window, so that no button can be missed.
 */
export function useSounds(sounds: Sounds | undefined): void {
  useEffect(() => {
    cues = sounds?.cues ?? {}
  }, [sounds])
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled), [role="tab"]')) play('click')
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])
}
