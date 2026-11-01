import { createWriteStream, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open, type Entry, type ZipFile as ReadZip } from 'yauzl'
import { ZipFile as WriteZip } from 'yazl'
import type { ContentPack, LoveInterest } from '../../shared/model'
import { PACK_MANIFEST, PackManifestSchema, allPackFiles, isPackFile, withPackPaths, withPacked, withPersonPaths, type PackManifest } from '../../shared/packs'
import { t } from '../../shared/i18n'
import { importAsset, saveLook, saveLoveInterest, saveMajor, saveTrait } from './addons'

// The most a manifest can be, and the most a pack can unpack to: enough for any real pack, and short of filling a disk.
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const MAX_PACK_BYTES = 32 * 1024 ** 3

/** What a pack's file is called: plain, so that it can be told from any path in the zip. */
function plainName(path: string): string {
  const extension = extname(path).toLowerCase()
  const stem = basename(path, extname(path)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  return `${stem}${extension}`
}

/**
 * Writes a pack: `file` says where each of the content's paths is on disk, or nothing for one that is missing. Written
 * to one side and moved into place, so that a pack cut short is never left looking like a pack. Pictures and clips are
 * compressed already, so they are only stored. Says which were missing.
 */
export async function writePack(target: string, manifest: PackManifest, file: (path: string) => string | undefined): Promise<{ files: number; missing: string[] }> {
  const zip = new WriteZip()
  // A file that can't be read is an error on the zip and not on what it writes: without this the write would wait for ever.
  zip.on('error', (error: Error) => (zip.outputStream as Readable).destroy(error))
  const missing: string[] = []
  const entries = new Map<string, string>()
  /** Gives each of a character's files its place in the zip, once however often it is named. */
  const placed = (id: string) => {
    const named = new Map<string, string>()
    return (path: string): string | undefined => {
      const known = named.get(path)
      if (known) return known
      const source = file(path)
      if (!source) {
        if (!missing.includes(path)) missing.push(path)
        return undefined
      }
      const name = plainName(path)
      const stem = name.slice(0, name.length - extname(name).length)
      let entry = `files/${id}/${name}`
      for (let n = 2; entries.has(entry); n++) entry = `files/${id}/${stem}-${n}${extname(name)}`
      entries.set(entry, source)
      named.set(path, entry)
      return entry
    }
  }
  const characters = manifest.characters.map((who) => withPackPaths(who, placed(who.id)))
  const people = manifest.people.map((who) => withPersonPaths(who, placed(who.id)))
  for (const [entry, source] of entries) zip.addFile(source, entry, { compress: false })
  zip.addBuffer(Buffer.from(`${JSON.stringify({ ...manifest, characters, people }, null, 2)}\n`), PACK_MANIFEST)
  zip.end()
  const part = `${target}.part`
  try {
    await pipeline(zip.outputStream, createWriteStream(part))
    renameSync(part, target)
  } catch (error) {
    rmSync(part, { force: true })
    throw error
  }
  return { files: entries.size, missing }
}

/** Opens a zip, lists what is in it, and closes it again once `use` is done. */
function withZip<T>(path: string, use: (zip: ReadZip, entries: Map<string, Entry>) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    open(path, { lazyEntries: true, autoClose: false }, (failed, zip) => {
      if (failed) return reject(failed)
      const entries = new Map<string, Entry>()
      const finish = (work: Promise<T>) => {
        work.then(resolve, reject).finally(() => zip.close())
      }
      zip.on('error', (error: Error) => finish(Promise.reject(error)))
      zip.on('entry', (entry: Entry) => {
        entries.set(entry.fileName, entry)
        zip.readEntry()
      })
      zip.on('end', () => finish(use(zip, entries)))
      zip.readEntry()
    })
  })
}

function entryStream(zip: ReadZip, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (failed, stream) => (failed ? reject(failed) : resolve(stream))))
}

/** Reads a pack's manifest, and checks that all it names is a file of the kinds a pack holds, and is in the zip. */
export async function readPackManifest(path: string): Promise<PackManifest> {
  return withZip(path, async (zip, entries) => {
    const entry = entries.get(PACK_MANIFEST)
    if (!entry) throw new Error(t('editor.packs.notAPack'))
    if (entry.uncompressedSize > MAX_MANIFEST_BYTES) throw new Error(t('editor.packs.notAPack'))
    const chunks: Buffer[] = []
    for await (const chunk of await entryStream(zip, entry)) chunks.push(chunk as Buffer)
    let raw: unknown
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new Error(t('editor.packs.notAPack'))
    }
    const parsed = PackManifestSchema.safeParse(raw)
    if (!parsed.success) throw new Error(t('editor.packs.notAPack'))
    const files = allPackFiles(parsed.data)
    const bad = files.find((file) => !isPackFile(file) || !entries.has(file))
    if (bad) throw new Error(t('editor.packs.badFile', { file: bad }))
    const size = files.reduce((total, file) => total + (entries.get(file)?.uncompressedSize ?? 0), 0)
    if (size > MAX_PACK_BYTES) throw new Error(t('editor.packs.tooBig'))
    return parsed.data
  })
}

