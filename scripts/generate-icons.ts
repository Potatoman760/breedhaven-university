/**
 * Paints the emblems that stand for things in the interface: each job, place on the map, society, market stall, kind
 * of weather and kind of stop on the way down, and the pieces the drills' games are drawn with and the faces of the strangers in the one for charisma. Drawn as the item pictures are (big on a white card, cut out, made
 * small) and in their style, so that the two sit together. Each is put in its content file as `iconImage` as it is
 * made (`stopImages` in expedition.json). Not part of the app: run it from the project folder with `npm run icons`:
 *
 *   npm run icons                        every emblem not yet made
 *   npm run icons -- jobs places         only these groups (jobs, places, societies, stalls, weather, stops, and the
 *                                        drills' games: pieces, faces)
 *   npm run icons -- barista             only these, by id
 *   npm run icons -- --overwrite         make them again even where there is one already
 *   npm run icons -- --dry               print the prompts, and make nothing
 *
 * It can be stopped and run again: whatever has its emblem is passed over.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ComfyStore, generateArt } from '../src/main/comfy/studio'
import { PACK, cutOut, minutes, settingsFile } from './lib/pictures'
import { seedOf } from '../src/shared/game/seed'

const SUBJECT = 'icons'
const GIVE_UP_AFTER = 2
const SIZE = { width: 1024, height: 1024 }
const SHOWN = 256
const FRAMING = 'a single object, shown whole, centered, filling the frame, game inventory icon, thick clean outline, simple shapes, no people, no hands, no text\n\nplain white background'

// The game for wisdom draws one unlit candle for each in the row, and lays a flame over its wick when it flares, so that
// the candle itself never changes. The flames are drawn from one seed, so that they are one flame in different colours,
// each with the whole of its glow inside the picture.
const CANDLE = 'One tall white pillar candle standing in a small round brass holder, unlit: no flame, no glow, only a short black wick, a little melted wax at the top. The whole candle from its holder to its wick, upright, centered, with white space all around.'
const FLAME = (color: string) => `One bright ${color} magical candle flame on its own, with a soft round ${color} glow around it, and nothing else: no candle, no wick. The whole glow fits well inside the picture, with white space all around.`

// What each emblem shows. One that is missing here is drawn from its name.
const SUBJECTS: Record<string, Record<string, string>> = {
  jobs: {
    'market-stallhand': 'A wooden market crate piled with apples and turnips, a little price tag tied to it.',
    'commons-kitchen': 'A big steaming iron cooking pot with a ladle resting in it.',
    'halls-desk': 'A brass reception desk bell beside a small stack of letters and a ring of keys.',
    'store-tills': 'A paper shopping bag with a flower stamped on it, a receipt sticking out of the top.',
    'lumen-usher': 'A striped paper bag of popcorn with a torn red cinema ticket leaning against it.',
    'bathhouse-attendant': 'A folded stack of fluffy white towels with a sprig of eucalyptus on top.',
    'boba-maker': 'A tall plastic cup of pink bubble tea with tapioca pearls and a fat straw.',
    'garden-hand': 'A wooden-handled garden trowel and a small watering can.',
    'library-page': 'A neat stack of old leather-bound books with a ribbon bookmark.',
    'arcade-floor': 'A retro arcade joystick and two round buttons on a small panel, with a gold token.',
    'barista': 'A white coffee cup of latte with leaf latte art on a saucer, steam rising.',
    'armoury-assistant': 'A steel sword crossed over a round wooden shield.',
    'bar-staff': 'A foaming glass tankard of amber ale.',
    'clinic-reception': 'A white clipboard with a red cross on it and a pen clipped to it.',
    'gym-floor': 'A heavy iron dumbbell.',
    'club-door': 'A velvet rope on two brass posts in front of a glowing purple door.',
    'waiter': 'A silver serving cloche on a tray, a little flame peeking from under it.',
    'foundry-technician': 'A glass alchemy flask of glowing blue liquid with a brass gauge on its neck.',
    'research-assistant': 'An open archive box of rolled scrolls and papers with a magnifying glass.'
  },
  places: {
    'great-court': 'A grand stone university gatehouse with an arched entrance and two towers.',
    'lecture-halls': 'A black graduation mortarboard cap with a gold tassel resting on a book.',
    library: 'An old library building with tall arched windows, made of pale stone.',
    commons: 'A long wooden dining table set with bread, a pie and a jug, under a hanging lantern.',
    chapel: 'A small stone chapel with a bell tower and a round rose window.',
    tiltyard: 'A tournament pennant banner on a lance beside a round target.',
    'physic-garden': 'A walled garden gate of wrought iron, overgrown with herbs and flowers.',
    bathhouse: 'A round steaming bathhouse pool of turquoise water with stone steps.',
    foundry: 'A brick foundry chimney with a glowing magical furnace mouth and a brass gear.',
    'health-centre': 'A small white cottage with a red cross over its door.',
    dormitories: 'A cozy wooden bed with a patchwork quilt and a pillow.',
    'lantern-row': 'A row of glowing red paper lanterns strung on a cord.',
    'honeyed-bee-inn': 'A wooden tavern sign shaped like a fat bee, hanging from an iron bracket.',
    market: 'A striped market stall awning over a table of fruit.',
    'bloom-and-co': 'A shop front with a pink awning and a flower in the window.',
    'dawnbloom-house': 'A large timber-framed townhouse with flower boxes on its windows.',
    'spell-and-sip': 'A coffee cup with a little sparkling magic star rising out of it instead of steam.',
    'pixel-and-rune': 'A carved twenty-sided die glowing with a rune, beside a game cartridge.',
    'boba-blossom': 'A cup of bubble tea with a cherry blossom flower on its lid.',
    cauldron: 'A black iron cauldron bubbling with green soup over a small fire.',
    ironroot: 'An iron kettlebell wrapped in a living green root.',
    lumen: 'An old cinema film reel with a strip of film unspooling.',
    undergrowth: 'A glowing neon mushroom in purple and teal with a music note floating above it.',
    'riverside-park': 'A leafy oak tree beside a small stone footbridge over a stream.',
    'sire-house': 'A cozy cottage with a thatched roof, a red door and a smoking chimney.'
  },
  societies: {
    'debating-union': 'Two crossed feather quills over a scroll with a red wax seal.',
    'volleyball-club': 'A white and yellow volleyball.',
    'physic-garden-society': 'A terracotta pot with a seedling sprouting two leaves.',
    'furrow-choir': 'An open hymn book with golden music notes rising from its pages and a sprig of wheat.',
    'bloomist-fellowship': 'A white lily flower blooming with a soft golden glow.',
    'freewill-society': 'Two iron chain links snapped apart, a red ribbon tied to one of them, with white space all around.',
    'card-and-dice-society': 'A fan of three playing cards with two ivory dice in front of them.',
    'merchants-society': 'A small leather coin purse spilling gold coins beside a brass scale.',
    'needle-and-thread': 'A pincushion shaped like a tomato with a needle and a spool of pink thread.',
    'midnight-circle': 'A black candle burning beside a crescent moon and a chalk pentacle circle.'
  },
  stalls: {
    'petal-and-posy': 'A bouquet of roses and daisies wrapped in brown paper.',
    'the-sweet-tooth': 'A small round glass jar of colorful wrapped sweets, with white space all around.',
    'quill-and-binding': 'An inkpot with a feather quill and a leather notebook.',
    'tinkers-tray': 'A wooden tray of trinkets: a silver necklace, a ring and a small brooch.',
    'second-circuit': 'A secondhand smartphone with a cracked corner and a tangled cable.',
    'seven-petals': 'A small pink pastry box tied with ribbon, with seven petals on the lid.',
    'petal-and-pill': 'A small apothecary bottle of pills with a pink flower label.',
    'byte-and-bloom': 'A small gadget with a glowing screen and a flower sticker.',
    arcana: 'A glowing purple crystal on a little brass stand.',
    'forbidden-shelf': 'A dark leather book bound with a chain and a padlock, glowing faintly.',
    'second-bloom': 'A folded vintage silk scarf with a ribbon and a lace trim.',
    'spell-and-sip-counter': 'A bottle of sparkling potion soda with a cork and a star label.'
  },
  weather: {
    clear: 'A bright golden sun with soft rays.',
    overcast: 'A thick gray cloud.',
    drizzle: 'A small gray cloud with a few light raindrops falling.',
    downpour: 'A dark storm cloud pouring heavy rain with a lightning bolt.',
    windy: 'Swirling gusts of wind blowing a few autumn leaves.',
    mist: 'Soft white layered bands of mist.',
    snow: 'A white snowflake crystal with a small snow cloud.',
    heat: 'A blazing orange sun with wavy heat lines.'
  },
  stops: {
    fight: 'Two crossed steel swords.',
    find: 'A small wooden treasure chest, its lid ajar, golden light inside.',
    checkpoint: 'A small campfire with a bedroll beside it.',
    guardian: 'A menacing horned monster skull with glowing red eyes.'
  },
  pieces: {
    barbell: 'A whole Olympic barbell lying level, seen straight from the front: one long straight steel bar across the picture, with thick black weight plates on both the left end and the right end, the two ends the same.',
    iron: 'A soldering iron with a wooden handle and a glowing hot copper tip, pointing to the lower left.',
    heart: 'A plump glossy red heart.',
    dial: 'A round brass gauge face with a blank cream dial and no needle, no numbers.',
    tile: 'A square slab of dark carved slate seen from straight above, flat, plain, with a thin bronze rim.',
    spark: 'A crackling ball of blue magical lightning.',
    lamp: 'An unlit brass rune lamp with a round glass globe.',
    candle: CANDLE,
    'flame-red': FLAME('red'),
    'flame-orange': FLAME('orange'),
    'flame-gold': FLAME('golden yellow'),
    'flame-green': FLAME('emerald green'),
    'flame-blue': FLAME('sapphire blue'),
    'flame-violet': FLAME('violet'),
    compliment: 'A single red rose with a little sparkle on one petal.',
    joke: 'A laughing jester mask with bells.',
    comfort: 'A warm mug of cocoa with a small heart drawn in its foam, steam rising.',
    space: 'A small white flag on a short wooden pole.'
  }
}

// The strangers whose faces are read in the game for charisma: who each is, and how each mood looks on her. Each
// stranger is drawn from her own seed, with only the mood changed, so that her four faces are the same woman.
const STRANGERS: Record<string, string> = {
  bookworm: 'A young woman with round glasses and her hair in a bun, a book held to her chest.',
  athlete: 'A sporty young woman with a high ponytail and a sweatband.',
  gossip: 'A young woman with a sleek black bob and big hoop earrings.',
  musician: 'A young woman with long wavy hair and a lute strap over her shoulder.',
  cook: 'A young woman in a white apron with her hair tied back, flour on her cheek.',
  witch: 'A young woman in a small pointed witch hat, the whole hat in the picture with white space above it, and a crescent moon earring.',
  wanderer: 'A young woman with a sun-browned face, a scarf and a travel pack.',
  wit: 'A young woman with short dark hair, a white shirt and a little bow tie.'
}
const MOODS: Record<string, string> = {
  happy: 'She is happy: a big warm smile, bright eyes.',
  bored: 'She is bored: heavy-lidded eyes looking off to the side, a flat mouth, a small yawn.',
  sad: 'She is sad: teary eyes, eyebrows raised in the middle, a downturned mouth.',
  annoyed: 'She is annoyed: a deep frown, narrowed eyes, lips pressed tight, arms crossed.'
}

// Faces are drawn bigger and kept bigger, so that their eyes come out whole.
const SIZES: Record<string, { size: { width: number; height: number }; shown: number }> = {
  faces: { size: { width: 1536, height: 1536 }, shown: 512 }
}

// How a group is drawn, where it is not as an object on its own.
const FRAMINGS: Record<string, string> = {
  faces: 'one young woman, head and shoulders, facing the viewer, the expression on her face plain to see, cartoon game portrait icon, thick clean outline, simple shapes, no text\n\nplain white background'
}

interface Target {
  group: string
  id: string
  name: string
  image?: string
}

// Where each group is kept: its file, how to reach its list in it, and how to put a picture on one of them.
interface Group {
  file: string
  list: (data: any) => { id: string; name?: string; title?: string; iconImage?: string }[]
  /** For a group not kept as a list of its own: puts the picture in its place, and says what it replaced. */
  place?: (data: any, id: string, path: string) => string | undefined
}

