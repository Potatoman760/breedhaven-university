import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { describe, expect, it } from 'vitest'
import { packChoices, packManifest, packPreview, type PackManifest } from '../../shared/packs'
import { ADDON_PREFIX } from '../../shared/editor'
import { loadWithAddons, saveLook, saveLoveInterest, saveMajor, saveTrait } from './addons'
import { installPack, readPackManifest, unpackFiles, writePack } from './packs'

const packDir = join(process.cwd(), 'content', 'default')
const folder = () => mkdtempSync(join(tmpdir(), 'bh-packs-'))
const face = { id: 'smug', name: 'Smug', description: 'pleased with herself', draws: '' }
const act = { id: 'spoons', name: 'Spoons', description: 'lying side by side', draws: 'side by side', groupDraws: '', moment: false, seeding: false, manShown: true }

/** A player's game with an outfit, a face and a sex-act of their own for Faye, and their files on disk. */
function madeByPlayer() {
  const addonDir = join(folder(), 'addons')
  const start = loadWithAddons(packDir, addonDir)
  mkdirSync(join(addonDir, 'sprites', 'faye'), { recursive: true })
  for (const name of ['beach.png', 'smug.png', 'spoons.webp', 'spoons.mp4']) writeFileSync(join(addonDir, 'sprites', 'faye', name), name)
  saveLook(addonDir, start.content, { kind: 'expressions', look: face })
  saveLook(addonDir, start.content, { kind: 'acts', look: act })
  const faye = start.content.loveInterests.find((li) => li.id === 'faye')!
  const sprite = (name: string) => ({ image: `${ADDON_PREFIX}sprites/faye/${name}`, description: '' })
  const outfits = faye.outfits.map((outfit) => (outfit.id === 'default' ? { ...outfit, sprites: { ...outfit.sprites, smug: sprite('smug.png') } } : outfit))
  const beach = { id: 'beach', name: 'Beach', description: 'a swimsuit', sprites: { neutral: sprite('beach.png') }, pregnant: false }
  const animations = [...faye.animations, { id: 'spoons', name: 'Spoons', description: '', image: sprite('spoons.webp').image, clip: sprite('spoons.mp4').image, loop: true }]
  const loaded = loadWithAddons(packDir, addonDir)
  expect(saveLoveInterest(addonDir, loaded.content, { ...loaded.content.loveInterests.find((li) => li.id === 'faye')!, outfits: [...outfits, beach], animations })).toEqual([])
  return { addonDir, content: loadWithAddons(packDir, addonDir).content }
}

const picks = { outfits: ['beach'], expressions: ['smug'], acts: ['spoons'] }
const asPlayer = { base: false, loveInterests: {}, majors: {} }
const selecting = (characters: Record<string, typeof picks>) => ({ name: 'Summer', characters, people: [], majors: [] })
const onDisk = (addonDir: string) => (path: string) => {
  const file = join(addonDir, path.slice(ADDON_PREFIX.length))
  return existsSync(file) ? file : undefined
}

async function aPack() {
  const made = madeByPlayer()
  const manifest = packManifest(made.content, selecting({ faye: picks }), asPlayer)
  const path = join(folder(), 'summer.zip')
  const written = await writePack(path, manifest, onDisk(made.addonDir))
  return { ...made, path, written }
}

async function install(path: string, addonDir: string, content: Parameters<typeof installPack>[1], manifest: PackManifest) {
  const { dir, files } = await unpackFiles(path, manifest)
  return { done: installPack(addonDir, content, manifest, files, ADDON_PREFIX), dir }
}

describe('what can go in a pack', () => {
  it('offers a player only what is their own', () => {
    const { content } = madeByPlayer()
    const faye = packChoices(content, asPlayer).characters.find((who) => who.id === 'faye')
    expect(faye?.outfits.map((one) => one.id).sort()).toEqual(['beach', 'default'])
    expect(faye?.expressions).toEqual([{ id: 'smug', name: 'Smug', pictures: 1, clips: 0 }])
    expect(faye?.acts).toEqual([{ id: 'spoons', name: 'Spoons', pictures: 1, clips: 1 }])
    expect(packChoices(content, asPlayer).characters.map((who) => who.id)).toEqual(['faye'])
  })

  it('takes the added faces and acts its contents are filed under, and only those', () => {
    const { content } = madeByPlayer()
    const manifest = packManifest(content, selecting({ faye: { outfits: [], expressions: [], acts: ['spoons'] } }), asPlayer)
    expect(manifest.looks).toEqual({ expressions: [], acts: [act] })
    expect(manifest.characters[0].outfits).toEqual([])
  })

  it('brings the outfit another builds on as a definition with no pictures', () => {
    const { content } = madeByPlayer()
    const faye = content.loveInterests.find((li) => li.id === 'faye')!
    const leaning = { ...content, loveInterests: content.loveInterests.map((li) => (li === faye ? { ...li, outfits: li.outfits.map((o) => (o.id === 'beach' ? { ...o, inherits: 'nude' } : o)) } : li)) }
    const manifest = packManifest(leaning, selecting({ faye: { outfits: ['beach'], expressions: [], acts: [] } }), asPlayer)
    expect(manifest.characters[0].outfits.find((o) => o.id === 'nude')).toMatchObject({ whole: false, sprites: {} })
  })
})

