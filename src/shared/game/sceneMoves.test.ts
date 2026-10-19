import { describe, expect, it } from 'vitest'
import type { ContentPack, Scene } from '../model'
import { buildCharacterPrompt } from './prompt'
import { parseDirectives, sceneBaseline } from './scene'
import {
  describePlace,
  describeRoom,
  describeWeather,
  findDestination,
  movedScene,
  moveState,
  passSceneTime,
  roomBackdrop,
  roomOwner,
  sceneHours,
  sceneDestinations,
  PLAYER_ROOM,
  playerRoom,
  sceneView
} from './sceneMoves'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// The fixture: home (always open) and the shop (05:00 to 15:00), a two-hour walk apart,
// on a 20-hour day that starts at 06:00 at home. Here the shop has a view indoors and one
// outside, and Ana has a room of her own over the shop.
const base = fixture()
const rain = { id: 'rain', name: 'Rain', description: 'A steady rain.', icon: 'rain', effect: 'rain' as const, weight: 1 }
const content: ContentPack = {
  ...base,
  calendar: { ...base.calendar, weather: [rain] },
  loveInterests: [
    { ...base.loveInterests[0], room: { name: 'a loft over the shop', description: 'A bed, a lamp, a great many books.', locationId: 'shop' } }
  ],
  locations: base.locations.map((l) =>
    l.id === 'shop'
      ? {
          ...l,
          description: 'Shelves to the ceiling.',
          backgrounds: [
            { id: 'counter', name: 'The counter', images: { day: 'shop.png' }, indoors: true },
            { id: 'yard', name: 'The yard', images: { day: 'yard.png' } }
          ]
        }
      : l
  )
}
const state = createInitialState(content)
const scene: Scene = {
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  loveInterestId: 'ana',
  companionIds: [],
  npc: false,
  nsfw: false,
  beats: [{ activityName: 'Tea', locationName: 'Home' }],
  messages: [],
  gifts: [],
  conceived: [], departed: []
}
const ids = (at = state, of: Scene = scene) => sceneDestinations(content, at, of).map((d) => d.id)

describe('where a scene can go', () => {
  it('is the rooms of those in it, then anywhere else that is open', () => {
    expect(ids()).toEqual(['room-of-ana', 'shop'])
    expect(sceneDestinations(content, state, scene)[0]).toMatchObject({
      name: "Ana's room: a loft over the shop, at the Shop",
      locationId: 'shop',
      roomOf: 'ana',
      indoors: true
    })
    // At 15:00 the shop has shut, and her room is in it.
    expect(ids({ ...state, time: 8 })).toEqual(['room-of-ana', 'shop'])
    expect(ids({ ...state, time: 9 })).toEqual([])
  })

  it('offers her room from the building it is in, and the way back down from it', () => {
    const atShop = { ...state, locationId: 'shop' }
    expect(ids(atShop)).toEqual(['room-of-ana', 'home'])
    // From her room the scene can go back down to the shop itself.
    expect(ids(atShop, { ...scene, roomOf: 'ana' })).toEqual(['home', 'shop'])
  })

  it('is nowhere for an NPC, who stays at her post', () => {
    expect(ids(state, { ...scene, npc: true })).toEqual([])
  })

  it('is chosen by id from that list and nothing else', () => {
    const open = sceneDestinations(content, state, scene)
    expect(findDestination(open, ' ROOM-OF-ANA ')?.roomOf).toBe('ana')
    expect(findDestination(open, 'shop')?.id).toBe('shop')
    expect(findDestination(open, 'home')).toBeUndefined()
    expect(findDestination(open, 'the moon')).toBeUndefined()
  })

  it('takes everyone there, in no time, and closes what was being done', () => {
    const [room, shop] = sceneDestinations(content, state, scene)
    expect(moveState(state, shop)).toMatchObject({ locationId: 'shop', time: 0 })

    const upstairs = movedScene({ ...scene, backgroundId: 'yard' }, room)
    expect(upstairs.roomOf).toBe('ana')
    expect(upstairs.backgroundId).toBeUndefined()
    expect(upstairs.beats).toEqual([
      { activityName: 'Tea', locationName: 'Home', finished: true },
      { activityName: 'arrived', locationName: "Ana's room, a loft over the shop, at the Shop" }
    ])
    expect(roomOwner(content, upstairs)?.id).toBe('ana')
    // Going on from her room to the shop leaves it.
    expect(movedScene(upstairs, shop).roomOf).toBeUndefined()
    expect(roomOwner(content, scene)).toBeUndefined()
    // A view the scene insisted on, and a picture it was set in, are left where they were.
    const set = movedScene({ ...scene, viewId: 'yard', picture: 'bed.png', returnTo: 'fair' }, shop)
    expect(set.viewId).toBeUndefined()
    expect(set.returnTo).toBeUndefined()
    expect(set.picture).toBeUndefined()
  })

  it('lets hours pass in the story, within reason', () => {
    expect(passSceneTime(content, state, 3).time).toBe(3)
    expect(passSceneTime(content, state, 2.9).time).toBe(2)
    expect(passSceneTime(content, state, 99).time).toBe(12)
    expect(passSceneTime(content, state, 0)).toBe(state)
    expect(passSceneTime(content, state, Number.NaN)).toBe(state)
  })

  it('is done with tools: a move or hours written as a tag are dropped', () => {
    const stray = parseDirectives('Come on, then.\n[MOVE: shop]\n[HOURS: 3]\n[END SCENE]')
    expect(stray).toMatchObject({ text: 'Come on, then.', ended: true })
    expect('moveTo' in stray || 'hours' in stray).toBe(false)
  })

  it('knows how long a scene has taken: its opening activity, and everything since', () => {
    const began = { ...scene, baseline: sceneBaseline(state, 'ana') }
    expect(sceneHours(state, began)).toBe(0)
    // Two hours of tea, a move that takes no time, three hours more.
    const later = passSceneTime(content, moveState({ ...state, time: 2 }, sceneDestinations(content, { ...state, time: 2 }, scene)[1]), 3)
    expect(sceneHours(later, began)).toBe(5)
  })
})

