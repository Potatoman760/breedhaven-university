/**
 * Draws a picture of every item on the ComfyUI in the app's settings, each from the `appearance` written for it in
 * `items.json`, and puts each in that file as it is made. A picture is drawn big on a plain white card, the card is
 * taken out from behind it, and it is made small: asked for at the size it is shown, it would be mush. Not part of
 * the app: run it from the project folder with `npm run items`, and anything after `--` narrows it:
 *
 *   npm run items                      every item that has no picture yet
 *   npm run items -- posy grimoire     only these, by id
 *   npm run items -- --overwrite       draw them again even where there is one already
 *   npm run items -- --dry             print the prompts, and make nothing
 *
 * It can be stopped and run again: whatever has its picture is passed over.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ComfyStore, generateArt } from '../src/main/comfy/studio'
import { PACK, cutOut, minutes, settingsFile } from './lib/pictures'

const FILE = join(PACK, 'items.json')
// The folder the pictures are filed under.
const SUBJECT = 'items'
// Two in a row is not bad luck: ComfyUI is down, or refusing the workflow, and the rest would go the same way.
const GIVE_UP_AFTER = 2
const SIZE = { width: 1024, height: 1024 }
// Twice the square it is shown in, so that it is sharp on a dense screen.
const SHOWN = 256
const FRAMING = 'a single object, shown whole, centered, filling the frame, game inventory icon, thick clean outline, simple shapes, no people, no hands, no text\n\nplain white background'

interface Written {
  id: string
  name: string
  appearance?: string
  image?: string
}

/** The file as it is written, and the line endings it is written with, so that a picture put in it changes that line and nothing else. */
function read(): { items: Written[]; eol: string } {
  const raw = readFileSync(FILE, 'utf8')
  return { items: JSON.parse(raw) as Written[], eol: raw.includes('\r\n') ? '\r\n' : '\n' }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const unknown = flags.filter((flag) => !['--dry', '--overwrite'].includes(flag))
  if (unknown.length > 0) throw new Error(`There is no ${unknown.join(', ')}. Use --dry or --overwrite.`)
  const [dry, overwrite] = [flags.includes('--dry'), flags.includes('--overwrite')]
  const only = args.filter((arg) => !arg.startsWith('--')).map((arg) => arg.toLowerCase())

  const all = read().items
  const missing = only.filter((id) => !all.some((item) => item.id === id))
  if (missing.length > 0) throw new Error(`There is no item called: ${missing.join(', ')}`)
  const todo = all.filter((item) => (only.length === 0 || only.includes(item.id)) && (overwrite || !item.image))
  const undescribed = todo.filter((item) => !item.appearance?.trim())
  if (undescribed.length > 0) throw new Error(`No appearance is written in items.json for: ${undescribed.map((item) => item.id).join(', ')}`)

  const settingsPath = settingsFile()
  if (!existsSync(settingsPath)) throw new Error(`No ComfyUI settings at ${settingsPath}. Set ComfyUI up in the app first.`)
  const readSettings = () => new ComfyStore(settingsPath, PACK).get()
  const promptOf = (item: Written) => `${item.appearance}\n\n${FRAMING}`

  console.log(`ComfyUI at ${readSettings().baseUrl}. ${todo.length} to make of ${all.length}${overwrite ? ', replacing those there are' : ''}.`)
  if (dry) {
    for (const item of todo) console.log(`\n== ${item.name} (${item.id})\n${promptOf(item)}`)
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
  for (const [i, item] of todo.entries()) {
    if (cancel.signal.aborted) break
    const began = Date.now()
    process.stdout.write(`[${i + 1}/${todo.length}] ${item.name}... `)
    const result = await generateArt(readSettings(), PACK, PACK, { kind: 'sprite', subjectId: SUBJECT, name: item.id, workflow: '', positive: promptOf(item), negative: '', ...SIZE }, cancel.signal, '')
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
    try {
      made = cutOut(result.path, SHOWN)
    } catch (cause) {
      made = { path: result.path, note: `left on its card: ${(cause as Error).message}` }
    }
    // Put in the file as it is now, so that nothing changed in it meanwhile is undone.
    const file = read()
    const entry = file.items.find((one) => one.id === item.id)
    if (!entry) {
      console.log(`made (${made.path}), but it is no longer in items.json.`)
      continue
    }
    const replaced = entry.image
    entry.image = made.path
    writeFileSync(FILE, `${JSON.stringify(file.items, null, 2)}\n`.replaceAll('\n', file.eol))
    if (replaced && replaced !== made.path) rmSync(join(PACK, replaced), { force: true })
    const left = todo.length - i - 1
    console.log(`done in ${minutes(Date.now() - began)}: ${made.path}${made.note ? ` (${made.note})` : ''}${left > 0 ? ` (about ${minutes(((Date.now() - started) / (i + 1)) * left)} to go)` : ''}`)
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