describe('a pack from one player to another', () => {
  it('carries the pictures and clips over, and the faces and acts with them', async () => {
    const { path, written } = await aPack()
    expect(written).toEqual({ files: 4, missing: [] })
    const addonDir = join(folder(), 'addons')
    const theirs = loadWithAddons(packDir, addonDir).content
    const manifest = await readPackManifest(path)
    const { done } = await install(path, addonDir, theirs, manifest)
    expect(done).toEqual({ installed: ['faye'], majors: [], notes: [] })

    const { content, info } = loadWithAddons(packDir, addonDir)
    expect(info.issues).toEqual([])
    expect(content.looks.expressions.map((one) => one.id)).toContain('smug')
    expect(content.looks.acts.map((one) => one.id)).toContain('spoons')
    const faye = content.loveInterests.find((li) => li.id === 'faye')!
    expect(faye.outfits.find((o) => o.id === 'beach')?.sprites['neutral'].image).toBe('addons/sprites/faye/beach.png')
    expect(faye.outfits.find((o) => o.id === 'default')?.sprites['smug'].image).toBe('addons/sprites/faye/smug.png')
    // What she had of her own in that outfit is still hers.
    expect(Object.keys(faye.outfits.find((o) => o.id === 'default')?.sprites ?? {}).length).toBeGreaterThan(1)
    expect(faye.animations.find((pose) => pose.id === 'spoons')).toMatchObject({ image: 'addons/sprites/faye/spoons.webp', clip: 'addons/sprites/faye/spoons.mp4' })
    expect(readdirSync(join(addonDir, 'sprites', 'faye')).sort()).toEqual(['beach.png', 'smug.png', 'spoons.mp4', 'spoons.webp'])
  })

  it('says what it would do first: what is new, and what would be replaced', async () => {
    const { path, content } = await aPack()
    const manifest = await readPackManifest(path)
    const fresh = packPreview(loadWithAddons(packDir, join(folder(), 'addons')).content, manifest)
    expect(fresh.looks).toEqual(['Smug', 'Spoons'])
    expect(fresh.characters[0]).toMatchObject({ present: true, outfits: ['Beach'], expressions: ['Smug'], acts: ['Spoons'], pictures: 3, clips: 1, replaces: [] })
    expect(packPreview(content, manifest).characters[0].replaces).toEqual(expect.arrayContaining(['Beach', 'Spoons']))
  })

  it('passes over a character who is not in this game', async () => {
    const { path } = await aPack()
    const manifest = await readPackManifest(path)
    const absent = { ...manifest, characters: manifest.characters.map((who) => ({ ...who, id: 'nobody-here', name: 'Nobody' })) }
    const addonDir = join(folder(), 'addons')
    const { files } = await unpackFiles(path, manifest)
    const done = installPack(addonDir, loadWithAddons(packDir, addonDir).content, absent, files, ADDON_PREFIX)
    expect(done).toEqual({ installed: [], majors: [], notes: ['Nobody is not in this game: passed over.'] })
    expect(packPreview(loadWithAddons(packDir, addonDir).content, absent).characters[0].present).toBe(false)
  })

  it('leaves out of a pack a file that has gone missing, and says so', async () => {
    const { addonDir, content } = madeByPlayer()
    const manifest = packManifest(content, selecting({ faye: picks }), asPlayer)
    const written = await writePack(join(folder(), 'x.zip'), manifest, (path) => (path.endsWith('beach.png') ? undefined : onDisk(addonDir)(path)))
    expect(written.missing).toEqual([`${ADDON_PREFIX}sprites/faye/beach.png`])
  })
})

