/**
 * Records the lines written ahead in their speakers' voices: the tours (the interface's, the day's, the courses', the
 * Undercroft's), the welcome and the cutscenes of orientation, the hellos and the rivalry of the Societies Fair, the
 * handing over of the house, each one's first line, and the story beats in every telling. Each line is built as the
 * game shows it, from the same strings and the same cutscene reading, and recorded under its `lineKey` as
 * `sounds/voices/<speaker>/<folder>/line-<key>.ogg`, the folder what it is part of (`interface-tour`, `societies-fair`,
 * `friend-beat`), listed in `sounds.json` (`lines`). One recorded elsewhere is moved into its folder. A line rewritten
 * since is recorded again under its new key, and the old recording goes. A story beat's line that says the child's
 * name or pronouns (`{child}`, `{they}`) is filled in only as it is read: its recording says "our baby" for the name,
 * and is found by the line as written. Needs ELEVENLABS_API_KEY in `.env`, the speakers'
 * voices (`generate-voice.ts`), and ffmpeg. Not part of the app:
 *
 *   npx jiti scripts/voice-lines.ts --dry        what would be recorded, by whom, and who has no voice yet
 *   npx jiti scripts/voice-lines.ts [groups...]  records what is not yet recorded: tours, orientation, fair, house, first, story
 *   npx jiti scripts/voice-lines.ts --overwrite  records everything again
 *   npx jiti scripts/voice-lines.ts --list <speaker>   each of her lines with its key (the file is line-<key>.ogg)
 *   npx jiti scripts/voice-lines.ts --redo <keys...>   records these lines again
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadContentPack } from '../src/main/content/loader'
import { childSpoken, classChangeDeadline, courseLoad, cutsceneBeats, lineKey, PLAYER_TOKEN, spokenOf } from '../src/shared/game'
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
/** A line to record: the group it is asked for by, the folder it is kept in, who says it and what. */
interface Line { group: string; folder: string; speakerId: string; text: string }
const lines: Line[] = []

// The tours, step by step, with what each step is told as the game tells it; his name is the token.
const tour = (folder: string, speakerId: string | undefined, steps: [MessageKey, Record<string, unknown>?][]) => {
  if (!speakerId) return
  for (const [key, params] of steps) lines.push({ group: 'tours', folder, speakerId, text: t(key, (params ?? {}) as never) })
}
const welcomeId = content.orientation?.intro?.speakerId
tour('interface-tour', welcomeId, [
  ['shell.interfaceTour.welcome', { name: PLAYER_TOKEN }], ['shell.interfaceTour.phone'], ['shell.interfaceTour.chats'], ['shell.interfaceTour.friends'],
  ['shell.interfaceTour.updates'], ['shell.interfaceTour.jobs'], ...(content.societies ? [['shell.interfaceTour.societies', { most: content.societies.maxJoined }] as [MessageKey, Record<string, unknown>]] : []),
  ['shell.interfaceTour.shop'], ['shell.interfaceTour.map'], ['shell.interfaceTour.mapPin'], ['shell.interfaceTour.bag'], ['shell.interfaceTour.bagGrid'],
  ['shell.interfaceTour.relics'], ['shell.interfaceTour.calendar'], ['shell.interfaceTour.calendarSheet'], ['shell.interfaceTour.help'], ['shell.interfaceTour.last']
])
tour('day-tour', welcomeId, [
  ['screens.dayView.tourChoices'], ['screens.dayView.tourPartners'], ['screens.dayView.tourStudy'], ['screens.dayView.tourStats'], ['screens.dayView.tourFocus'],
  ['screens.dayView.tourFreeText'], ['screens.dayView.tourEndDay'], ['screens.dayView.tourDone']
])
const config = content.coursework
const deadline = classChangeDeadline(content)
if (config) {
  tour('courses-tour', 'tamsin', [
    ['screens.courses.tourWeek', { player: PLAYER_TOKEN, lectures: config.lecturesPerWeek, labHours: config.labHours, ...courseLoad(content), range: courseLoad(content).min < courseLoad(content).max }],
    ['screens.courses.tourSkill'], ['screens.courses.tourSearch'], ['screens.courses.tourHelp'],
    ...(deadline ? [['screens.courses.tourChange', { week: deadline.week, weekday: deadline.weekday }] as [MessageKey, Record<string, unknown>]] : []),
    ['screens.courses.tourDone', { player: PLAYER_TOKEN }]
  ])
}
const below = content.expedition
if (below) {
  tour('undercroft-tour', below.guideId, [
    ['shell.belowTour.wayDown', { place: content.locations.find((l) => l.id === below.entryLocationId)?.name ?? t('shell.belowTour.bathhouse') }],
    ['shell.belowTour.facts'], ['shell.belowTour.depths'], ['shell.belowTour.party'], ['shell.belowTour.partyActions'], ['shell.belowTour.practice'],
    ['shell.belowTour.ourParty'], ['shell.belowTour.foes'], ['shell.belowTour.status'], ['shell.belowTour.energy'], ['shell.belowTour.surge'],
    ['shell.belowTour.menu'], ['shell.belowTour.way'], ['shell.belowTour.farewell']
  ])
}

