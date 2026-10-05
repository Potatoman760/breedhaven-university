import { validateContentPack, type ContentPack } from '../model'

/**
 * A deliberately odd content pack for tests: a 5-day year, 3-day week and 20-hour
 * day, so nothing passes by accident of looking like the real-world calendar.
 */
export function rawFixture() {
  return {
    calendar: {
      months: [
        { id: 'a', name: 'A', days: 3 },
        { id: 'b', name: 'B', days: 2 }
      ],
      weekdays: ['One', 'Two', 'Three'],
      hoursPerDay: 20,
      periods: [
        { id: 'day', name: 'Day', startHour: 5 },
        { id: 'night', name: 'Night', startHour: 15 }
      ],
      start: { year: 1, month: 'a', day: 2, hour: 6 },
      startWeekday: 1,
      lengthDays: 7,
      events: [{ id: 'feast', name: 'the Feast', month: 'b', day: 1 }]
    },
    relationships: {
      stages: [
        { id: 'stranger', name: 'Stranger', minAffection: 0 },
        { id: 'friend', name: 'Friend', minAffection: 30 },
        { id: 'lover', name: 'Lover', minAffection: 80 }
      ]
    },
    traits: [{ id: 'shy', name: 'Shy', definition: 'Slow to open up.' }],
    locations: [
      { id: 'home', name: 'Home' },
      { id: 'shop', name: 'the Shop', open: { fromHour: 5, toHour: 15 } }
    ],
    activities: [
      {
        id: 'nap',
        name: 'Nap',
        durationHours: 3,
        locationId: 'home',
        effects: [{ type: 'energy', amount: 50 }]
      },
      {
        id: 'work',
        name: 'Work',
        durationHours: 4,
        locationId: 'shop',
        requirements: [{ type: 'energy', min: 20 }],
        effects: [
          { type: 'money', amount: 10 },
          { type: 'energy', amount: -20 }
        ]
      },
      {
        id: 'date',
        name: 'Date',
        durationHours: 2,
        withLoveInterest: 'required',
        requirements: [{ type: 'stage', min: 'friend' }],
        effects: [{ type: 'meter', meter: 'affection', amount: 5 }]
      },
      {
        id: 'stargaze',
        name: 'Stargaze',
        durationHours: 1,
        availability: { weekdays: ['Two'], periods: ['night'] }
      }
    ],
    codex: [
      { id: 'town', title: 'Town', category: 'places', content: 'A small town.', alwaysInclude: true, priority: 1 },
      { id: 'dragons', title: 'Dragons', category: 'history', content: 'Dragons are extinct.', keywords: ['dragon'], priority: 5 },
      { id: 'shop-lore', title: 'Shop history', category: 'places', content: 'The shop is old.', relatedLocationIds: ['shop'] },
      {
        id: 'secret',
        title: 'The last dragon',
        category: 'secrets',
        content: 'Ana is a dragon.',
        keywords: ['dragon'],
        priority: 9,
        startsUnlocked: false,
        unlockWhen: [{ type: 'stage', loveInterestId: 'ana', min: 'friend' }]
      }
    ],
    loveInterests: [
      {
        id: 'ana',
        name: 'Ana',
        age: 25,
        pronouns: 'she/her',
        personality: 'Dry and watchful.',
        traitIds: ['shy'],
        outfits: [{ id: 'default', name: 'Dress', description: 'a red dress' }],
        defaultOutfitId: 'default',
        schedule: [{ periods: ['day'], locationId: 'shop' }],
        ai: {
          speechPattern: 'Speaks in riddles.',
          secrets: [{ text: 'Is secretly a dragon.', revealWhen: [{ type: 'stage', min: 'friend' }] }],
          stageNotes: { friend: 'Jokes freely.' }
        }
      }
    ],
    map: {
      name: 'Town',
      image: 'maps/town.png',
      travelHours: 2,
      pins: [
        { locationId: 'home', x: 20, y: 50 },
        { locationId: 'shop', x: 80, y: 50 }
      ]
    },
    newGame: {
      player: { name: 'Pat', energy: 50, maxEnergy: 100, money: 0 },
      locationId: 'home'
    }
  }
}

export function fixture(): ContentPack {
  return validateContentPack(rawFixture())
}
