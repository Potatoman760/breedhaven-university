import { useEffect, useState } from 'react'
import type { Cue, Sound, Sounds } from '../../shared/model'
import { lineKey } from '../../shared/game/voice'

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
let lines: Sounds['lines'] = {}
let fightSounds: Sounds['fight'] = {}
let playerName = ''
// Lines as shown, to the same as written, for a cutscene being read that the game filled in.
let written: Record<string, string> = {}
/** The lines of the cutscene now being read, as shown, to the same as written: their recordings are of the words as written. */
export function setWrittenLines(pairs: Record<string, string>): void {
  written = pairs
}

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
    ambience.audio.volume = ambienceLevel(ambience.sound)
  }
  if (weather) {
    window.clearInterval(fades.get(weather.audio))
    weather.audio.volume = weatherLevel(weather.sound, weather.indoors)
  }
  if (song) {
    window.clearInterval(fades.get(song))
    song.volume = songLevel()
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
const EVENT_CUES: Cue[] = ['message', 'coins', 'skill', 'bond', 'pregnancy', 'birth', 'relic']
let lastEventAt = 0
// A press that opens or closes something is heard as that and not as a click first: the click waits a moment, and
// one of these, played meanwhile, takes its place. Longer than the tick a dialog's close is put off by.
const OPENINGS: Cue[] = ['open', 'close', 'phoneOn', 'phoneOff', 'bagOpen', 'bagClose']
const CLICK_WAIT_MS = 30
let pendingClick: number | undefined

/** Plays a cue once, this long after the component is first shown: as an animation lands. */
export function useCueAt(cue: Cue, delayMs: number): void {
  useEffect(() => {
    const timer = window.setTimeout(() => play(cue), delayMs)
    return () => window.clearTimeout(timer)
  }, [])
}

/** Plays a cue once, over whatever else is playing. A cue the content has no sound for is silent. */
export function play(cue: Cue): void {
  if (OPENINGS.includes(cue)) {
    window.clearTimeout(pendingClick)
    pendingClick = undefined
  }
  const sound = cues[cue]
  if (!sound || volumes.effects === 0) return
  if (EVENT_CUES.includes(cue)) lastEventAt = Date.now()
  else if (cue === 'notice' && Date.now() - lastEventAt < NOTICE_GAP_MS) return
  const audio = new Audio(url(sound.file))
  audio.volume = sound.volume * volumes.effects
  // A sound that cannot play is no reason to stop anything else.
  audio.play().catch(() => undefined)
}

// A voice is louder than a click: her sounds are mastered quieter than the interface's.
const VOICE_LEVEL = 0.9

/** Plays sounds of her voice, files in the pack, one after another, over whatever else is playing. */
export function playVoices(files: string[]): void {
  const [file, ...rest] = files
  if (!file || volumes.effects === 0) return
  const audio = new Audio(url(file))
  audio.volume = Math.min(1, VOICE_LEVEL * volumes.effects)
  // The next once this one is done, or at once if it cannot play.
  audio.addEventListener('ended', () => playVoices(rest), { once: true })
  audio.play().catch(() => playVoices(rest))
}

// The line being read aloud: one at a time, cut off by the next, or by the reading ending.
let line: HTMLAudioElement | null = null

/** The recording of a line written ahead, if it has been recorded. */
export function lineFile(speakerId: string, text: string): string | undefined {
  return lines[lineKey(speakerId, text, playerName)]
}

/** Reads a line written ahead aloud in its speaker's voice, where it has been recorded; stops whatever line was before. */
export function playLine(speakerId: string | undefined, text: string): void {
  stopLine()
  const file = speakerId === undefined ? undefined : lines[lineKey(speakerId, written[text] ?? text, playerName)]
  if (!file || volumes.effects === 0) return
  const audio = new Audio(url(file))
  audio.volume = Math.min(1, VOICE_LEVEL * volumes.effects)
  audio.play().catch(() => undefined)
  line = audio
}

/** The player's name, for finding a recorded line by its words: his name is put back as the token it was written as. */
export function usePlayerName(name: string): void {
  useEffect(() => {
    playerName = name
  }, [name])
}

export function stopLine(): void {
  line?.pause()
  line = null
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
    fade(ambience.audio, ambienceLevel(sound))
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
  fade(audio, ambienceLevel(sound))
  ambience = { sound, audio }
}

/** How loud the place's loop is: silent while a song is playing in its place. */
function ambienceLevel(sound: Sound): number {
  return song ? 0 : sound.volume * volumes.ambience
}

// The weather, a second loop under the place's: heard through the walls, faintly, from indoors.
const INDOORS_WEATHER = 0.3
let weather: { sound: Sound; indoors: boolean; audio: HTMLAudioElement } | null = null
const weatherLevel = (sound: Sound, indoors: boolean) => (song ? 0 : sound.volume * volumes.ambience * (indoors ? INDOORS_WEATHER : 1))

/** Sets the weather's loop, fading from the one before; the same file carries on, louder or fainter as he goes in or out. */
export function setWeather(heard: { sound: Sound; indoors: boolean } | undefined): void {
  if (weather && heard && weather.sound.file === heard.sound.file) {
    weather = { ...weather, ...heard }
    fade(weather.audio, weatherLevel(heard.sound, heard.indoors))
    return
  }
  if (weather) {
    const { audio } = weather
    fade(audio, 0, () => audio.pause())
  }
  weather = null
  if (!heard) return
  const audio = new Audio(url(heard.sound.file))
  audio.loop = true
  audio.volume = 0
  audio.play().catch(() => undefined)
  fade(audio, weatherLevel(heard.sound, heard.indoors))
  weather = { ...heard, audio }
}

/** Plays what a thing done in a fight sounds like, this long from now: as it lands. */
export function playFight(kind: string, delayMs = 0): void {
  const choices = fightSounds[kind]
  if (!choices || volumes.effects === 0) return
  const sound = choices[Math.floor(Math.random() * choices.length)]
  window.setTimeout(() => {
    const audio = new Audio(url(sound.file))
    audio.volume = sound.volume * volumes.effects
    audio.play().catch(() => undefined)
  }, Math.max(0, delayMs))
}

// The songs for love-making: one, picked at random, plays once through behind a scene that has come to it.
const SONGS = Object.values(import.meta.glob<string>('../../assets/songs/*.mp3', { eager: true, import: 'default' }))
// A song is on the music volume, and under the sounds of the pose, which are on the effects volume.
const SONG_LEVEL = 0.6
const SONG_OUT_MS = 3000
let song: HTMLAudioElement | null = null

const songLevel = () => volumes.music * SONG_LEVEL

/** Puts the place's loop back as it should be, now that a song has started or stopped. */
function settleAmbience(): void {
  if (weather) fade(weather.audio, weatherLevel(weather.sound, weather.indoors))
  if (ambience) fade(ambience.audio, ambienceLevel(ambience.sound))
}

/**
 * Plays a song once through, in place of the place's loop: the one named, a file in the pack, or else one of the songs
 * picked at random. One already playing carries on. When it ends of itself the place's loop comes back.
 */
export function playSong(file?: string): void {
  if (song || (!file && SONGS.length === 0)) return
  const audio = new Audio(file ? url(file) : SONGS[Math.floor(Math.random() * SONGS.length)])
  audio.volume = 0
  audio.addEventListener('ended', () => {
    if (song !== audio) return
    song = null
    settleAmbience()
  })
  song = audio
  audio.play().catch(() => undefined)
  fade(audio, songLevel())
  settleAmbience()
}

/** Stops the song, if one is playing: it fades out over a few seconds rather than being cut off, and the place's loop comes back. */
export function stopSong(): void {
  if (!song) return
  const audio = song
  song = null
  fadeFor(audio, 0, SONG_OUT_MS, () => audio.pause())
  settleAmbience()
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
    lines = sounds?.lines ?? {}
    fightSounds = sounds?.fight ?? {}
  }, [sounds])
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('button:not(:disabled), [role="tab"]')) return
      window.clearTimeout(pendingClick)
      pendingClick = window.setTimeout(() => {
        pendingClick = undefined
        play('click')
      }, CLICK_WAIT_MS)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])
}
