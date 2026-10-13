/**
 * Makes the birth picture of every love interest, one at a time, on the ComfyUI in the app's settings, and puts each
 * on her as it is made: the same picture the Birth slot of the editor's Family tab draws, from the same prompt, size
 * and workflow. Not part of the app: run it from the project folder with `npm run births`, and anything after `--`
 * narrows it:
 *
 *   npm run births                               everyone who has none yet
 *   npm run births -- tamsin wren                only these
 *   npm run births -- --except vespera,yelena    everyone but these
 *   npm run births -- --overwrite                draw them again even where there is one already
 *   npm run births -- --dry                      say what it would make, and make nothing
 *
 * It can be stopped and run again: one who has her picture is passed over. The pictures are PNGs, as everything
 * ComfyUI draws is; Optimize on her Media tab makes a WebP of it.
 *
 * While it runs, do not save these characters from the editor: an editor opened before a picture was put on her still
 * has her without it, and saving her from there takes it off again.
 */
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { birthPrompt, framingFor, sizeFor } from '../src/shared/comfy'
import { loadBase, saveLoveInterest } from '../src/main/content/addons'
import { ComfyStore, generateArt } from '../src/main/comfy/studio'

const PACK = resolve('content', 'default')
// Two in a row is not bad luck: ComfyUI is down, or refusing the workflow, and the rest would go the same way.
const GIVE_UP_AFTER = 2

/** Where the app keeps its settings: the user data folder Electron gives an app of this name. */
function settingsFile(): string {
  const name = 'breedhaven-dating-sim'
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
  return join(base, name, 'comfy.json')
}

const minutes = (ms: number) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`

function readArgs(argv: string[]): { dry: boolean; overwrite: boolean; only: string[]; except: string[] } {
  const only: string[] = []
  const except: string[] = []
  let dry = false
  let overwrite = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [flag, inline] = arg.split('=', 2)
    if (flag === '--dry') dry = true
    else if (flag === '--overwrite') overwrite = true
    else if (flag === '--except') {
      const value = inline ?? argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error('--except needs a value: --except a,b')
      except.push(...value.split(',').map((one) => one.trim().toLowerCase()).filter(Boolean))
    } else if (arg.startsWith('--')) throw new Error(`There is no ${arg}. Use --dry, --overwrite or --except.`)
    else only.push(arg.toLowerCase())
  }
  return { dry, overwrite, only, except }
}

async function main(): Promise<void> {
  const settingsPath = settingsFile()
  if (!existsSync(settingsPath)) throw new Error(`No ComfyUI settings at ${settingsPath}. Set ComfyUI up in the app first.`)
  // Read afresh for every picture, so that a prompt or a size changed in the app while this runs is used from the next one on.
  const readSettings = () => new ComfyStore(settingsPath, PACK).get()
  const settings = readSettings()

  const { dry, overwrite, only, except } = readArgs(process.argv.slice(2))
  const all = loadBase(PACK).content.loveInterests.filter((li) => li.kind !== 'npc')
  const unknown = [...only, ...except].filter((id) => !all.some((li) => li.id === id))
  if (unknown.length > 0) throw new Error(`No love interest called: ${unknown.join(', ')}`)
  const everyone = all.filter((li) => (only.length === 0 || only.includes(li.id)) && !except.includes(li.id))
  // With --overwrite, the ones this run has drawn are not known to a later one, so a stopped overwrite starts over.
  const todo = everyone.filter((li) => overwrite || !li.birthPicture)

  const size = sizeFor(settings, 'birth')
  console.log(`ComfyUI at ${settings.baseUrl}, birth pictures of ${size.width}×${size.height}${overwrite ? ', replacing those there are' : ''}.`)
  console.log(`${todo.length} to make for ${everyone.length} love interests.`)
  if (todo.length === 0) return
  if (dry) {
    for (const li of todo) console.log(`  ${li.name}${li.birthPicture ? `, in place of ${li.birthPicture}` : ''}`)
    return
  }

  // Ctrl+C cancels the picture being made and stops; a second one stops at once.
  const cancel = new AbortController()
  process.on('SIGINT', () => {
    if (cancel.signal.aborted) process.exit(130)
    console.log('\nStopping: cancelling the picture being made. Run again to carry on. (Ctrl+C again to quit at once.)')
    cancel.abort()
  })

  const started = Date.now()
  let failedInARow = 0
  for (const [i, { id, name }] of todo.entries()) {
    if (cancel.signal.aborted) break
    const began = Date.now()
    process.stdout.write(`[${i + 1}/${todo.length}] ${name}... `)
    const now = readSettings()
    // Her, as the game's files have her now: read afresh, so that nothing saved meanwhile is undone.
    const before = loadBase(PACK).content.loveInterests.find((one) => one.id === id)
    if (!before) {
      console.log('she is no longer in the game.')
      continue
    }
    const { width, height } = sizeFor(now, 'birth')
    const result = await generateArt(
      now,
      PACK,
      PACK,
      { kind: 'birth', subjectId: id, name: 'birth', workflow: '', positive: birthPrompt(before, framingFor(now, 'birth')), negative: '', width, height, seed: before.imageSeed },
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

    // Put on her as she is now, and saved the way the editor saves her.
    const { content } = loadBase(PACK)
    const she = content.loveInterests.find((one) => one.id === id)
    if (!she) {
      console.log('made, but she is no longer in the game.')
      continue
    }
    const replaced = she.birthPicture
    const issues = saveLoveInterest(PACK, content, { ...she, birthPicture: result.path })
    if (issues.length > 0) {
      console.log(`made, but she could not be saved: ${issues.join('; ')}`)
      continue
    }
    // The picture it replaced goes, so that the game does not carry it.
    if (replaced && replaced !== result.path) rmSync(join(PACK, replaced), { force: true })
    const left = todo.length - i - 1
    const each = (Date.now() - started) / (i + 1)
    console.log(`done in ${minutes(Date.now() - began)}: ${result.path}${left > 0 ? ` (about ${minutes(each * left)} to go)` : ''}`)
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