// The cutscenes, read as the game reads them: whose each line is, and what of it is said.
// The words a story beat fills in with the child as it is read: a recording made ahead says "our baby" in its place.
const FILLED_IN = /\{(?:child|they|them|their)\}/
let filledIn = 0
const cutscene = (group: string, folder: string, intro: Intro | undefined) => {
  if (!intro) return
  for (const { line } of cutsceneBeats(intro, people)) {
    if (line.action) continue
    if (FILLED_IN.test(line.text)) filledIn++
    lines.push({ group, folder, speakerId: line.speakerId ?? intro.speakerId, text: line.text })
  }
}
cutscene('orientation', 'orientation', content.orientation?.intro)
for (const step of content.orientation?.steps ?? []) cutscene('orientation', 'orientation', step.cutscene)
const fair = content.societies?.fair
for (const hellos of Object.values(fair?.hellos ?? {})) {
  for (const hello of hellos) cutscene('fair', 'societies-fair', { speakerId: hello.cast[0], scenes: [{ locationId: '', castIds: hello.cast, lines: hello.lines }] })
}
cutscene('fair', 'societies-fair', fair?.rivalry?.intro)
// Each one's first words to him, as she says who she is.
for (const li of content.loveInterests) if (li.firstLine) lines.push({ group: 'first', folder: 'first-line', speakerId: li.id, text: li.firstLine })
// The house, as it is handed over: the officer and the nanny.
cutscene('house', 'house-handover', content.housing?.viewing?.cutscene)
// Each one's story, a folder to a beat: every telling of it, since which is read depends on the game.
for (const beats of Object.values(content.story)) {
  for (const beat of beats) {
    for (const telling of [beat, beat.ifIntimate, beat.ifUnprotected]) cutscene('story', `${beat.stage}-beat`, telling?.cutscene)
  }
}

async function record(voice: string, text: string, out: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const mp3 = out.replace(/\.ogg$/, '.mp3')
  mkdirSync(dirname(out), { recursive: true })
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
    const spoken = spokenOf(childSpoken(one.text))
    if (spoken) wanted.set(lineKey(one.speakerId, one.text, PLAYER_TOKEN), { ...one, spoken })
  }
  if (listing) {
    for (const [k, one] of wanted) if (one.speakerId === listing) console.log(`${k} ${one.group}: ${one.spoken}`)
    return
  }
  const unvoiced = [...new Set([...wanted.values()].filter((one) => !voices[one.speakerId]).map((one) => one.speakerId))]
  if (dry) {
    const by = new Map<string, number>()
    for (const one of wanted.values()) by.set(one.group, (by.get(one.group) ?? 0) + 1)
    for (const [group, n] of [...by].sort()) console.log(`${group}: ${n}`)
    const recorded = [...wanted.keys()].filter((k) => manifest[k])
    console.log(`${wanted.size} lines, ${recorded.length} recorded, ${[...wanted.values()].filter((one) => !manifest[lineKey(one.speakerId, one.text, PLAYER_TOKEN)]).reduce((sum, one) => sum + one.spoken.length, 0)} characters to record; ${filledIn} saying "our baby" for the child; no voice yet: ${unvoiced.join(', ') || 'none'}`)
    for (const one of [...wanted.values()].slice(0, 6)) console.log(`  ${one.speakerId}: "${one.spoken}"`)
    return
  }
  // One recorded before it had a folder, or in another, is moved there: nothing is recorded twice for it.
  for (const [k, one] of wanted) {
    const file = `sounds/voices/${one.speakerId}/${one.folder}/line-${k}.ogg`
    if (!manifest[k] || manifest[k] === file || !existsSync(join(ROOT, manifest[k]))) continue
    mkdirSync(dirname(join(ROOT, file)), { recursive: true })
    renameSync(join(ROOT, manifest[k]), join(ROOT, file))
    manifest[k] = file
  }
  writeFileSync(SOUNDS, JSON.stringify({ ...sounds, lines: manifest }, null, 2) + '\n')
  if (!key) throw new Error('No ELEVENLABS_API_KEY in .env.')
  for (const [k, one] of wanted) {
    if (groups.length > 0 && !groups.includes(one.group)) continue
    const voice = voices[one.speakerId]
    if (!voice) continue
    const file = `sounds/voices/${one.speakerId}/${one.folder}/line-${k}.ogg`
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
