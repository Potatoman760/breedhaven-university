/**
 * Draws the Undercroft on the ComfyUI in the app's settings: a background for every depth, a picture of
 * everything met there and one of every relic, each from the `appearance` written for it in `expedition.json`, and puts each in that file as
 * it is made. An enemy is drawn on a plain white card, which is then taken out from behind it, so that it stands on
 * the field as the party's sprites do. Not part of the app: run it from the project folder with `npm run below`, and
 * anything after `--` narrows it:
 *
 *   npm run below                          everything that has no picture yet
 *   npm run below -- wild-slime "the old drains"   only these: an enemy by its id, a depth by its name
 *   npm run below -- --depths              only the backgrounds; --enemies for only what is met; --relics for only those
 *   npm run below -- --overwrite           draw them again even where there is one already
 *   npm run below -- --dry                 print the prompts, and make nothing
 *
 * It can be stopped and run again: whatever has its picture is passed over.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { framingFor, sizeFor } from '../src/shared/comfy'
import { ComfyStore, generateArt } from '../src/main/comfy/studio'
import { ExpeditionConfigSchema } from '../src/shared/model'
import { PACK, cutOut, minutes, settingsFile } from './lib/pictures'

const FILE = join(PACK, 'expedition.json')
// The folder its pictures are filed under, beside those of the places above.
const SUBJECT = 'undercroft'
// Two in a row is not bad luck: ComfyUI is down, or refusing the workflow, and the rest would go the same way.
const GIVE_UP_AFTER = 2
// An enemy is drawn upright and a little taller than wide: nearer a figure than a landscape.
const ENEMY_SIZE = { width: 1088, height: 1344 }
const ENEMY_FRAMING = 'a single creature, whole body in frame, centered, standing, no people, no text\n\nplain white background'
// A relic is drawn big and made small: asked for at the size it is shown, a picture is mush. One thing, plainly, so that it still reads when shrunk.
const RELIC_SIZE = { width: 1024, height: 1024 }
const RELIC_SHOWN = 256
const RELIC_FRAMING = 'a single object, centered, filling the frame, game inventory icon, thick clean outline, simple shapes, no people, no hands, no text\n\nplain white background'
const DEPTH_LEAD = 'Interior, deep underground beneath an old university, a place of raw magic.'

const read = () => JSON.parse(readFileSync(FILE, 'utf8')) as { enemies: { id: string; image?: string }[]; depths: { name: string; image?: string; relic: { id: string; image?: string } }[] }
const write = (value: unknown) => writeFileSync(FILE, `${JSON.stringify(value, null, 2)}\n`)

interface Job {
  label: string
  kind: 'depth' | 'enemy' | 'relic'
  /** A depth's name, or the id of an enemy or a relic. */
  key: string
  has: string | undefined
  appearance: string
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const unknown = flags.filter((flag) => !['--dry', '--overwrite', '--depths', '--enemies', '--relics'].includes(flag))
  if (unknown.length > 0) throw new Error(`There is no ${unknown.join(', ')}. Use --dry, --overwrite, --depths, --enemies or --relics.`)
  const [dry, overwrite] = [flags.includes('--dry'), flags.includes('--overwrite')]
  const only = args.filter((arg) => !arg.startsWith('--')).map((arg) => arg.toLowerCase())

  const config = ExpeditionConfigSchema.parse(read())
  // With none of the three named, all of them; with any, only those named.
  const kinds = ['--depths', '--enemies', '--relics'].filter((flag) => flags.includes(flag))
  const wanted = (flag: string) => kinds.length === 0 || kinds.includes(flag)
  const jobs: Job[] = [
    ...(wanted('--depths') ? config.depths.map((depth): Job => ({ label: depth.name, kind: 'depth', key: depth.name, has: depth.image, appearance: depth.appearance })) : []),
    ...(wanted('--enemies') ? config.enemies.map((enemy): Job => ({ label: enemy.name, kind: 'enemy', key: enemy.id, has: enemy.image, appearance: enemy.appearance })) : []),
    ...(wanted('--relics') ? config.depths.map(({ relic }): Job => ({ label: relic.name, kind: 'relic', key: relic.id, has: relic.image, appearance: relic.appearance })) : [])
  ]
  const missing = only.filter((name) => !jobs.some((job) => job.key.toLowerCase() === name))
  if (missing.length > 0) throw new Error(`Nothing below is called: ${missing.join(', ')}`)
  const todo = jobs.filter((job) => (only.length === 0 || only.includes(job.key.toLowerCase())) && (overwrite || !job.has))
  const undescribed = todo.filter((job) => job.appearance.trim() === '')
  if (undescribed.length > 0) throw new Error(`No appearance is written in expedition.json for: ${undescribed.map((job) => job.label).join(', ')}`)

  const settingsPath = settingsFile()
  if (!existsSync(settingsPath)) throw new Error(`No ComfyUI settings at ${settingsPath}. Set ComfyUI up in the app first.`)
  const readSettings = () => new ComfyStore(settingsPath, PACK).get()
  const promptOf = (job: Job) => (job.kind === 'depth' ? `${DEPTH_LEAD}\n\n${job.appearance}\n\n${framingFor(readSettings(), 'background')}` : `${job.appearance}\n\n${job.kind === 'relic' ? RELIC_FRAMING : ENEMY_FRAMING}`)

  console.log(`ComfyUI at ${readSettings().baseUrl}. ${todo.length} to make of ${jobs.length}${overwrite ? ', replacing those there are' : ''}.`)
  if (dry) {
    for (const job of todo) console.log(`\n== ${job.label} (${job.kind})\n${promptOf(job)}`)
    return
  }
  if (todo.length === 0) return

  // Ctrl+C cancels the picture being made and stops; a second one stops at once.
  const cancel = new AbortController()
  process.on('SIGINT', () => {
    if (cancel.signal.aborted) process.exit(130)
    console.log('\nStopping: cancelling the picture being made. Run again to carry on. (Ctrl+C again to quit at once.)')
    cancel.abort()
  })

  const started = Date.now()
  let failedInARow = 0
  for (const [i, job] of todo.entries()) {
    if (cancel.signal.aborted) break
    const began = Date.now()
    process.stdout.write(`[${i + 1}/${todo.length}] ${job.label}... `)
    const now = readSettings()
    const size = job.kind === 'depth' ? sizeFor(now, 'background') : job.kind === 'relic' ? RELIC_SIZE : ENEMY_SIZE
    const result = await generateArt(
      now,
      PACK,
      PACK,
      { kind: job.kind === 'depth' ? 'background' : 'sprite', subjectId: SUBJECT, name: job.kind === 'relic' ? `relic-${job.key}` : job.key, workflow: '', positive: promptOf(job), negative: '', ...size },
      cancel.signal,
      ''
    )
    if (cancel.signal.aborted) {
      console.log('cancelled.')
      break
    }
    if (!result.ok || !result.path) {
      console.log(`failed: ${result.message}`)
      if (++failedInARow >= GIVE_UP_AFTER) {
        console.log(`${GIVE_UP_AFTER} failures in a row: stopping. Fix what is wrong and run again.`)
        process.exitCode = 1
        break
      }
      continue
    }
    failedInARow = 0

    let made = { path: result.path, note: '' }
    if (job.kind !== 'depth') {
      try {
        made = cutOut(result.path, job.kind === 'relic' ? RELIC_SHOWN : undefined)
      } catch (cause) {
        made = { path: result.path, note: `left on its card: ${(cause as Error).message}` }
      }
    }
    // Put in the file as it is now, so that nothing changed in it meanwhile is undone.
    const file = read()
    const entry = job.kind === 'depth' ? file.depths.find((depth) => depth.name === job.key) : job.kind === 'relic' ? file.depths.find((depth) => depth.relic.id === job.key)?.relic : file.enemies.find((enemy) => enemy.id === job.key)
    if (!entry) {
      console.log(`made (${made.path}), but it is no longer in expedition.json.`)
      continue
    }
    const replaced = entry.image
    entry.image = made.path
    write(file)
    if (replaced && replaced !== made.path) rmSync(join(PACK, replaced), { force: true })
    const left = todo.length - i - 1
    console.log(`done in ${minutes(Date.now() - began)}: ${made.path}${made.note ? ` (${made.note})` : ''}${left > 0 ? ` (about ${minutes(((Date.now() - started) / (i + 1)) * left)} to go)` : ''}`)
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
