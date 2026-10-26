import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveContentPath } from './assets'
import { deleteLocation, deleteLoveInterest, deleteTrait, importAsset, loadWithAddons, rebuildCatalogue, saveMajor, deleteMajor, removeUnusedAssets, resetPlayer, saveLocation, saveLoveInterest, savePlayer, saveTrait } from './addons'

// The game's own pack is the base; each test gets an empty add-on folder of its own.
const packDir = join(process.cwd(), 'content', 'default')
const addons = () => join(mkdtempSync(join(tmpdir(), 'bh-addons-')), 'addons')
const base = loadWithAddons(packDir, addons())
const faye = base.content.loveInterests.find((li) => li.id === 'faye')!
const mira = { ...faye, id: 'mira', name: 'Mira Vale', studies: undefined, traitIds: [] }

describe('loadWithAddons', () => {
  it('is the game as shipped when there are no add-ons', () => {
    expect(base.info.issues).toEqual([])
    expect(Object.values(base.info.loveInterests).every((origin) => origin === 'base')).toBe(true)
    expect(base.content.loveInterests.length).toBeGreaterThan(5)
  })

  it('adds new characters and lets one with a built-in id take that character\'s place', () => {
    const dir = addons()
    expect(saveLoveInterest(dir, base.content, mira)).toEqual([])
    expect(saveLoveInterest(dir, base.content, { ...faye, age: 23 })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    expect(content.loveInterests).toHaveLength(base.content.loveInterests.length + 1)
    expect(content.loveInterests.find((li) => li.id === 'faye')?.age).toBe(23)
    expect(info.loveInterests).toMatchObject({ mira: 'addon', faye: 'override', tink: 'base' })
    // Her place in the order is kept; newcomers go at the end.
    expect(content.loveInterests.map((li) => li.id).indexOf('faye')).toBe(base.content.loveInterests.indexOf(faye))
    expect(content.loveInterests.at(-1)?.id).toBe('mira')

    expect(deleteLoveInterest(dir, 'faye')).toEqual([])
    expect(loadWithAddons(packDir, dir).content.loveInterests.find((li) => li.id === 'faye')?.age).toBe(faye.age)
    expect(deleteLoveInterest(dir, 'faye')).toEqual(['There is no add-on file for that character.'])
  })

  it('leaves out an add-on that is broken, and says why, without stopping the game', () => {
    const dir = addons()
    mkdirSync(join(dir, 'love-interests'), { recursive: true })
    writeFileSync(join(dir, 'love-interests', 'broken.json'), '{ not json')
    writeFileSync(join(dir, 'love-interests', 'child.json'), JSON.stringify({ ...mira, id: 'child', age: 17 }))
    writeFileSync(join(dir, 'love-interests', 'lost.json'), JSON.stringify({ ...mira, id: 'lost', schedule: [{ locationId: 'the-moon' }] }))
    writeFileSync(join(dir, 'love-interests', 'mira.json'), JSON.stringify(mira))
    const { content, info } = loadWithAddons(packDir, dir)
    expect(content.loveInterests.map((li) => li.id).filter((id) => !(id in base.info.loveInterests))).toEqual(['mira'])
    expect(info.issues).toHaveLength(3)
    expect(info.issues.join('\n')).toMatch(/broken\.json/)
    expect(info.issues.join('\n')).toMatch(/child\.json was left out/)
    expect(info.issues.join('\n')).toMatch(/lost\.json was left out/)
  })
})

describe('saveLoveInterest', () => {
  it('refuses what the game could not load, and writes nothing', () => {
    const dir = addons()
    expect(saveLoveInterest(dir, base.content, { ...mira, age: 17 })[0]).toMatch(/age/)
    expect(saveLoveInterest(dir, base.content, { ...mira, id: 'Mira Vale' })[0]).toMatch(/lower-case letters/)
    expect(saveLoveInterest(dir, base.content, { ...mira, id: '../escape' })[0]).toMatch(/lower-case letters/)
    expect(saveLoveInterest(dir, base.content, { ...mira, name: '  ' })).toEqual(['A name is needed.'])
    expect(saveLoveInterest(dir, base.content, { ...mira, traitIds: ['no-such-trait'] }).join(' ')).toMatch(/no-such-trait/)
    expect(saveLoveInterest(dir, base.content, { ...mira, defaultOutfitId: 'missing' }).length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'love-interests'))).toBe(false)
  })

  it('writes one readable file per character', () => {
    const dir = addons()
    saveLoveInterest(dir, base.content, mira)
    const written = JSON.parse(readFileSync(join(dir, 'love-interests', 'mira.json'), 'utf8'))
    expect(written).toMatchObject({ id: 'mira', name: 'Mira Vale', age: faye.age })
  })
})

