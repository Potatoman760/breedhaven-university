/**
 * Lays out the term again from the game's curriculum and characters, and writes it to `content/default/catalogue.json`:
 * which courses are given, who gives each, when each meets and who is in it. What the courses are is written in
 * `curriculum.json` and is not touched. Run it after a character is added or changes what she reads or teaches.
 * Not part of the app:
 *
 *   npx jiti scripts/build-catalogue.ts          build and write
 *   npx jiti scripts/build-catalogue.ts --dry    say what it would write, and who is in what
 *   npx jiti scripts/build-catalogue.ts --seed 3
 *
 * The app reads an add-on's `catalogue.json` in place of this one when there is one in its user data folder: a copy
 * left there from the editor has to be saved again from the editor, or removed, for this one to be used.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadContentPack } from '../src/main/content/loader'
import { buildCatalogue, catalogueOf, dormantCourses, writtenCatalogue } from '../src/shared/game'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const seedAt = args.indexOf('--seed')
const dir = resolve('content', 'default')
const file = join(dir, 'catalogue.json')
const content = loadContentPack(dir)
const before: { seed: number; courses: unknown[] } | undefined = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { seed: number; courses: unknown[] }) : undefined
const seed = seedAt >= 0 ? Number(args[seedAt + 1]) : (before?.seed ?? 1)
if (!Number.isInteger(seed)) throw new Error('--seed needs a whole number.')

const courses = buildCatalogue(content, seed)

const name = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
console.log(`${courses.length} courses from seed ${seed}${before ? ` (there were ${before.courses.length})` : ''}.`)
for (const course of courses) {
  const who = [course.teacherId ? `${name(course.teacherId)} (teaches)` : '', ...course.studentIds.map(name)].filter(Boolean)
  console.log(`  ${course.number.padEnd(8)} ${String(who.length)}  ${who.join(', ').padEnd(34)} ${course.title}`)
}
const load = new Map<string, number>()
for (const course of courses) for (const id of course.studentIds) load.set(id, (load.get(id) ?? 0) + 1)
console.log(`Courses each student takes: ${[...load].map(([id, count]) => `${name(id)} ${count}`).join(', ')}.`)
const dormant = dormantCourses(content, courses)
if (dormant.length > 0) console.log(`Written, and not given this term for want of anyone to read or teach them: ${dormant.map((course) => course.number).join(', ')}.`)

if (dry) console.log('Nothing written.')
else {
  writeFileSync(file, `${JSON.stringify(writtenCatalogue(catalogueOf(content, seed, courses)), null, 2)}\n`)
  console.log(`Written to ${file}.`)
}
const appData = process.platform === 'win32' ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')) : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
const override = join(appData, 'breedhaven-dating-sim', 'addons', 'catalogue.json')
if (existsSync(override)) console.log(`Note: ${override} is read in place of the game's own catalogue. Remove it, or save the catalogue again from the editor, for this one to be used.`)