// A stranger's face in one mood, as one picture to make: `<stranger>-<mood>`.
const faceOf = (id: string): { stranger: string; mood: string } => {
  const at = id.lastIndexOf('-')
  return { stranger: id.slice(0, at), mood: id.slice(at + 1) }
}
const GROUPS: Record<string, Group> = {
  jobs: { file: 'jobs.json', list: (data) => data.jobs },
  places: { file: 'locations.json', list: (data) => data },
  societies: { file: 'societies.json', list: (data) => data.societies },
  stalls: { file: 'stalls.json', list: (data) => data },
  weather: { file: 'calendar.json', list: (data) => data.weather },
  stops: {
    file: 'expedition.json',
    list: (data) => Object.keys(SUBJECTS.stops).map((id) => ({ id, name: id, iconImage: data.stopImages?.[id] })),
    place: (data, id, path) => {
      const replaced = data.stopImages?.[id]
      data.stopImages = { ...data.stopImages, [id]: path }
      return replaced
    }
  },
  pieces: { file: 'minigames.json', list: (data) => data.pieces },
  faces: {
    file: 'minigames.json',
    list: (data) => data.listeners.flatMap((one: any) => Object.keys(MOODS).map((mood) => ({ id: `${one.id}-${mood}`, name: `${one.name}, ${mood}`, iconImage: one.faces?.[mood] }))),
    place: (data, id, path) => {
      const { stranger, mood } = faceOf(id)
      const one = data.listeners.find((l: any) => l.id === stranger)
      if (!one) throw new Error('it is no longer in minigames.json')
      const replaced = one.faces?.[mood]
      one.faces = { ...one.faces, [mood]: path }
      return replaced
    }
  }
}