describe('traits', () => {
  it('can be added, changed, and removed when nobody has them', () => {
    const dir = addons()
    expect(saveTrait(dir, { id: 'star-gazer', name: 'Star-gazer', definition: 'Happiest looking up.' })).toEqual([])
    expect(saveTrait(dir, { id: 'Bad Id', name: 'x', definition: 'y' })[0]).toMatch(/lower-case letters/)
    let loaded = loadWithAddons(packDir, dir)
    expect(loaded.info.traits['star-gazer']).toBe('addon')

    expect(saveLoveInterest(dir, loaded.content, { ...mira, traitIds: ['star-gazer'] })).toEqual([])
    loaded = loadWithAddons(packDir, dir)
    const baseIds = Object.keys(base.info.traits)
    expect(deleteTrait(dir, loaded.content, baseIds, 'star-gazer')).toEqual(['Mira Vale has this trait. Take it off them first.'])

    expect(saveLoveInterest(dir, loaded.content, mira)).toEqual([])
    expect(deleteTrait(dir, loadWithAddons(packDir, dir).content, baseIds, 'star-gazer')).toEqual([])
    expect(loadWithAddons(packDir, dir).info.traits['star-gazer']).toBeUndefined()
    expect(deleteTrait(dir, base.content, baseIds, baseIds[0])).toEqual(['That trait is not an add-on.'])
  })

  it('can replace a built-in one, and be put back', () => {
    const dir = addons()
    const [first] = base.content.traits
    saveTrait(dir, { ...first, definition: 'Rewritten.' })
    const loaded = loadWithAddons(packDir, dir)
    expect(loaded.content.traits.find((t) => t.id === first.id)?.definition).toBe('Rewritten.')
    expect(loaded.info.traits[first.id]).toBe('override')
    expect(deleteTrait(dir, loaded.content, Object.keys(base.info.traits), first.id)).toEqual([])
    expect(loadWithAddons(packDir, dir).content.traits.find((t) => t.id === first.id)?.definition).toBe(first.definition)
  })
})

describe('artwork', () => {
  it('is copied into the character\'s folder under a tidy name, never over another file', () => {
    const dir = addons()
    const source = join(mkdtempSync(join(tmpdir(), 'bh-art-')), 'Happy Face (final).PNG')
    writeFileSync(source, 'png')
    expect(importAsset(dir, 'mira', source)).toBe('addons/sprites/mira/happy-face-final.png')
    expect(importAsset(dir, 'mira', source)).toBe('addons/sprites/mira/happy-face-final-2.png')
    expect(readFileSync(join(dir, 'sprites', 'mira', 'happy-face-final.png'), 'utf8')).toBe('png')
    expect(() => importAsset(dir, '../x', source)).toThrow(/usable id/)
  })

  it('is served from the add-on folder, and nothing outside it', () => {
    const dir = addons()
    expect(resolveContentPath(packDir, 'content://pack/addons/sprites/mira/a.png', dir)).toBe(join(dir, 'sprites', 'mira', 'a.png'))
    expect(resolveContentPath(packDir, 'content://pack/sprites/faye/a.png', dir)).toBe(join(packDir, 'sprites', 'faye', 'a.png'))
    // Dots that try to climb out are folded away by the URL itself, and land back inside the pack.
    expect(resolveContentPath(packDir, 'content://pack/addons/%2e%2e/%2e%2e/secret.txt', dir)).toBe(join(packDir, 'secret.txt'))
    expect(resolveContentPath(packDir, 'content://pack/addons/..%5c..%5csecret.txt', dir)?.startsWith(dir)).not.toBe(false)
  })
})

