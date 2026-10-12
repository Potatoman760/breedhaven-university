/**
 * Makes the looping clips of the standard sex-acts for every love interest, one at a time, on the ComfyUI in the app's
 * settings, and puts each on her as it is made. Left to itself it makes six (blowjob, missionary, doggy, cowgirl, creampie, facial).
 * Not part of the app: run it from the project folder with `npm run clips`, and anything after `--`
 * chooses what it does:
 *
 *   npm run clips -- anwen daphne               only these love interests
 *   npm run clips -- --except vespera,yelena    everyone but these
 *   npm run clips -- --sex-act cowgirl          only this sex-act (or several: --sex-act cowgirl,doggy); any standard one
 *   npm run clips -- --seconds 4                all of them this long, in place of 10s (4s for creampie and facial)
 *   npm run clips -- --overwrite                make them again even where there is a clip already
 *   npm run clips -- --dry                      say what it would make, and make nothing
 *
 * So `npm run clips -- --sex-act cowgirl --except vespera,yelena --overwrite` makes every cowgirl clip again but those two.
 *
 * It does what the editor's clip page does, with the same code: the sex-act's picture is the first frame and the last,
 * so every clip loops, the prompt is the one kept in the app for the sex-act, and the length and workflow are the app's, read again before
 * each clip so that a change saved in the app is used from the next one on. The clip is filed
 * beside the picture and the character is saved into the game's own files, as the editor does when it is run from
 * source.
 *
 * It can be stopped at any time with Ctrl+C, which cancels the clip being made. Run again, it carries on: a sex-act
 * that already has a clip is left alone, and one that failed is tried again. What became of each is written to
 * scripts/clip-batch.progress.json as it goes. With --overwrite, the same command run again carries on as well: a
 * clip made since that overwrite began is not made a third time. The marker of it, scripts/clip-batch.overwrite.json,
 * goes once all of them have been made, and the same command after that starts a new round. The clip a new one
 * replaces is deleted, unless another sex-act of hers still uses it.
 *
 * While it runs, do not save these characters from the editor: an editor opened before a clip was put on her still
 * has her without it, and saving her from there takes it off again. Close the editor, or reopen her once this is done.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { MAX_CLIP_SECONDS, videoPromptFor } from '../src/shared/comfy'
import { NSFW_POSES, type Animation, type LoveInterest } from '../src/shared/model'
import { loadBase, saveLoveInterest } from '../src/main/content/addons'
import { ComfyStore, generateClip } from '../src/main/comfy/studio'

// What is made when no sex-act is named.
const POSES = ['blowjob', 'missionary', 'doggy', 'cowgirl', 'creampie', 'facial'] as const
// How long a clip is unless --seconds says: these two are a single moment, the rest a rhythm worth watching.
const SECONDS = 10
const SHORT = { seconds: 4, poses: ['creampie', 'facial'] }
const secondsFor = (poseId: string, asked?: number): number => asked ?? (SHORT.poses.includes(poseId) ? SHORT.seconds : SECONDS)
// Any of these can be named.
const ALL_POSES = NSFW_POSES.map((pose) => pose.id as string)
const PACK = resolve('content', 'default')
const PROGRESS = resolve('scripts', 'clip-batch.progress.json')
const OVERWRITE = resolve('scripts', 'clip-batch.overwrite.json')
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

interface Entry {
  status: 'done' | 'failed' | 'skipped'
  message?: string
  clip?: string
  seed?: number
  at: string
}
type Progress = Record<string, Entry>

function readProgress(): Progress {
  try {
    return JSON.parse(readFileSync(PROGRESS, 'utf8')) as Progress
  } catch {
    return {}
  }
}

const progress = readProgress()
function note(key: string, entry: Omit<Entry, 'at'>): void {
  progress[key] = { ...entry, at: new Date().toISOString() }
  writeFileSync(PROGRESS, `${JSON.stringify(progress, null, 2)}\n`)
}

const minutes = (ms: number) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`

/** What the command line asks for. */
interface Args {
  dry: boolean
  overwrite: boolean
  only: string[]
  except: string[]
  poses: string[]
  /** How long each clip runs, when it is not the app's length. */
  seconds: number | undefined
}