describe('what the character is told of where she is', () => {
  const input = { content, state, loveInterestId: 'ana', sceneBeats: scene.beats }

  it('names the place, the spot in it, and whether there is a roof', () => {
    const shop = content.locations.find((l) => l.id === 'shop')!
    expect(describePlace(shop, shop.backgrounds[0])).toBe('the Shop, the counter. You are indoors, under a roof. Shelves to the ceiling.')
    expect(describePlace(shop, shop.backgrounds[1])).toBe('the Shop, the yard. You are out of doors, under the open sky. Shelves to the ceiling.')
    // A place with no views goes by what the place itself says.
    expect(describePlace({ ...shop, indoors: true }, undefined)).toContain('You are indoors')
    // A view that says what it is has that said after the place.
    expect(describePlace(shop, { ...shop.backgrounds[0], description: 'The till is here.' })).toBe('the Shop, the counter. You are indoors, under a roof. Shelves to the ceiling. The till is here.')
    // A room is staged by its own picture, or by a view of the place it is in.
    expect(roomBackdrop({ name: 'a loft', description: '', locationId: 'shop', background: 'loft.png' }, 'k')).toEqual({ room: { image: 'loft.png', key: 'k' } })
    expect(roomBackdrop({ name: 'a loft', description: '', locationId: 'shop', viewId: 'yard' }, 'k')).toEqual({ viewId: 'yard' })
    expect(roomBackdrop(undefined, 'k')).toEqual({})
    expect(sceneView(content, { ...state, locationId: 'shop' })?.id).toBe('counter')
    expect(sceneView(content, { ...state, locationId: 'shop' }, 'yard')?.id).toBe('yard')
  })

  it('puts the weather on her or outside the window accordingly', () => {
    expect(describeWeather(rain, false)).toMatch(/^The weather today: Rain\. A steady rain\. You are out in it/)
    expect(describeWeather(rain, true)).toMatch(/^The weather outside today: Rain\. A steady rain\. You are indoors and out of it/)

    const atShop = { ...input, state: { ...state, locationId: 'shop' } }
    const inside = buildCharacterPrompt(atShop)
    expect(inside).toContain('You and Pat are at the Shop, the counter. You are indoors, under a roof.')
    expect(inside).toContain('The weather outside today: Rain.')
    const outside = buildCharacterPrompt({ ...atShop, backgroundId: 'yard' })
    expect(outside).toContain('You and Pat are at the Shop, the yard. You are out of doors')
    expect(outside).toContain('You are out in it')
  })

  it('describes her own room when the scene is in it, to her and to anyone with her', () => {
    const ana = content.loveInterests[0]
    const shop = content.locations.find((l) => l.id === 'shop')
    expect(describeRoom(ana, shop, 'ana')).toBe(
      'your room: a loft over the shop, at the Shop. You are indoors, in private, with the door shut. A bed, a lamp, a great many books.'
    )
    expect(describeRoom(ana, shop, 'bea')).toMatch(/^Ana's room: a loft over the shop/)

    // The yard view is out of doors, but a room never is.
    const prompt = buildCharacterPrompt({ ...input, state: { ...state, locationId: 'shop' }, roomOf: 'ana', backgroundId: 'yard' })
    expect(prompt).toContain('You and Pat are in your room: a loft over the shop, at the Shop.')
    expect(prompt).toContain('The weather outside today: Rain.')
  })

  it('says what is over and what is happening now, once the scene has moved', () => {
    const [room] = sceneDestinations(content, state, scene)
    const moved = movedScene(scene, room)
    const prompt = buildCharacterPrompt({ ...input, state: moveState(state, room), roomOf: 'ana', sceneBeats: moved.beats })
    expect(prompt).toContain("Earlier on this outing, and now over: Tea at Home. Now: arrived at Ana's room, a loft over the shop, at the Shop.")
    expect(buildCharacterPrompt(input)).toContain('So far on this outing together: Tea at Home.')
  })

  it('points to the move tool, and not for an NPC or in a note', () => {
    const prompt = buildCharacterPrompt(input)
    expect(prompt).toContain('## Moving on, and time passing')
    expect(prompt).toContain('without calling move_scene for it')
    expect(prompt).not.toContain('pass_time')
    expect(prompt).not.toContain('[MOVE:')
    expect(prompt).not.toContain('[HOURS')
    // How long the scene has run is told by the move_scene tool, and not here as well.
    expect(buildCharacterPrompt({ ...input, hoursSoFar: 2 })).not.toContain('hours so far')
    expect(buildCharacterPrompt({ ...input, mode: 'courier' })).not.toContain('Moving on')
    expect(buildCharacterPrompt({ ...input, npc: { role: 'a smith', knowledge: [] } })).not.toContain('Moving on')
  })
})

describe("the player's own room", () => {
  const roomed: ContentPack = { ...content, newGame: { ...content.newGame, room: { name: 'a small room under the eaves', description: 'A narrow bed and a desk.', locationId: 'home', background: 'addons/sprites/player/room.png' } } }

  it('is somewhere a scene can go, and is his while it is there', () => {
    const offered = sceneDestinations(roomed, state, scene)
    expect(offered.map((d) => d.id)).toEqual(['room-of-ana', 'room-of-player', 'shop'])
    const his = offered.find((d) => d.id === 'room-of-player')!
    expect(his).toMatchObject({ name: "Pat's room: a small room under the eaves, at Home", locationId: 'home', roomOf: PLAYER_ROOM, indoors: true })

    const there = movedScene(scene, his)
    expect(there.roomOf).toBe(PLAYER_ROOM)
    expect(playerRoom(roomed, there)?.background).toBe('addons/sprites/player/room.png')
    expect(playerRoom(roomed, scene)).toBeUndefined()
    // Once there it is not offered again, and the place it is in can be gone back down to.
    expect(sceneDestinations(roomed, state, there).map((d) => d.id)).toEqual(['room-of-ana', 'home', 'shop'])

    const prompt = buildCharacterPrompt({ content: roomed, state, loveInterestId: 'ana', roomOf: PLAYER_ROOM, sceneBeats: there.beats })
    expect(prompt).toContain("You and Pat are in Pat's room: a small room under the eaves, at Home. You are indoors, in private, with the door shut. A narrow bed and a desk.")
  })

  it('is nowhere without one', () => {
    expect(ids()).not.toContain('room-of-player')
  })
})

describe('the time shown while a scene is under way', () => {
  it('is the middle of it, fixed for as long as it lasts, and only for showing', async () => {
    const { sceneClock } = await import('./sceneMoves')
    const began = (time: number) => ({ baseline: { ...sceneBaseline(state, 'ana'), time } })
    // An hour from 14:00 (time 8) to 15:00 (time 9) is shown as half past.
    expect(sceneClock({ ...state, time: 9 }, began(8))).toEqual({ time: 8, minute: 30 })
    // Two hours are shown at the hour between; three, at half past the second.
    expect(sceneClock({ ...state, time: 10 }, began(8))).toEqual({ time: 9, minute: 0 })
    expect(sceneClock({ ...state, time: 11 }, began(8))).toEqual({ time: 9, minute: 30 })
    // One that has taken no time is shown at the hour it is.
    expect(sceneClock({ ...state, time: 8 }, began(8))).toEqual({ time: 8, minute: 0 })
  })
})