describe('NPCs as add-ons', () => {
  const helga = base.content.npcs.find((npc) => npc.id === 'helga')!

  it('are saved like any character: new ones added, a built-in one replaced, and put back', () => {
    const dir = addons()
    expect(saveLoveInterest(dir, base.content, { ...helga, id: 'orla', name: 'Orla', role: 'barista at Spell & Sip' })).toEqual([])
    expect(saveLoveInterest(dir, base.content, { ...helga, age: 61 })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    expect(content.npcs).toHaveLength(base.content.npcs.length + 1)
    expect(content.loveInterests).toHaveLength(base.content.loveInterests.length)
    expect(content.npcs.find((npc) => npc.id === 'helga')?.age).toBe(61)
    expect(info.loveInterests).toMatchObject({ orla: 'addon', helga: 'override', bryn: 'base', faye: 'base' })
    // An NPC is not given a love interest's outfits.
    expect(content.npcs.find((npc) => npc.id === 'orla')?.outfits.map((o) => o.id)).toEqual(helga.outfits.map((o) => o.id))
    // They are kept with the love interests, told apart by their kind.
    expect(existsSync(join(dir, 'love-interests', 'orla.json'))).toBe(true)
    expect(existsSync(join(dir, 'npcs'))).toBe(false)

    expect(deleteLoveInterest(dir, 'helga')).toEqual([])
    expect(loadWithAddons(packDir, dir).content.npcs.find((npc) => npc.id === 'helga')?.age).toBe(helga.age)
  })

  it('become love interests by a change of kind, keeping everything they had and their job', () => {
    const dir = addons()
    expect(saveLoveInterest(dir, base.content, { ...helga, kind: 'outsider' })).toEqual([])
    const { content } = loadWithAddons(packDir, dir)
    expect(content.npcs.some((npc) => npc.id === 'helga')).toBe(false)
    const promoted = content.loveInterests.find((li) => li.id === 'helga')!
    expect(promoted).toMatchObject({ name: helga.name, role: helga.role, appearance: helga.appearance, ai: { knowledge: helga.ai.knowledge } })
    // She is given the outfits every love interest has, and is still the boss of her job.
    expect(promoted.outfits.map((o) => o.id)).toEqual(expect.arrayContaining(['default', 'pregnant', 'nude', 'nude-pregnant']))
    expect(content.jobs?.jobs.some((job) => job.bossId === 'helga')).toBe(true)
    // And back again.
    expect(saveLoveInterest(dir, content, { ...promoted, kind: 'npc' })).toEqual([])
    expect(loadWithAddons(packDir, dir).content.npcs.some((npc) => npc.id === 'helga')).toBe(true)
  })

  it('are refused when they would not load', () => {
    const dir = addons()
    expect(saveLoveInterest(dir, base.content, { ...helga, id: 'Not Usable' })[0]).toContain('lower-case')
    expect(saveLoveInterest(dir, base.content, { ...helga, id: 'orla', schedule: [{ locationId: 'nowhere' }] }).length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'love-interests'))).toBe(false)
  })
})

describe('tidying up on save', () => {
  it('deletes the pictures a character no longer uses, and nobody else\'s', () => {
    const dir = addons()
    const put = (path: string) => {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), 'x')
    }
    for (const file of ['sprites/mira/neutral.png', 'sprites/mira/neutral-old.png', 'sprites/mira/dance.mp4', 'sprites/mira/room.png', 'sprites/mira/birth.png', 'sprites/mira/walk.png']) put(file)
    for (const file of ['generated/backgrounds/mira/try-1.png', 'generated/backgrounds/mira/kept.png', 'sprites/faye/hers.png']) put(file)
    const saved = {
      id: 'mira',
      outfits: [{ id: 'default', name: 'Usual', description: '', pregnant: false, sprites: { neutral: { image: 'addons/sprites/mira/neutral.png', description: '' } } }],
      animations: [{ id: 'dance', name: 'Dance', description: '', clip: 'addons/sprites/mira/dance.mp4', loop: true }],
      room: { images: { night: 'addons/generated/backgrounds/mira/kept.png' } },
      birthPicture: 'addons/sprites/mira/birth.png',
      walkSprite: 'addons/sprites/mira/walk.png'
    }
    expect(removeUnusedAssets(dir, saved).sort()).toEqual(['neutral-old.png', 'room.png', 'try-1.png'])
    expect(existsSync(join(dir, 'sprites/mira/neutral.png'))).toBe(true)
    expect(existsSync(join(dir, 'sprites/mira/dance.mp4'))).toBe(true)
    // Her picture of a birth is hers to keep.
    expect(existsSync(join(dir, 'sprites/mira/birth.png'))).toBe(true)
    expect(existsSync(join(dir, 'sprites/mira/walk.png'))).toBe(true)
    expect(existsSync(join(dir, 'generated/backgrounds/mira/kept.png'))).toBe(true)
    expect(existsSync(join(dir, 'sprites/faye/hers.png'))).toBe(true)
    expect(removeUnusedAssets(dir, saved)).toEqual([])
  })
})