function readArgs(argv: string[]): Args {
  const lists: Record<'except' | 'pose', string[]> = { except: [], pose: [] }
  const only: string[] = []
  let dry = false
  let overwrite = false
  let seconds: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [flag, inline] = arg.split('=', 2)
    if (flag === '--dry') dry = true
    else if (flag === '--overwrite') overwrite = true
    else if (flag === '--seconds') {
      const value = Number(inline ?? argv[++i])
      if (!Number.isFinite(value) || value < 1 || value > MAX_CLIP_SECONDS) throw new Error(`--seconds needs a number from 1 to ${MAX_CLIP_SECONDS}.`)
      seconds = value
    } else if (flag === '--except' || flag === '--sex-act') {
      const value = inline ?? argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value: ${flag} a,b`)
      lists[flag === '--except' ? 'except' : 'pose'].push(...value.split(',').map((one) => one.trim().toLowerCase()).filter(Boolean))
    } else if (arg.startsWith('--')) throw new Error(`There is no ${arg}. Use --dry, --overwrite, --sex-act, --except or --seconds.`)
    else only.push(arg.toLowerCase())
  }
  const unknownPoses = lists.pose.filter((pose) => !ALL_POSES.includes(pose))
  if (unknownPoses.length > 0) throw new Error(`No such sex-act: ${unknownPoses.join(', ')}. These can be made: ${ALL_POSES.join(', ')}.`)
  return { dry, overwrite, only, except: lists.except, poses: lists.pose.length > 0 ? lists.pose : [...POSES], seconds }
}

/** Her, as the game's files have her now: read afresh each time, so that nothing saved meanwhile is undone. */
function current(id: string): { li: LoveInterest; content: ReturnType<typeof loadBase>['content'] } | null {
  const { content } = loadBase(PACK)
  const li = content.loveInterests.find((one) => one.id === id)
  return li ? { li, content } : null
}

async function main(): Promise<void> {
  const settingsPath = settingsFile()
  if (!existsSync(settingsPath)) throw new Error(`No ComfyUI settings at ${settingsPath}. Set ComfyUI up in the app first.`)
  // Read afresh for every clip, so that a prompt or a length changed in the app while this runs is used from the next clip on.
  const readSettings = () => new ComfyStore(settingsPath, PACK).get()
  const settings = readSettings()

  const { dry, overwrite, only, except, poses, seconds } = readArgs(process.argv.slice(2))
  const all = loadBase(PACK).content.loveInterests.filter((li) => li.kind !== 'npc')
  const unknown = [...only, ...except].filter((id) => !all.some((li) => li.id === id))
  if (unknown.length > 0) throw new Error(`No love interest called: ${unknown.join(', ')}`)
  const everyone = all.filter((li) => (only.length === 0 || only.includes(li.id)) && !except.includes(li.id))

  // An overwrite carries on where it was stopped: what it has already made since it began is not made again.
  const selection = JSON.stringify({ poses, ids: everyone.map((li) => li.id) })
  let since: string | null = null
  if (overwrite) {
    let marker: { selection?: string; since?: string } = {}
    try {
      marker = JSON.parse(readFileSync(OVERWRITE, 'utf8')) as typeof marker
    } catch {
      // None yet: this is a new round.
    }
    since = marker.selection === selection && marker.since ? marker.since : new Date().toISOString()
    if (since !== marker.since && !dry) writeFileSync(OVERWRITE, `${JSON.stringify({ selection, since }, null, 2)}\n`)
    if (since === marker.since) console.log(`Carrying on the overwrite begun ${since}.`)
  }
  const madeSince = (key: string) => since !== null && progress[key]?.status === 'done' && progress[key].at >= since

  // Everything to make, in order: each of her poses that has a picture and no clip yet, or with --overwrite, one not made again yet.
  const todo: { id: string; name: string; pose: Animation }[] = []
  for (const li of everyone) {
    for (const poseId of poses) {
      const key = `${li.id}/${poseId}`
      const pose = li.animations.find((a) => a.id === poseId)
      if (pose?.clip && (!overwrite || madeSince(key))) continue
      if (!pose?.image) {
        if (progress[key]?.status !== 'skipped' && !dry) note(key, { status: 'skipped', message: 'no picture to make it from' })
        continue
      }
      todo.push({ id: li.id, name: li.name, pose })
    }
  }
  const skipped = everyone.flatMap((li) => poses.filter((poseId) => !li.animations.find((a) => a.id === poseId)?.image))
  console.log(`ComfyUI at ${settings.baseUrl}, clips of ${seconds === undefined ? `${SECONDS}s (${SHORT.seconds}s for ${SHORT.poses.join(' and ')})` : `${seconds}s`}, looping${overwrite ? ', replacing those there are' : ''}.`)
  console.log(`${todo.length} clip${todo.length === 1 ? '' : 's'} of ${poses.join(', ')} to make for ${everyone.length} love interests.${skipped.length > 0 ? ` ${skipped.length} sex-act${skipped.length === 1 ? ' has' : 's have'} no picture and ${skipped.length === 1 ? 'is' : 'are'} left out.` : ''}`)
  if (todo.length === 0) {
    if (overwrite && !dry) rmSync(OVERWRITE, { force: true })
    return
  }
  if (dry) {
    for (const { name, pose } of todo) console.log(`  ${name}, ${pose.name}: from ${pose.image}${pose.clip ? `, in place of ${pose.clip}` : ''}`)
    return
  }

  // Ctrl+C cancels the clip being made and stops; a second one stops at once.
  const cancel = new AbortController()
  process.on('SIGINT', () => {
    if (cancel.signal.aborted) process.exit(130)
    console.log('\nStopping: cancelling the clip being made. Run again to carry on. (Ctrl+C again to quit at once.)')
    cancel.abort()
  })

  const started = Date.now()
  let failedInARow = 0
  let finished = 0
  for (const [i, { id, name, pose }] of todo.entries()) {
    if (cancel.signal.aborted) break
    const key = `${id}/${pose.id}`
    const began = Date.now()
    process.stdout.write(`[${i + 1}/${todo.length}] ${name}, ${pose.name}... `)
    const now = readSettings()
    const result = await generateClip(
      now,
      PACK,
      PACK,
      {
        subjectId: id,
        name: `nsfw-${pose.id}`,
        workflow: '',
        image: pose.image!,
        // Looping: it ends on the picture it starts from.
        lastImage: pose.image!,
        prompt: videoPromptFor(now, pose.id),
        seconds: secondsFor(pose.id, seconds)
      },
      cancel.signal,
      ''
    )
    if (cancel.signal.aborted) {
      console.log('cancelled.')
      break
    }
    if (!result.ok || !result.path) {
      console.log(`failed: ${result.message}`)
      note(key, { status: 'failed', message: result.message })
      if (++failedInARow >= GIVE_UP_AFTER) {
        console.log(`${GIVE_UP_AFTER} failures in a row: stopping. Fix what is wrong and run again.`)
        process.exitCode = 1
        break
      }
      continue
    }
    failedInARow = 0

    // Put on her as she is now, and saved the way the editor saves her.
    const she = current(id)
    if (!she) {
      console.log('made, but she is no longer in the game.')
      note(key, { status: 'failed', message: 'she is no longer in the game', clip: result.path, seed: result.seed ?? undefined })
      continue
    }
    const replaced = she.li.animations.find((a) => a.id === pose.id)?.clip
    const animations = she.li.animations.map((a) => (a.id === pose.id ? { ...a, clip: result.path!, loop: true } : a))
    const issues = saveLoveInterest(PACK, she.content, { ...she.li, animations })
    if (issues.length > 0) {
      console.log(`made, but she could not be saved: ${issues.join('; ')}`)
      note(key, { status: 'failed', message: `could not save: ${issues.join('; ')}`, clip: result.path, seed: result.seed ?? undefined })
      continue
    }
    // The clip it replaced goes, so that the game does not carry it; not if another of her poses still plays it.
    if (replaced && replaced !== result.path && !animations.some((a) => a.clip === replaced || a.image === replaced)) {
      rmSync(join(PACK, replaced), { force: true })
    }
    note(key, { status: 'done', clip: result.path, seed: result.seed ?? undefined })
    finished++
    const left = todo.length - i - 1
    const each = (Date.now() - started) / (i + 1)
    console.log(`done in ${minutes(Date.now() - began)}: ${result.path}${left > 0 ? ` (about ${minutes(each * left)} to go)` : ''}`)
  }
  // The overwrite is over once everything in it has been made: the same command after this starts a new one.
  if (overwrite && finished === todo.length) rmSync(OVERWRITE, { force: true })
}

main().catch((error: unknown) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