describe('a whole character and her major', () => {
  /** Mira, a player's own: a student of a major of theirs in a college of theirs, with a trait of theirs, friends with Faye. */
  function mira() {
    const addonDir = join(folder(), 'addons')
    const start = loadWithAddons(packDir, addonDir).content
    const faye = start.loveInterests.find((li) => li.id === 'faye')!
    const written = start.curriculum!.majors.find((major) => !major.general && major.courses.length >= 2)!
    const courses = written.courses.map((course, i) => ({ ...course, skill: { ...(course.skill ?? { name: 'Dream', description: 'Dreams.', at: 30 }), id: `dream-${i}` } }))
    const major = { ...written, code: 'DRM', subject: 'Dreaming', college: 'night-school', courses }
    expect(saveMajor(addonDir, start, { major, college: { id: 'night-school', name: 'Night School' } })).toEqual([])
    expect(saveTrait(addonDir, { id: 'dreamy', name: 'Dreamy', definition: 'Far away.' })).toEqual([])
    mkdirSync(join(addonDir, 'sprites', 'mira'), { recursive: true })
    for (const name of ['neutral.png', 'room.webp', 'walk.png', 'birth.png', 'act.mp4']) writeFileSync(join(addonDir, 'sprites', 'mira', name), name)
    const file = (name: string) => `${ADDON_PREFIX}sprites/mira/${name}`
    const content = loadWithAddons(packDir, addonDir).content
    const her = {
      ...faye,
      id: 'mira',
      name: 'Mira Vale',
      traitIds: ['dreamy'],
      friends: ['faye'],
      enemies: [],
      studies: { subject: 'Dreaming', code: 'DRM', level: 2, stats: major.stats, practical: major.practical },
      outfits: faye.outfits.map((outfit) => (outfit.id === 'default' ? { ...outfit, sprites: { neutral: { image: file('neutral.png'), description: '' } } } : { ...outfit, sprites: {} })),
      animations: [{ id: 'blowjob', name: 'Blowjob', description: '', clip: file('act.mp4'), loop: true }],
      room: { name: 'a garret', description: '', locationId: content.locations[0].id, images: { day: file('room.webp') } },
      birthPictures: { dark: file('birth.png') },
      walkSprite: file('walk.png')
    }
    expect(saveLoveInterest(addonDir, content, her)).toEqual([])
    const loaded = loadWithAddons(packDir, addonDir)
    expect(loaded.info.issues).toEqual([])
    return { addonDir, ...loaded }
  }

  const passOn = async (from: ReturnType<typeof mira>) => {
    const manifest = packManifest(from.content, { name: 'Mira', characters: {}, people: ['mira'], majors: [] }, from.info)
    const path = join(folder(), 'mira.zip')
    await writePack(path, manifest, onDisk(from.addonDir))
    return path
  }

  it('is offered for what the player made, and not for what the game has', () => {
    const made = mira()
    const { characters, majors } = packChoices(made.content, made.info)
    expect(characters.find((who) => who.id === 'mira')?.whole).toEqual({ id: 'mira', name: 'Mira Vale', pictures: 4, clips: 1 })
    expect(characters.find((who) => who.id === 'faye')).toBeUndefined()
    expect(majors).toEqual([{ code: 'DRM', name: 'Dreaming' }])
  })

  it('brings all she needs to a game that has none of it', async () => {
    const made = mira()
    const path = await passOn(made)
    const addonDir = join(folder(), 'addons')
    const theirs = loadWithAddons(packDir, addonDir)
    const manifest = await readPackManifest(path)
    expect(packPreview(theirs.content, manifest)).toMatchObject({ looks: ['Dreamy'], majors: [{ name: 'Dreaming', present: false }], people: [{ id: 'mira', replaces: false, pictures: 4, clips: 1 }] })

    const { done } = await install(path, addonDir, theirs.content, manifest)
    expect(done).toEqual({ installed: ['mira'], majors: ['DRM'], notes: [] })
    const { content, info } = loadWithAddons(packDir, addonDir)
    expect(info.issues).toEqual([])
    const her = content.loveInterests.find((li) => li.id === 'mira')!
    expect(her.studies).toMatchObject({ code: 'DRM', subject: 'Dreaming', level: 2 })
    expect(her.traitIds).toEqual(['dreamy'])
    expect(content.curriculum?.colleges.map((one) => one.id)).toContain('night-school')
    expect(her.room?.images?.day).toBe('addons/sprites/mira/room.webp')
    expect([her.walkSprite, her.birthPictures.dark]).toEqual(['addons/sprites/mira/walk.png', 'addons/sprites/mira/birth.png'])
    expect(her.animations[0].clip).toBe('addons/sprites/mira/act.mp4')
    expect(readdirSync(join(addonDir, 'sprites', 'mira'))).toHaveLength(5)
  })

  it('keeps of her friends only those this game has', async () => {
    const path = await passOn(mira())
    const manifest = await readPackManifest(path)
    const withStranger = { ...manifest, people: manifest.people.map((who) => ({ ...who, friends: ['faye', 'someone-else'] })) }
    const addonDir = join(folder(), 'addons')
    const { done } = await install(path, addonDir, loadWithAddons(packDir, addonDir).content, withStranger)
    expect(done.notes).toEqual([])
    expect(loadWithAddons(packDir, addonDir).content.loveInterests.find((li) => li.id === 'mira')?.friends).toEqual(['faye'])
  })

  it('leaves the major a game already has as it is, and packs a major on its own', async () => {
    const made = mira()
    const manifest = packManifest(made.content, { name: 'x', characters: {}, people: [], majors: ['DRM'] }, made.info)
    expect(manifest.majors.map((one) => one.major.code)).toEqual(['DRM'])
    expect(manifest.people).toEqual([])
    expect(packPreview(made.content, manifest).majors).toEqual([{ name: 'Dreaming', present: true }])
    const path = join(folder(), 'major.zip')
    await writePack(path, manifest, onDisk(made.addonDir))
    const { done } = await install(path, made.addonDir, made.content, manifest)
    expect(done).toEqual({ installed: [], majors: [], notes: [] })
  })

  it('takes away what was copied for one who cannot be saved', async () => {
    const path = await passOn(mira())
    const manifest = await readPackManifest(path)
    const lost = { ...manifest, people: manifest.people.map((who) => ({ ...who, schedule: [{ locationId: 'the-moon' }] })) }
    const addonDir = join(folder(), 'addons')
    const { done } = await install(path, addonDir, loadWithAddons(packDir, addonDir).content, lost)
    expect(done.installed).toEqual([])
    expect(done.notes[0]).toMatch(/Mira Vale was left out/)
    expect(readdirSync(join(addonDir, 'sprites', 'mira'))).toEqual([])
  })

  it('refuses a character under age', async () => {
    const path = await passOn(mira())
    const manifest = await readPackManifest(path)
    const zip = new ZipFile()
    zip.addBuffer(Buffer.from(JSON.stringify({ ...manifest, people: manifest.people.map((who) => ({ ...who, age: 17 })) })), 'pack.json')
    zip.end()
    const bad = join(folder(), 'young.zip')
    await finished(zip.outputStream.pipe(createWriteStream(bad)))
    await expect(readPackManifest(bad)).rejects.toThrow('not a pack')
  })
})