describe('location add-ons', () => {
  const cafe = base.content.locations.find((location) => location.id === 'spell-and-sip')!

  it('changes one of the game\'s own places, pictures included, and puts it back', () => {
    const dir = addons()
    expect(Object.values(base.info.locations).every((origin) => origin === 'base')).toBe(true)
    const views = [...cafe.backgrounds, { id: 'counter', name: 'Counter', images: { night: 'addons/generated/backgrounds/spell-and-sip/counter.png' } }]
    expect(saveLocation(dir, base.content, { ...cafe, description: 'A coffee shop with warded booths.', private: true, backgrounds: views })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    // The same places, in the same order: one of them changed.
    expect(content.locations.map((location) => location.id)).toEqual(base.content.locations.map((location) => location.id))
    expect(content.locations.find((location) => location.id === 'spell-and-sip')).toMatchObject({ description: 'A coffee shop with warded booths.', private: true })
    expect(content.locations.find((location) => location.id === 'spell-and-sip')?.backgrounds.at(-1)).toMatchObject({ id: 'counter', images: { night: 'addons/generated/backgrounds/spell-and-sip/counter.png' } })
    expect(info.locations).toMatchObject({ 'spell-and-sip': 'override', library: 'base' })

    expect(deleteLocation(dir, 'spell-and-sip')).toEqual([])
    expect(loadWithAddons(packDir, dir).content.locations.find((location) => location.id === 'spell-and-sip')).toEqual(cafe)
    expect(deleteLocation(dir, 'library')).toEqual(['That location has not been changed.'])
  })

  it('refuses a place the game does not have, or one that would not load', () => {
    const dir = addons()
    expect(saveLocation(dir, base.content, { ...cafe, id: 'moon-base' })).toEqual(['There is no such location in the game.'])
    expect(saveLocation(dir, base.content, { ...cafe, name: ' ' })).toEqual(['A name is needed.'])
    expect(saveLocation(dir, base.content, { ...cafe, backgrounds: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] })[0]).toContain('id of its own')
    // A picture is for the day or for the night, and nothing else.
    expect(saveLocation(dir, base.content, { ...cafe, backgrounds: [{ id: 'a', name: 'A', images: { teatime: 'x.png' } }] }).length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'locations'))).toBe(false)
  })
})

