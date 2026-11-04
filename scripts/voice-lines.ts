/**
 * Records the lines written ahead in their speakers' voices: the tours (the interface's, the day's, the courses', the
 * Undercroft's), the welcome and the cutscenes of orientation, the hellos and the rivalry of the Societies Fair, and the
 * handing over of the house. Each
 * line is built as the game shows it, from the same strings and the same cutscene reading, and recorded under its
 * `lineKey` as `sounds/voices/<speaker>/line-<key>.ogg`, listed in `sounds.json` (`lines`). A line rewritten since is
 * recorded again under its new key, and the old recording goes. Needs ELEVENLABS_API_KEY in `.env`, the speakers'
 * voices (`generate-voice.ts`), and ffmpeg. Not part of the app:
 *
 *   npx jiti scripts/voice-lines.ts --dry        what would be recorded, by whom, and who has no voice yet
 *   npx jiti scripts/voice-lines.ts [groups...]  records what is not yet recorded: tours, orientation, fair, house
 *   npx jiti scripts/voice-lines.ts --overwrite  records everything again
 *   npx jiti scripts/voice-lines.ts --list <speaker>   each of her lines with its key (the file is line-<key>.ogg)
 *   npx jiti scripts/voice-lines.ts --redo <keys...>   records these lines again
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadContentPack } from '../src/main/content/loader'
import { classChangeDeadline, cutsceneBeats, lineKey, PLAYER_TOKEN, spokenOf } from '../src/shared/game'
import { t, type MessageKey } from '../src/shared/i18n'
import type { Intro } from '../src/shared/model'

const ROOT = resolve('content', 'default')
const SOUNDS = join(ROOT, 'sounds.json')
const VOICES = join(ROOT, 'sounds', 'voices', 'voices.json')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const overwrite = args.includes('--overwrite')
const listing = args.includes('--list') ? args[args.indexOf('--list') + 1] : undefined
const redo = args.includes('--redo') ? args.slice(args.indexOf('--redo') + 1).filter((arg) => !arg.startsWith('--')) : []
const groups = listing || redo.length > 0 ? [] : args.filter((arg) => !arg.startsWith('--'))

// An accent the voice holds to only when it is asked to: a long line otherwise drifts back to the voice's plainest.
const ACCENT: Record<string, string> = {
  zelie: '[French accent]',
  yulia: '[Russian accent]',
  grushka: '[heavy Eastern European accent]',
  vespera: '[thick Southern drawl]'
}

const content = loadContentPack(ROOT)
const people = [...content.npcs, ...content.loveInterests]
interface Line { group: string; speakerId: string; text: string }
const lines: Line[] = []

// The tours, step by step, with what each step is told as the game tells it; his name is the token.
const tour = (group: string, speakerId: string | undefined, steps: [MessageKey, Record<string, unknown>?][]) => {
  if (!speakerId) return
  for (const [key, params] of steps) lines.push({ group, speakerId, text: t(key, (params ?? {}) as never) })
}
const welcomeId = content.orientation?.intro?.speakerId
tour('tours', welcomeId, [
  ['shell.interfaceTour.welcome', { name: PLAYER_TOKEN }], ['shell.interfaceTour.phone'], ['shell.interfaceTour.chats'], ['shell.interfaceTour.friends'],
  ['shell.interfaceTour.updates'], ['shell.interfaceTour.jobs'], ...(content.societies ? [['shell.interfaceTour.societies', { most: content.societies.maxJoined }] as [MessageKey, Record<string, unknown>]] : []),
  ['shell.interfaceTour.shop'], ['shell.interfaceTour.map'], ['shell.interfaceTour.mapPin'], ['shell.interfaceTour.bag'], ['shell.interfaceTour.bagGrid'],
  ['shell.interfaceTour.relics'], ['shell.interfaceTour.calendar'], ['shell.interfaceTour.calendarSheet'], ['shell.interfaceTour.help'], ['shell.interfaceTour.last']
])
tour('tours', welcomeId, [
  ['screens.dayView.tourChoices'], ['screens.dayView.tourPartners'], ['screens.dayView.tourStudy'], ['screens.dayView.tourStats'], ['screens.dayView.tourFocus'],
  ['screens.dayView.tourFreeText'], ['screens.dayView.tourEndDay'], ['screens.dayView.tourDone']
])
const config = content.coursework
const deadline = classChangeDeadline(content)
if (config) {
  tour('tours', 'tamsin', [
    ['screens.courses.tourWeek', { player: PLAYER_TOKEN, lectures: config.lecturesPerWeek, labHours: config.labHours, max: config.maxCourses }],
    ['screens.courses.tourSkill'], ['screens.courses.tourSearch'], ['screens.courses.tourHelp'],
    ...(deadline ? [['screens.courses.tourChange', { week: deadline.week, weekday: deadline.weekday }] as [MessageKey, Record<string, unknown>]] : []),
    ['screens.courses.tourDone', { player: PLAYER_TOKEN }]
  ])
}
const below = content.expedition
if (below) {
  tour('tours', below.guideId, [
    ['shell.belowTour.wayDown', { place: content.locations.find((l) => l.id === below.entryLocationId)?.name ?? t('shell.belowTour.bathhouse') }],
    ['shell.belowTour.facts'], ['shell.belowTour.depths'], ['shell.belowTour.party'], ['shell.belowTour.partyActions'], ['shell.belowTour.practice'],
    ['shell.belowTour.ourParty'], ['shell.belowTour.foes'], ['shell.belowTour.status'], ['shell.belowTour.energy'], ['shell.belowTour.surge'],
    ['shell.belowTour.menu'], ['shell.belowTour.way'], ['shell.belowTour.farewell']
  ])
}

// The cutscenes, read as the game reads them: whose each line is, and what of it is said.
const cutscene = (group: string, intro: Intro | undefined) => {
  if (!intro) return
  for (const { line } of cutsceneBeats(intro, people)) {
    if (line.action) continue
    lines.push({ group, speakerId: line.speakerId ?? intro.speakerId, text: line.text })
  }
}
cutscene('orientation', content.orientation?.intro)
for (const step of content.orientation?.steps ?? []) cutscene('orientation', step.cutscene)
const fair = content.societies?.fair
for (const hellos of Object.values(fair?.hellos ?? {})) {
  for (const hello of hellos) cutscene('fair', { speakerId: hello.cast[0], scenes: [{ locationId: '', castIds: hello.cast, lines: hello.lines }] })
}
cutscene('fair', fair?.rivalry?.intro)
// Each one's first words to him, as she says who she is.
for (const li of content.loveInterests) if (li.firstLine) lines.push({ group: 'first', speakerId: li.id, text: li.firstLine })
// The house, as it is handed over: the officer and the nanny.
cutscene('house', content.housing?.viewing?.cutscene)

async function record(voice: string, text: string, out: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const mp3 = out.replace(/\.ogg$/, '.mp3')
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-c:a', 'libvorbis', '-q:a', '5', out])
  rmSync(mp3)
}

const key = existsSync(resolve('.env')) ? readFileSync(resolve('.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim() : undefined

async function main() {
  const voices: Record<string, string> = existsSync(VOICES) ? JSON.parse(readFileSync(VOICES, 'utf8')) : {}
  const sounds = JSON.parse(readFileSync(SOUNDS, 'utf8'))
  const manifest: Record<string, string> = sounds.lines ?? {}
  // Each line once, whoever else says the same words.
  const wanted = new Map<string, Line & { spoken: string }>()
  for (const one of lines) {
    const spoken = spokenOf(one.text)
    if (spoken) wanted.set(lineKey(one.speakerId, one.text, PLAYER_TOKEN), { ...one, spoken })
  }
  if (listing) {
    for (const [k, one] of wanted) if (one.speakerId === listing) console.log(`${k} ${one.group}: ${one.spoken}`)
    return
  }
  const unvoiced = [...new Set([...wanted.values()].filter((one) => !voices[one.speakerId]).map((one) => one.speakerId))]
  if (dry) {
    const by = new Map<string, number>()
    for (const one of wanted.values()) by.set(`${one.group} ${one.speakerId}`, (by.get(`${one.group} ${one.speakerId}`) ?? 0) + 1)
    for (const [who, n] of [...by].sort()) console.log(`${who}: ${n}`)
    console.log(`${wanted.size} lines, ${[...wanted.keys()].filter((k) => manifest[k]).length} recorded; no voice yet: ${unvoiced.join(', ') || 'none'}`)
    for (const one of [...wanted.values()].slice(0, 6)) console.log(`  ${one.speakerId}: "${one.spoken}"`)
    return
  }
  if (!key) throw new Error('No ELEVENLABS_API_KEY in .env.')
  for (const [k, one] of wanted) {
    if (groups.length > 0 && !groups.includes(one.group)) continue
    const voice = voices[one.speakerId]
    if (!voice) continue
    const file = `sounds/voices/${one.speakerId}/line-${k}.ogg`
    if (redo.length > 0 ? !redo.includes(k) : manifest[k] && existsSync(join(ROOT, manifest[k])) && !overwrite) continue
    await record(voice, `${ACCENT[one.speakerId] ? `${ACCENT[one.speakerId]} ` : ''}${one.spoken}`, join(ROOT, file))
    manifest[k] = file
    // Kept as it goes, so that a failure partway loses nothing recorded.
    writeFileSync(SOUNDS, JSON.stringify({ ...sounds, lines: manifest }, null, 2) + '\n')
    console.log(`${one.speakerId}: ${one.spoken.slice(0, 70)}`)
  }
  // A line no longer written goes, with its recording.
  for (const k of Object.keys(manifest)) {
    if (wanted.has(k)) continue
    rmSync(join(ROOT, manifest[k]), { force: true })
    delete manifest[k]
  }
  writeFileSync(SOUNDS, JSON.stringify({ ...sounds, lines: manifest }, null, 2) + '\n')
  if (unvoiced.length > 0) console.log(`Not recorded, no voice yet: ${unvoiced.join(', ')}`)
}

void main()
