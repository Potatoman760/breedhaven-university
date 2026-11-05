/**
 * Generates the ambience loops of places on ElevenLabs, 30 seconds each and made to loop, into
 * `content/default/sounds/ambience/<id>.ogg`, and points `sounds.json` at them. Needs ELEVENLABS_API_KEY in `.env`, and
 * ffmpeg. Not part of the app:
 *
 *   npx jiti scripts/generate-ambience.ts              every loop below not yet generated
 *   npx jiti scripts/generate-ambience.ts <ids...>     only these loops
 *   npx jiti scripts/generate-ambience.ts --overwrite  again, over what is there
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const API = 'https://api.elevenlabs.io/v1'
const ROOT = resolve('content', 'default')
const OUT = join(ROOT, 'sounds', 'ambience')
const SOUNDS = join(ROOT, 'sounds.json')
const CREDIT = 'Generated with ElevenLabs sound effects'

const key = readFileSync(resolve('.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) throw new Error('No ELEVENLABS_API_KEY in .env.')

// Each loop: what it sounds like, for the model, and how loud it plays. No speech that can be made out: talk is a murmur.
const LOOPS: Record<string, { prompt: string; volume: number }> = {
  'lecture-hall': { prompt: 'Ambience of an old stone university lecture hall corridor between classes: footsteps on stone, students murmuring as they pass, bags and doors, a distant bell, soft echo. No clear words.', volume: 0.5 },
  ballroom: { prompt: 'Ambience of a grand masquerade ballroom: a string quartet playing a slow waltz in a gallery, a large elegant crowd murmuring, glasses clinking, footsteps on a parquet floor, a high-ceilinged hall. No clear words.', volume: 0.55 },
  aether: { prompt: 'Ambience of a small quiet private training hall: a low steady magical hum, faint crackle of energy, soft creak of floor mats, muffled street outside. Calm and empty.', volume: 0.45 },
  'ridge-road': { prompt: 'Ambience on a hilltop road at night above a city: steady wind through grass, crickets, a distant city hum far below, an occasional far-off car passing. Open and quiet.', volume: 0.45 },
  'saltmere-day': { prompt: 'Ambience of an outdoor hot spring in wooded hills by day: water bubbling and trickling into stone pools, a waterfall in the distance, birdsong, leaves rustling in a light breeze.', volume: 0.55 },
  'saltmere-night': { prompt: 'Ambience of an outdoor hot spring in wooded hills at night: water trickling into stone pools, a distant waterfall, crickets and frogs, a soft breeze in the trees.', volume: 0.45 },
  'brightshore-day': { prompt: 'Ambience of a sunny seaside beach by day: gentle waves breaking and washing up the sand, seagulls calling, a light sea breeze, distant beachgoers laughing and murmuring. No clear words.', volume: 0.55 },
  'brightshore-night': { prompt: 'Ambience of a seaside boardwalk at night: waves lapping under a wooden pier, a soft sea breeze, distant fairground music and the hum of a Ferris wheel, people murmuring at food stalls. No clear words.', volume: 0.45 },
  'fernhollow-day': { prompt: 'Ambience of a pine forest campground by a lake by day: wind in tall pine trees, birdsong, a woodpecker far off, small waves lapping at a lakeshore.', volume: 0.5 },
  'fernhollow-night': { prompt: 'Ambience of a forest campsite at night: a campfire crackling and popping, crickets, an owl hooting far off, a soft breeze in the pines.', volume: 0.45 },
  'brightshore-cove': { prompt: 'Ambience of a small sheltered rocky cove at sunrise with nobody around: calm small waves lapping softly on rocks and sand, water trickling between stones, a few distant gulls, a faint morning breeze. Peaceful and quiet.', volume: 0.45 },
  'jadewater-deck': { prompt: 'Ambience on the deck of a wooden sailing junk gliding across a calm tropical bay by day: gentle water lapping at the hull, canvas sails flapping softly, wooden rigging creaking, distant tropical birds calling from cliffs. No clear words.', volume: 0.5 },
  'jadewater-cabin': { prompt: 'Ambience inside a quiet wooden ship cabin at anchor on a calm bay at night: soft water lapping against the hull, the old timber creaking gently, faint crickets and frogs from distant islands, a light breeze at the window.', volume: 0.4 },
  'jadewater-cave': { prompt: 'Ambience inside a vast echoing sea cave: slow water drips echoing, gentle water lapping against stone, a soft hollow wind, the faint splash of an oar. Cavernous and calm.', volume: 0.45 },
  'coralmere-reef': { prompt: 'Ambience of a calm tropical lagoon by day: small clear waves lapping on white sand, palm fronds rustling in a warm breeze, a few distant seabirds, soft gentle splashing in shallow water.', volume: 0.5 },
  'coralmere-bungalow': { prompt: 'Ambience inside an overwater bungalow on a tropical lagoon at night: gentle water lapping against the wooden stilts below, a warm sea breeze through open doors, distant soft surf on the reef, faint night insects.', volume: 0.4 },
  'coralmere-sandbar': { prompt: 'Ambience on a remote sandbar in a tropical lagoon in the morning: very gentle waves washing in from both sides, a soft sea breeze, a few terns calling far off, peaceful and open.', volume: 0.45 },
  'saffron-lake': { prompt: 'Ambience on a small wooden boat on a calm lake in an old desert city at sunset: oars dipping softly in the water, gentle lapping, birds calling over the water, a distant temple bell and faint far-off music from the shore. No clear words.', volume: 0.45 },
  'saffron-rooftop': { prompt: 'Ambience on a palace rooftop above a lake city at night: a warm breeze, candle flames and lanterns softly creaking, distant soft sitar and tabla music drifting up from the city, faint murmur of the town far below, crickets. No clear words.', volume: 0.4 },
  'saffron-colors': { prompt: 'Ambience of a joyful outdoor festival of colors in a courtyard: hand drums beating a lively rhythm, a crowd laughing and cheering, powder being thrown in soft whooshes, bells. No clear words.', volume: 0.45 },
  'fernhollow-lake': { prompt: 'Ambience of a still forest lake at dawn: very gentle water lapping at a wooden dock, a loon calling across the water, early birdsong waking in the pines, a soft breeze. Quiet and misty.', volume: 0.45 },
  dawnbloom: { prompt: 'Ambience inside a quiet, formal marble palace hall: a large hushed room with soft echo, a grand clock ticking, distant footsteps of servants, a door closing far away, birds faintly outside a window.', volume: 0.4 },
  restaurant: { prompt: 'Ambience of an upscale busy restaurant with an open kitchen: diners murmuring, cutlery on plates, glasses clinking, sizzling pans and flames in the kitchen, a chef calling orders indistinctly. No clear words.', volume: 0.55 },
  boba: { prompt: 'Ambience of a small bright bubble tea shop: a cocktail shaker and an ice blender, a cash register beep, cups and straws, young customers chatting and laughing softly, light pop music faint in the background. No clear words.', volume: 0.55 },
  cinema: { prompt: 'Ambience inside a dark cinema during a film: a movie soundtrack playing from the screen, muffled and full, an audience quietly shifting in their seats, someone eating popcorn, a soft cough.', volume: 0.5 },
  arena: { prompt: 'Ambience of a university outdoor sports ground: athletes training and sparring, wooden practice weapons clacking, a coach whistle, footsteps on a running track, a small crowd cheering in the stands now and then. No clear words.', volume: 0.55 },
  clinic: { prompt: 'Ambience of a bright modern health clinic waiting area: quiet murmurs, a soft chime calling the next patient, a printer, footsteps, a sliding door, gentle air conditioning hum. Calm. No clear words.', volume: 0.45 },
  street: { prompt: 'Ambience of a lively student shopping street by day: people walking and chatting, shop doors with bells, a tram passing and ringing its bell, bicycles, distant traffic. No clear words.', volume: 0.55 },
  'street-night': { prompt: 'Ambience of a student high street in the evening: groups of people laughing and talking in passing, music faint from a pub door, a tram passing, footsteps on cobbles, a light breeze. No clear words.', volume: 0.5 },
  'pub-night': { prompt: 'Ambience of a busy, loud student pub on a Saturday night: a crowd talking and laughing, glasses clinking, a jukebox playing faintly, cheering at a card table. No clear words.', volume: 0.55 },
  'river-night': { prompt: 'Ambience of a riverside park at night: gentle river water lapping at a bank, crickets, a soft breeze in trees, a tram crossing a stone bridge in the distance.', volume: 0.45 },
  bathhouse: { prompt: 'Ambience of a quiet indoor thermal bath under a vaulted stone roof: warm water gently lapping at tiled edges, a steady trickle of spring water pouring into the pool, soft drips echoing, a faint hiss of steam, the occasional quiet splash. Calm and spacious, almost no people.', volume: 0.55 },
  club: { prompt: 'Ambience inside a crowded basement nightclub: a heavy deep electronic bass beat through low ceilings, a dancing crowd cheering and shouting over the music, a hot, close room. No clear words.', volume: 0.5 }
}

// Where each is heard: a location's day loop, its night one where that is different, and any of its views' own.
const PLACES: Record<string, { day: string; night?: string; views?: Record<string, string> }> = {
  'lecture-halls': { day: 'lecture-hall' },
  ballroom: { day: 'ballroom' },
  aether: { day: 'aether' },
  'ridge-road': { day: 'ridge-road' },
  saltmere: { day: 'saltmere-day', night: 'saltmere-night' },
  brightshore: { day: 'brightshore-day', night: 'brightshore-night', views: { beach: 'brightshore-day', boardwalk: 'brightshore-night', cove: 'brightshore-cove' } },
  jadewater: { day: 'jadewater-deck', night: 'jadewater-cabin', views: { deck: 'jadewater-deck', cabin: 'jadewater-cabin', cave: 'jadewater-cave' } },
  coralmere: { day: 'coralmere-reef', night: 'coralmere-bungalow', views: { reef: 'coralmere-reef', bungalow: 'coralmere-bungalow', sandbar: 'coralmere-sandbar' } },
  'saffron-lake': { day: 'saffron-lake', night: 'saffron-rooftop', views: { lake: 'saffron-lake', rooftop: 'saffron-rooftop', colors: 'saffron-colors' } },
  fernhollow: { day: 'fernhollow-day', night: 'fernhollow-night', views: { trail: 'fernhollow-day', campfire: 'fernhollow-night', lake: 'fernhollow-lake' } },
  'dawnbloom-house': { day: 'dawnbloom' },
  cauldron: { day: 'restaurant' },
  'boba-blossom': { day: 'boba' },
  lumen: { day: 'cinema' },
  tiltyard: { day: 'arena', night: 'night-outdoor' },
  'health-centre': { day: 'clinic' },
  'lantern-row': { day: 'street', night: 'street-night' },
  'honeyed-bee-inn': { day: 'pub', night: 'pub-night' },
  'riverside-park': { day: 'river', night: 'river-night' },
  undergrowth: { day: 'club' },
  bathhouse: { day: 'bathhouse' }
}

async function generate(id: string, prompt: string): Promise<void> {
  const res = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, model_id: 'eleven_text_to_sound_v2', duration_seconds: 30, loop: true, prompt_influence: 0.5 })
  })
  if (!res.ok) throw new Error(`${id}: ${res.status} ${await res.text()}`)
  const mp3 = join(OUT, `${id}.mp3`)
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-c:a', 'libvorbis', '-q:a', '5', join(OUT, `${id}.ogg`)])
  rmSync(mp3)
}

async function main() {
  const args = process.argv.slice(2)
  const only = args.filter((arg) => !arg.startsWith('--'))
  const overwrite = args.includes('--overwrite')
  const sounds = JSON.parse(readFileSync(SOUNDS, 'utf8'))
  for (const [id, loop] of Object.entries(LOOPS)) {
    if (only.length > 0 && !only.includes(id)) continue
    const made = sounds.ambience[id]?.credit === CREDIT && existsSync(join(OUT, `${id}.ogg`))
    if (made && !overwrite) continue
    await generate(id, loop.prompt)
    sounds.ambience[id] = { file: `sounds/ambience/${id}.ogg`, volume: loop.volume, credit: CREDIT }
    console.log(`${id}: sounds/ambience/${id}.ogg`)
    // Kept as it goes, so that a failure partway loses nothing made.
    writeFileSync(SOUNDS, JSON.stringify(sounds, null, 2) + '\n')
  }
  for (const [place, loops] of Object.entries(PLACES)) {
    if (![loops.day, loops.night, ...Object.values(loops.views ?? {})].every((id) => id === undefined || sounds.ambience[id])) continue
    sounds.places[place] = loops
  }
  writeFileSync(SOUNDS, JSON.stringify(sounds, null, 2) + '\n')
}

void main()