describe('the player as an add-on', () => {
  it('changes how a new game starts him, room and all, and puts him back', () => {
    const dir = addons()
    expect(base.info.playerChanged).toBe(false)
    const room = { name: 'a single room on the third floor', description: 'A narrow bed under a round window.', locationId: base.content.newGame.locationId, images: { day: 'addons/sprites/player/room.png', night: 'addons/sprites/player/room-night.png' } }
    expect(savePlayer(dir, base.content, { ...base.content.newGame, player: { ...base.content.newGame.player, name: 'Wren', money: 75 }, room })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    expect(info.playerChanged).toBe(true)
    expect(content.newGame).toMatchObject({ player: { name: 'Wren', money: 75 }, room })
    // Everyone else is as they were.
    expect(content.loveInterests.length).toBe(base.content.loveInterests.length)
    expect(content.npcs.length).toBe(base.content.npcs.length)

    // What the game could not start with is refused, and nothing is written.
    expect(savePlayer(dir, base.content, { ...base.content.newGame, player: { ...base.content.newGame.player, name: '  ' } })).toEqual(['He needs a name to start with.'])
    expect(savePlayer(dir, base.content, { ...base.content.newGame, locationId: 'nowhere' })[0]).toMatch(/nowhere/)
    expect(savePlayer(dir, base.content, { ...base.content.newGame, room: { ...room, locationId: 'nowhere' } })[0]).toMatch(/nowhere/)
    expect(loadWithAddons(packDir, dir).content.newGame.player.name).toBe('Wren')

    expect(resetPlayer(dir)).toEqual([])
    expect(loadWithAddons(packDir, dir).content.newGame).toEqual(base.content.newGame)
    expect(resetPlayer(dir)).toEqual(['The player has not been changed.'])
  })
})

describe('jobs, which are the game\'s own', () => {
  it('are added, changed and taken out in the game\'s jobs file, and refused when they would not load', async () => {
    const { deleteJob, saveJob } = await import('./addons')
    // A pack folder of its own to write in, holding only the jobs file: the rest is checked against the content as loaded.
    const pack = mkdtempSync(join(tmpdir(), 'bh-jobs-'))
    const shipped = base.content.jobs!
    writeFileSync(join(pack, 'jobs.json'), JSON.stringify({ energyPerHour: shipped.energyPerHour, jobs: [shipped.jobs[0]] }))
    const read = () => JSON.parse(readFileSync(join(pack, 'jobs.json'), 'utf8')) as { energyPerHour: number; jobs: { id: string; hourlyRate: number }[] }

    const porter = { ...shipped.jobs[0], id: 'night-porter', title: 'Night porter', hourlyRate: 11 }
    expect(saveJob(pack, base.content, porter)).toEqual([])
    expect(read().jobs.map((job) => job.id)).toEqual([shipped.jobs[0].id, 'night-porter'])
    // The rules of the file are left as they were.
    expect(read().energyPerHour).toBe(shipped.energyPerHour)

    // Saved again, it takes its own place and is not added twice.
    expect(saveJob(pack, base.content, { ...porter, hourlyRate: 12 })).toEqual([])
    expect(read().jobs.find((job) => job.id === 'night-porter')?.hourlyRate).toBe(12)
    expect(read().jobs).toHaveLength(2)

    expect(saveJob(pack, base.content, { ...porter, id: 'Bad Id' })[0]).toMatch(/lower-case letters/)
    expect(saveJob(pack, base.content, { ...porter, title: ' ' })).toEqual(['A title is needed.'])
    expect(saveJob(pack, base.content, { ...porter, locationId: 'nowhere' })).toEqual(['Choose where the job is.'])
    expect(saveJob(pack, base.content, { ...porter, bossId: 'nobody' })).toEqual(['Choose who he answers to.'])
    expect(saveJob(pack, base.content, { ...porter, shifts: [] }).length).toBeGreaterThan(0)
    expect(read().jobs).toHaveLength(2)

    expect(deleteJob(pack, 'night-porter')).toEqual([])
    expect(read().jobs.map((job) => job.id)).toEqual([shipped.jobs[0].id])
    expect(deleteJob(pack, 'night-porter')).toEqual(['There is no such job.'])
  })
})

describe('societies, which are the game\'s own', () => {
  it('are added, changed and taken out in the game\'s societies file, and hold students only, and no more than they may', async () => {
    const { deleteSociety, saveSociety } = await import('./addons')
    const pack = mkdtempSync(join(tmpdir(), 'bh-societies-'))
    const shipped = base.content.societies!
    writeFileSync(join(pack, 'societies.json'), JSON.stringify({ fairId: shipped.fairId, societies: [shipped.societies[0]] }))
    const read = () => JSON.parse(readFileSync(join(pack, 'societies.json'), 'utf8')) as { fairId: string; societies: { id: string; memberIds: string[] }[] }

    const chess = { ...shipped.societies[0], id: 'chess-club', name: 'the Chess Club', memberIds: ['tamsin'] }
    expect(saveSociety(pack, base.content, chess)).toEqual([])
    expect(read().societies.map((society) => society.id)).toEqual([shipped.societies[0].id, 'chess-club'])
    expect(read().fairId).toBe(shipped.fairId)

    expect(saveSociety(pack, base.content, { ...chess, memberIds: ['tamsin', 'vespera'] })).toEqual(['Only students can belong to a society.'])
    expect(saveSociety(pack, base.content, { ...chess, memberIds: ['tamsin', 'daphne', 'lira'] })[0]).toMatch(/a society holds 2/)
    expect(saveSociety(pack, base.content, { ...chess, locationId: 'nowhere' })).toEqual(['Choose where it meets.'])
    expect(read().societies.find((society) => society.id === 'chess-club')?.memberIds).toEqual(['tamsin'])

    expect(deleteSociety(pack, 'chess-club')).toEqual([])
    expect(deleteSociety(pack, 'chess-club')).toEqual(['There is no such society.'])
  })
})

describe('the catalogue, as characters are added', () => {
  it('is laid out again for a new student, with the old seed, and given back to the game once she is gone', () => {
    const dir = addons()
    // A student of a full subject: she has her week all the same.
    const politics = base.content.loveInterests.find((li) => li.studies?.code === 'POL')!.studies!
    const nova = { ...faye, id: 'nova', name: 'Nova Lark', handle: undefined, studies: { ...politics, level: 1 } }
    expect(saveLoveInterest(dir, base.content, nova)).toEqual([])
    const withHer = loadWithAddons(packDir, dir).content
    expect(rebuildCatalogue(packDir, dir, withHer, false)).toBe(true)
    const rebuilt = loadWithAddons(packDir, dir).content
    expect(rebuilt.catalogue!.seed).toBe(base.content.catalogue!.seed)
    const hers = rebuilt.catalogue!.courses.filter((course) => course.studentIds.includes('nova'))
    expect(hers).toHaveLength(4)
    expect(hers.filter((course) => course.code === 'POL')).toHaveLength(2)
    // Built for who is there, it is not built again.
    expect(rebuildCatalogue(packDir, dir, rebuilt, false)).toBe(false)
    // Without her the game's own catalogue is right again, and the add-on one goes.
    expect(deleteLoveInterest(dir, 'nova')).toEqual([])
    expect(rebuildCatalogue(packDir, dir, loadWithAddons(packDir, dir).content, false)).toBe(true)
    expect(existsSync(join(dir, 'catalogue.json'))).toBe(false)
  })
})

describe('a subject made in the editor', () => {
  const topics = Array.from({ length: 6 }, (_, i) => ({ title: `Class ${i + 1}`, content: 'What is taught.', question: { ask: `Question ${i + 1}?`, answer: 'Yes', wrong: ['No', 'Maybe', 'Never'] } }))
  const course = (number: string, id: string) => ({ number, title: `Astronomy ${number}`, topics, skill: { id, name: id, description: 'You read the sky.', passive: { kind: 'training', amount: 1.5, stats: ['wisdom'] } } })
  const astronomy = { code: 'AST', subject: 'Astronomy', college: 'observatory', stats: ['wisdom'], courses: [course('101', 'star-reader'), course('130', 'sky-chart')] }
  const observatory = { id: 'observatory', name: 'the Observatory' }

  it('joins the University with a college of its own, is read by a student made for it, and gives her a full week', () => {
    const dir = addons()
    expect(saveMajor(dir, base.content, { major: astronomy, college: observatory })).toEqual([])
    const loaded = loadWithAddons(packDir, dir)
    expect(loaded.info.issues).toEqual([])
    expect(loaded.info.majors).toMatchObject({ AST: 'addon', POL: 'base' })
    expect(loaded.content.curriculum!.majors.find((major) => major.code === 'AST')?.college).toBe('observatory')
    expect(loaded.content.skills.some((skill) => skill.id === 'star-reader')).toBe(true)
    // A student of it is filled in from it, and the term is laid out for her.
    const vega = { ...faye, id: 'vega', name: 'Vega Lune', handle: undefined, studies: { subject: 'Astronomy', code: 'AST', level: 1, stats: ['wisdom'], practical: false } }
    expect(saveLoveInterest(dir, loaded.content, vega)).toEqual([])
    const withHer = loadWithAddons(packDir, dir).content
    expect(rebuildCatalogue(packDir, dir, withHer, false)).toBe(true)
    const hers = loadWithAddons(packDir, dir).content.catalogue!.courses.filter((one) => one.studentIds.includes('vega'))
    expect(hers).toHaveLength(4)
    expect(hers.filter((one) => one.code === 'AST').map((one) => one.number).sort()).toEqual(['AST 101', 'AST 130'])
    // Not taken away while she reads it.
    expect(deleteMajor(dir, withHer, 'AST')[0]).toMatch(/Vega reads or teaches it/)
    expect(deleteMajor(dir, withHer, 'POL')).toEqual(['That subject was not made in the editor.'])
  })

  it('is refused when it could not be one, and left out of the game, saying why, when its file is wrong', () => {
    const dir = addons()
    expect(saveMajor(dir, base.content, { major: { ...astronomy, college: 'arts-and-humanities', courses: [course('101', 'star-reader')] } })[0]).toMatch(/at least 2 courses/)
    expect(saveMajor(dir, base.content, { major: { ...astronomy, college: 'arts-and-humanities', code: 'astro' } })[0]).toMatch(/capital letters/)
    expect(saveMajor(dir, base.content, { major: astronomy })[0]).toMatch(/college/)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'curriculum.json'), JSON.stringify({ colleges: [], majors: [{ ...astronomy, college: 'arts-and-humanities', courses: [course('101', 'star-reader')] }] }))
    const loaded = loadWithAddons(packDir, dir)
    expect(loaded.info.issues[0]).toMatch(/AST was left out/)
    expect(loaded.content.curriculum!.majors.some((major) => major.code === 'AST')).toBe(false)
  })
})