function read(file: string): { data: any; eol: string } {
  const raw = readFileSync(join(PACK, file), 'utf8')
  return { data: JSON.parse(raw), eol: raw.includes('\r\n') ? '\r\n' : '\n' }
}

function targets(): Target[] {
  return Object.entries(GROUPS).flatMap(([group, { file, list }]) =>
    list(read(file).data).map((one) => ({ group, id: one.id, name: one.name ?? one.title ?? one.id, image: one.iconImage }))
  )
}

/** Puts a picture on one of them in its file as it is now, so that nothing changed in it meanwhile is undone; what it replaced. */
function put(target: Target, path: string): string | undefined {
  const group = GROUPS[target.group]
  const { data, eol } = read(group.file)
  let replaced: string | undefined
  if (group.place) replaced = group.place(data, target.id, path)
  else {
    const entry = group.list(data).find((one) => one.id === target.id)
    if (!entry) throw new Error(`it is no longer in ${group.file}`)
    replaced = entry.iconImage
    entry.iconImage = path
  }
  writeFileSync(join(PACK, group.file), `${JSON.stringify(data, null, 2)}\n`.replaceAll('\n', eol))
  return replaced
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const unknown = flags.filter((flag) => !['--dry', '--overwrite'].includes(flag))
  if (unknown.length > 0) throw new Error(`There is no ${unknown.join(', ')}. Use --dry or --overwrite.`)
  const [dry, overwrite] = [flags.includes('--dry'), flags.includes('--overwrite')]
  const only = args.filter((arg) => !arg.startsWith('--')).map((arg) => arg.toLowerCase())

  const all = targets()
  const missing = only.filter((one) => !GROUPS[one] && !all.some((target) => target.id === one))
  if (missing.length > 0) throw new Error(`There is no group or id called: ${missing.join(', ')}`)
  const todo = all.filter((target) => (only.length === 0 || only.includes(target.group) || only.includes(target.id)) && (overwrite || !target.image))

  const settingsPath = settingsFile()
  if (!existsSync(settingsPath)) throw new Error(`No ComfyUI settings at ${settingsPath}. Set ComfyUI up in the app first.`)
  const readSettings = () => new ComfyStore(settingsPath, PACK).get()
  const subjectOf = (target: Target) => {
    if (target.group !== 'faces') return SUBJECTS[target.group]?.[target.id] ?? `An emblem of ${target.name}.`
    const { stranger, mood } = faceOf(target.id)
    return `${STRANGERS[stranger] ?? `A young woman, ${target.name}.`} ${MOODS[mood]}`
  }
  const promptOf = (target: Target) => `${subjectOf(target)}\n\n${FRAMINGS[target.group] ?? FRAMING}`
  // A stranger is drawn from the same seed in every mood, so that she is the same woman in each.
  // So are the candle flames, so that they are one flame in different colours.
  const seedFor = (target: Target) => (target.group === 'faces' ? seedOf(faceOf(target.id).stranger) : target.id.startsWith('flame-') ? seedOf('flame') : undefined)

  console.log(`ComfyUI at ${readSettings().baseUrl}. ${todo.length} to make of ${all.length}${overwrite ? ', replacing those there are' : ''}.`)
  if (dry) {
    for (const target of todo) console.log(`\n== ${target.group}: ${target.name} (${target.id})\n${promptOf(target)}`)
    return
  }
  if (todo.length === 0) return

  const cancel = new AbortController()
  process.on('SIGINT', () => {
    if (cancel.signal.aborted) process.exit(130)
    console.log('\nStopping: cancelling the picture being made. Run again to carry on. (Ctrl+C again to quit at once.)')
    cancel.abort()
  })

  const started = Date.now()
  let failedInARow = 0
  for (const [i, target] of todo.entries()) {
    if (cancel.signal.aborted) break
    const began = Date.now()
    process.stdout.write(`[${i + 1}/${todo.length}] ${target.group}: ${target.name}... `)
    // Filed by group, so that a stall and a place of the same id do not overwrite each other.
    const result = await generateArt(readSettings(), PACK, PACK, { kind: 'sprite', subjectId: SUBJECT, name: `${target.group}-${target.id}`, workflow: '', positive: promptOf(target), negative: '', seed: seedFor(target), ...(SIZES[target.group]?.size ?? SIZE) }, cancel.signal, '')
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
      made = cutOut(result.path, SIZES[target.group]?.shown ?? SHOWN)
    } catch (cause) {
      made = { path: result.path, note: `left on its card: ${(cause as Error).message}` }
    }
    try {
      const replaced = put(target, made.path)
      if (replaced && replaced !== made.path) rmSync(join(PACK, replaced), { force: true })
    } catch (cause) {
      console.log(`made (${made.path}), but ${(cause as Error).message}.`)
      continue
    }
    const left = todo.length - i - 1
    console.log(`done in ${minutes(Date.now() - began)}: ${made.path}${made.note ? ` (${made.note})` : ''}${left > 0 ? ` (about ${minutes(((Date.now() - started) / (i + 1)) * left)} to go)` : ''}`)
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
