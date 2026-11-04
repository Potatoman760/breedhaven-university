/**
 * The interface's cues from ElevenLabs, as one set: takes of each into `out/cue-takes/` to listen to, and the chosen
 * take put into the pack at the file its cue plays, trimmed of silence, brought to one peak level, and credited.
 * Needs ELEVENLABS_API_KEY in `.env`, and ffmpeg. Not part of the app:
 *
 *   npx jiti scripts/generate-cues.ts [cues...]           two takes of each cue (of those named) not yet made
 *   npx jiti scripts/generate-cues.ts --again <cues...>   two more takes of these, after changing their prompt
 *   npx jiti scripts/generate-cues.ts --use click=1 open=2 ...   puts these takes into the pack
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CUES, type Cue } from '../src/shared/model'

const ROOT = resolve('content', 'default')
const SOUNDS = join(ROOT, 'sounds.json')
const TAKES = resolve('out', 'cue-takes')
const CREDIT = 'Generated with ElevenLabs sound effects'
// Every cue peaks here, so that the volumes in sounds.json mix them and nothing else does.
const PEAK_DB = -3

const key = readFileSync(resolve('.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) throw new Error('No ELEVENLABS_API_KEY in .env.')

// One palette throughout: the game's interface is gilt wood, brass, parchment and glass; the phone is a modern
// smartphone, its tones crisp and glassy as an iPhone's. Every cue is short, clean, dry (no reverb tail), one sound.
const GAME = 'Clean, short user-interface sound for a game, one single sound, dry with no reverb, no music, no voice, warm and polished.'
const PHONE = 'Clean, short modern smartphone user-interface sound in the style of an iPhone, one single sound, crisp, glassy, dry, no music, no voice.'
const PROMPTS: Record<Cue, { prompt: string; seconds: number }> = {
  click: { prompt: `A very short soft button click: a muted wooden tick with a touch of felt, subtle. ${GAME}`, seconds: 0.5 },
  open: { prompt: `A panel opening: a quick soft parchment flick and a small warm glassy tone rising. ${GAME}`, seconds: 0.7 },
  close: { prompt: `A panel closing: a quick soft parchment flick and a small warm glassy tone falling, ending in a gentle wooden tap. ${GAME}`, seconds: 0.7 },
  phoneOn: { prompt: `Phone unlocking: a crisp short bright two-note glassy chime rising. ${PHONE}`, seconds: 0.7 },
  phoneOff: { prompt: `Phone locking: a crisp short mechanical click with a tiny low glassy tone falling. ${PHONE}`, seconds: 0.6 },
  bagOpen: { prompt: `A leather satchel opening: a brass buckle unclasping and the flap lifting with a soft cloth rustle. ${GAME}`, seconds: 1.0 },
  bagClose: { prompt: `A leather satchel closing: the flap dropping with a soft cloth rustle and a brass buckle clasping shut. ${GAME}`, seconds: 1.0 },
  cards: { prompt: `A single playing card sliding across felt and landing. ${GAME}`, seconds: 0.6 },
  chips: { prompt: `A small stack of poker chips dropped onto felt with a clink. ${GAME}`, seconds: 0.8 },
  build: { prompt: `Building a room of a house, a short burst of carpentry: a handsaw cutting through a plank, hammer taps on wood over it, and a solid wooden beam settling into place at the end. ${GAME}`, seconds: 2.5 },
  notice: { prompt: `A gentle notification: a single soft warm glass bell with a brief sparkle. ${PHONE}`, seconds: 1.0 },
  message: { prompt: `A text message arriving: a short bright glassy three-note ping, descending then rising. ${PHONE}`, seconds: 1.0 },
  coins: { prompt: `A few gold coins dropped into a leather pouch, soft metallic clinks. ${GAME}`, seconds: 0.9 },
  door: { prompt: `A wooden house door opening: a brass latch lifting and the door swinging open briefly. ${GAME}`, seconds: 1.2 },
  skill: { prompt: `Learning a new skill: a short bright jingle of three ascending bell notes with a soft chime at the end, celebratory. ${GAME}`, seconds: 1.5 },
  bond: { prompt: `A relationship beginning: a warm short harp glissando rising into a soft glowing chord. ${GAME}`, seconds: 1.8 },
  pregnancy: { prompt: `Tender news: a gentle music-box phrase of four soft notes, wondering and warm. ${GAME}`, seconds: 2.0 },
  birth: { prompt: `A birth: a bright joyful jingle, small bells and a harp flourish rising, warm and happy. ${GAME}`, seconds: 2.0 },
  relic: { prompt: `An arcane relic activating: a shimmering magical chord with a low pulse underneath, fading quickly. ${GAME}`, seconds: 1.5 },
  stamp: { prompt: `A rubber stamp pressed firmly onto paper with a solid thump. ${GAME}`, seconds: 0.6 },
  sent: { prompt: `A message being sent: a very soft quick airy swoosh with a tiny tick at the end. ${GAME}`, seconds: 0.5 },
  reply: { prompt: `A reply arriving in a story: a soft warm single glass tone with a gentle shimmer, intimate and quiet. ${GAME}`, seconds: 0.8 },
  achievement: { prompt: 'A short triumphant game achievement fanfare: a bright brass and bell flourish rising to a sparkling chord, celebratory, about two seconds, polished and warm.', seconds: 2.2 },
  victory: { prompt: 'A short victory sting after a dungeon fight: a bold rising brass and drum flourish ending on a bright chord, about two seconds.', seconds: 2.0 },
  defeat: { prompt: 'A short defeat sting after a lost dungeon fight: a low descending brass phrase with a soft drum, somber, about two seconds.', seconds: 2.0 },
  // Made of two takes crossfaded, crickets into a bell and birdsong: the model will not put one after the other itself.
  dawn: { prompt: 'Dawn: a single soft distant church bell, then cheerful morning birdsong rising, warm and bright, no crickets.', seconds: 4 },
  descend: { prompt: `Descending stone stairs into a dungeon: a few echoing footsteps and a heavy iron gate closing behind. ${GAME}`, seconds: 2.0 }
}

const isCue = (id: string): id is Cue => (CUES as readonly string[]).includes(id)

async function take(cue: Cue, n: number): Promise<void> {
  const { prompt, seconds } = PROMPTS[cue]
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, model_id: 'eleven_text_to_sound_v2', duration_seconds: seconds, loop: false, prompt_influence: 0.6 })
  })
  if (!res.ok) throw new Error(`${cue}: ${res.status} ${await res.text()}`)
  writeFileSync(join(TAKES, `${cue}-${n}.mp3`), Buffer.from(await res.arrayBuffer()))
  console.log(`${cue}-${n}`)
}

/** The takes there are of a cue, by number. */
const takesOf = (cue: Cue): number[] =>
  readdirSync(TAKES)
    .map((file) => new RegExp(`^${cue}-(\\d+)\\.mp3$`).exec(file)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)