describe('a zip that is not to be trusted', () => {
  async function zipOf(manifest: unknown, extra: Record<string, string> = {}) {
    const zip = new ZipFile()
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'pack.json')
    for (const [name, text] of Object.entries(extra)) zip.addBuffer(Buffer.from(text), name)
    zip.end()
    const path = join(folder(), 'bad.zip')
    await finished(zip.outputStream.pipe(createWriteStream(path)))
    return path
  }
  const naming = (image: string) => ({ format: 1, name: 'x', looks: {}, traits: [], majors: [], people: [], characters: [{ id: 'faye', name: 'Faye', animations: [], outfits: [{ id: 'default', name: 'd', whole: false, sprites: { neutral: image } }] }] })

  it('refuses a zip with no manifest, or one that is not what it should be', async () => {
    await expect(readPackManifest(await zipOf({ format: 99 }))).rejects.toThrow('not a pack')
    await expect(readPackManifest(await zipOf({ ...naming('files/faye/a.png'), characters: [{ id: '../x', name: 'x', outfits: [], animations: [] }] }))).rejects.toThrow('not a pack')
  })

  it('refuses a manifest naming anything but a plain picture or clip in the zip', async () => {
    await expect(readPackManifest(await zipOf(naming('../../evil.png'), { 'files/faye/a.png': 'x' }))).rejects.toThrow('can\'t be used')
    await expect(readPackManifest(await zipOf(naming('files/faye/../../evil.png')))).rejects.toThrow('can\'t be used')
    await expect(readPackManifest(await zipOf(naming('files/faye/run.exe'), { 'files/faye/run.exe': 'x' }))).rejects.toThrow('can\'t be used')
    await expect(readPackManifest(await zipOf(naming('files/faye/gone.png')))).rejects.toThrow('can\'t be used')
  })

  it('reads nothing the manifest does not name', async () => {
    const path = await zipOf(naming('files/faye/a.png'), { 'files/faye/a.png': 'x', 'files/faye/b.png': 'y', 'other.txt': 'z' })
    const manifest = await readPackManifest(path)
    const { dir, files } = await unpackFiles(path, manifest)
    expect([...files.keys()]).toEqual(['files/faye/a.png'])
    expect(readdirSync(dir)).toHaveLength(1)
  })
})