/** Unpacks what the manifest names into a folder of its own. Each comes out under a number: nothing in the zip says where a file goes. */
export async function unpackFiles(path: string, manifest: PackManifest): Promise<{ dir: string; files: Map<string, string> }> {
  const dir = mkdtempSync(join(tmpdir(), 'breedhaven-pack-'))
  const wanted = allPackFiles(manifest)
  const files = new Map<string, string>()
  try {
    await withZip(path, async (zip, entries) => {
      for (const [i, file] of wanted.entries()) {
        const entry = entries.get(file)
        if (!entry) throw new Error(t('editor.packs.badFile', { file }))
        const out = join(dir, `${i}`)
        await pipeline(await entryStream(zip, entry), createWriteStream(out))
        files.set(file, out)
      }
    })
    return { dir, files }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

/** What came of importing a pack. */
export interface PackInstall {
  /** The characters who took something from it, by id. */
  installed: string[]
  /** The subjects it added, by code. */
  majors: string[]
  /** Why anything was passed over. */
  notes: string[]
}

/**
 * Lays an unpacked pack over the game, each thing as the editor would save it, so that nothing the game could not load
 * gets in. Subjects, traits, faces and sex-acts go first, since those who follow lean on them. Whatever this game has
 * already under the same code or id of those is left as it is. A whole character takes the place of anyone of her id.
 * One who can't be taken, or is not in this game to take what is hers, is passed over and said so, and the files copied
 * for her are taken away again. Her friends and enemies are kept only where this game has them.
 */
export function installPack(addonDir: string, content: ContentPack, manifest: PackManifest, files: Map<string, string>, prefix: string): PackInstall {
  const notes: string[] = []
  const installed: string[] = []
  const majors: string[] = []
  let now = content
  for (const { major, college } of manifest.majors) {
    const curriculum = now.curriculum
    if (!curriculum || curriculum.majors.some((one) => one.code === major.code)) continue
    const newCollege = !curriculum.colleges.some((one) => one.id === college.id)
    const problems = saveMajor(addonDir, now, { major, ...(newCollege && { college }) })
    if (problems.length > 0) {
      notes.push(t('editor.packs.lookLeftOut', { name: major.subject, why: problems[0] }))
      continue
    }
    majors.push(major.code)
    now = { ...now, curriculum: { colleges: newCollege ? [...curriculum.colleges, college] : curriculum.colleges, majors: [...curriculum.majors, major] } }
  }
  for (const trait of manifest.traits) {
    if (now.traits.some((one) => one.id === trait.id)) continue
    const problems = saveTrait(addonDir, trait)
    if (problems.length > 0) notes.push(t('editor.packs.lookLeftOut', { name: trait.name, why: problems[0] }))
    else now = { ...now, traits: [...now.traits, trait] }
  }
  for (const kind of ['expressions', 'acts'] as const) {
    for (const look of manifest.looks[kind]) {
      if ((now.looks[kind] as { id: string }[]).some((one) => one.id === look.id)) continue
      const problems = saveLook(addonDir, now, { kind, look })
      if (problems.length > 0) notes.push(t('editor.packs.lookLeftOut', { name: look.name, why: problems[0] }))
      else now = { ...now, looks: { ...now.looks, [kind]: [...now.looks[kind], look] } }
    }
  }

  /** Saves one character with her files copied in, and takes them away again if she can't be saved. */
  const save = (id: string, name: string, make: (copy: (path: string) => string | undefined) => LoveInterest): void => {
    const copied = new Map<string, string>()
    const copy = (path: string): string | undefined => {
      const unpacked = files.get(path)
      if (!unpacked) return undefined
      const known = copied.get(path)
      if (known) return known
      const made = importAsset(addonDir, id, unpacked, prefix, plainName(path))
      copied.set(path, made)
      return made
    }
    const problems = saveLoveInterest(addonDir, now, make(copy))
    if (problems.length === 0) {
      installed.push(id)
      return
    }
    for (const path of copied.values()) rmSync(join(addonDir, prefix ? path.slice(prefix.length) : path), { force: true })
    notes.push(t('editor.packs.characterLeftOut', { name, why: problems[0] }))
  }

  const everyone: LoveInterest[] = [...content.loveInterests, ...content.npcs]
  const here = (id: string) => content.loveInterests.some((one) => one.id === id)
  for (const person of manifest.people) {
    save(person.id, person.name, (copy) => {
      const { friends, enemies, ...rest } = withPersonPaths(person, copy)
      return { ...rest, friends: friends.filter(here), enemies: enemies.filter(here) }
    })
  }
  for (const packed of manifest.characters) {
    const who = everyone.find((one) => one.id === packed.id)
    if (who) save(who.id, who.name, (copy) => withPacked(who, withPackPaths(packed, copy)))
    else notes.push(t('editor.packs.notInGame', { name: packed.name }))
  }
  return { installed, majors, notes }
}