/** Puts a take in as its cue: silence cut from either end, the peak brought to one level, as ogg where the cue's file is. */
function use(cue: Cue, n: number, sounds: { cues: Record<string, { file: string; credit: string }> }): void {
  const src = join(TAKES, `${cue}-${n}.mp3`)
  if (!existsSync(src)) throw new Error(`No take ${cue}-${n}.`)
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-65dB,areverse'
  // ffmpeg reports on stderr.
  const measured = spawnSync('ffmpeg', ['-i', src, '-af', `${trim},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const peak = /max_volume: ([-\d.]+) dB/.exec(measured)?.[1]
  if (peak === undefined) throw new Error(`${cue}: could not measure take ${n}.`)
  const out = join(ROOT, sounds.cues[cue].file)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `${trim},volume=${(PEAK_DB - Number(peak)).toFixed(1)}dB`, '-c:a', 'libvorbis', '-q:a', '6', out])
  sounds.cues[cue].credit = CREDIT
  console.log(`${cue}: ${sounds.cues[cue].file} from take ${n}`)
}

async function main() {
  const args = process.argv.slice(2)
  mkdirSync(TAKES, { recursive: true })
  if (args[0] === '--use') {
    const sounds = JSON.parse(readFileSync(SOUNDS, 'utf8'))
    for (const pick of args.slice(1)) {
      const [cue, n] = pick.split('=')
      if (!isCue(cue) || !n) throw new Error(`"${pick}" is not cue=take.`)
      use(cue, Number(n), sounds)
    }
    writeFileSync(SOUNDS, JSON.stringify(sounds, null, 2) + '\n')
    return
  }
  const again = args[0] === '--again'
  const only = (again ? args.slice(1) : args).filter(isCue)
  for (const cue of CUES) {
    if (only.length > 0 && !only.includes(cue)) continue
    const have = takesOf(cue)
    if (have.length > 0 && !again) continue
    const from = Math.max(0, ...have) + 1
    for (const n of [from, from + 1]) await take(cue, n)
  }
}

void main()
