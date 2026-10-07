import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveContentPath } from './assets'
import { deleteLocation, deleteLoveInterest, deleteTrait, importAsset, loadWithAddons, removeUnusedAssets, saveLocation, saveLoveInterest, saveTrait } from './addons'

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
    for (const file of ['sprites/mira/neutral.png', 'sprites/mira/neutral-old.png', 'sprites/mira/dance.mp4', 'sprites/mira/room.png']) put(file)
    for (const file of ['generated/backgrounds/mira/try-1.png', 'generated/backgrounds/mira/kept.png', 'sprites/faye/hers.png']) put(file)
    const saved = {
      id: 'mira',
      outfits: [{ id: 'default', name: 'Usual', description: '', pregnant: false, sprites: { neutral: { image: 'addons/sprites/mira/neutral.png', description: '' } } }],
      animations: [{ id: 'dance', name: 'Dance', description: '', video: 'addons/sprites/mira/dance.mp4', loop: true }],
      room: { background: 'addons/generated/backgrounds/mira/kept.png' }
    }
    expect(removeUnusedAssets(dir, saved).sort()).toEqual(['neutral-old.png', 'room.png', 'try-1.png'])
    expect(existsSync(join(dir, 'sprites/mira/neutral.png'))).toBe(true)
    expect(existsSync(join(dir, 'sprites/mira/dance.mp4'))).toBe(true)
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
