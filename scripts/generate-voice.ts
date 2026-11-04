/**
 * Designs a love interest's voice on ElevenLabs and records her wordless reactions in it (a laugh, a sigh, a gasp…),
 * into `content/default/sounds/voices/<id>/` as ogg, each listed in her file's `reactions`. Needs ELEVENLABS_API_KEY in
 * `.env`, and ffmpeg. Not part of the app:
 *
 *   npx jiti scripts/generate-voice.ts <id> --design   three previews of a voice for her, to listen to and pick
 *   npx jiti scripts/generate-voice.ts <id> --pick <n>  keeps preview n as her voice (its id goes in voices.json)
 *   npx jiti scripts/generate-voice.ts <id>            records her reactions in the voice kept, `--overwrite` to redo
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const API = 'https://api.elevenlabs.io/v1'
const ROOT = resolve('content', 'default')
const VOICES = join(ROOT, 'sounds', 'voices')
const LEDGER = join(VOICES, 'voices.json')

const key = readFileSync(resolve('.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) throw new Error('No ELEVENLABS_API_KEY in .env.')

const args = process.argv.slice(2)
const id = args[0]
if (!id || id.startsWith('--')) throw new Error('Name a love interest.')
const her = JSON.parse(readFileSync(join(ROOT, 'love-interests', `${id}.json`), 'utf8'))
const out = join(VOICES, id)
mkdirSync(out, { recursive: true })

// How each one voices her, for the voice design: who she is and how she speaks, not what she looks like.
const DESCRIBED: Record<string, string> = {
  edda:
    'A woman of fifty-five, a university history professor, with a clear, crisp, authoritative mid-low voice and a refined educated English accent. Brisk, exacting and drily funny, every sentence a lecture with a footnote; warm underneath but businesslike. Mature, not elderly.',
  seraphine:
    'A young woman of eighteen with a soft, gentle, slightly breathy voice, clear and well-spoken with a refined received-pronunciation English accent. Shy and warm in private, a little hesitant, with a poised, formal edge she puts on when nervous. Light, youthful, sweet, never husky.',
  morwenna:
    'A woman of twenty-two with a low, smoky, velvety alto voice and a cultured English accent. Slow, measured and deliberate, with long knowing pauses, cool and amused, faintly sardonic and quietly seductive. Utterly self-assured; dark, rich and controlled, never loud or bright.',
  anwen:
    "A woman of twenty-one with a cool, low, slightly husky voice and a soft Welsh accent. Clipped, unhurried and dry, with a smirk in every line; confident and cutting, never raises her voice.",
  elowen:
    "A young American woman of twenty with a bright, quick, high and bubbly voice and a general American accent, like a popular young Twitch streamer. Fast-talking, excitable and playful, giggly, uses gamer slang, a bit chaotic. Young-sounding, not British.",
  caelwen:
    "A woman who sounds in her early thirties, an elf who has not aged, with a warm, smooth, mellow alto voice and a refined English accent. Youthful in tone but unhurried and gently ironic, wise and kind, with a faint wistfulness; graceful and a little ethereal. Not old, not elderly, not croaky.",
  daphne:
    "A woman of twenty-two with a steady, clear, confident mid-range voice and a general American accent. Even, direct and controlled, a team captain who expects to be heard; dry humor with a straight delivery.",
  dinah:
    "A woman of twenty-five with a soft, calm, low and gentle voice and a neutral, cultured American accent. Unhurried, exact and soothing, like a counselor in a quiet room; warm and quietly serious.",
  faye:
    "A woman of twenty-two with a smooth, sultry, warm mid-low voice and a polished American accent. Confident, calculating and seductive; every sentence sounds like a negotiation she is winning.",
  grushka:
    "A woman of forty-one, an orc, with a deep, strong, gravelly low voice and a heavy Eastern European accent. Blunt, plain and unhurried, like a drill sergeant; steady, commanding and gruff, with warmth underneath.",
  isolde:
    "A woman of twenty-six with a cool, composed, smooth mid-range voice and a crisp, educated mid-Atlantic accent. Professional and precise, with a faint knowing undertone; every line could be a lecture or a flirtation.",
  lira:
    "A young-sounding American woman with a bright, airy, sweet and very ditzy high voice. Airheaded and dreamy, cheerful and spacey, slow to catch on, says odd things in a sing-song, bubbly way with a soft, liquid quality; like a happy airhead.",
  "lola-hopworth":
    "A woman of thirty-two with a quick, lively, slightly raspy voice and a strong London Cockney accent. Brisk, blunt and fast-talking, clipping her words, cheeky and warm, a busy head chef.",
  maren:
    "A young woman in her early twenties with a sweet, bright, lilting voice like an adult anime heroine voiced by a woman in her twenties in an English dub, with a light Japanese accent. Cute and expressive, perky and affectionate, a little pouty and theatrical, but clearly a grown woman: a mature, full voice, not a teenager or child, never squeaky or high-pitched.",
  ottilie:
    "A woman of thirty-six with a crisp, quick, dry mid-range voice and a precise Scottish accent. Clinical, exact and unsentimental, a brilliant scientist; deadpan, with no change of expression.",
  tamsin:
    "A young American woman of eighteen with a bright, energetic, tomboyish voice and a rural American country accent, a farm girl from a small town. Quick, blunt and teasing, loud and warm, a little gruff when embarrassed.",
  tink:
    "A young woman of nineteen with a cheeky, playful, light and quick voice and a lilting Irish accent. Mischievous and grinning, casual and teasing, always half a laugh away.",
  vespera:
    "A Black American woman of thirty-six from the Deep South, with a rich, warm, smoky low alto voice and a thick, syrupy Southern drawl. Mature, grown and self-possessed, never girlish or young-sounding. Sassy, teasing and unhurried, amused and confident to the point of arrogance, every line sounding like a private joke.",
  yelena:
    "A young woman of eighteen with a clear, bright, crisp and polished voice and an aristocratic upper-class English accent. Poised, well-mannered and precise on the surface, with an eager, youthful excitement breaking through.",
  yulia:
    "A woman of twenty-one with a husky, lively, fast and loose voice and a Russian accent that slips into valley-girl speech when she gets excited. Bold, laughing and flirtatious, a party girl.",
  zelie:
    "A woman of twenty-six with a smooth, poised, warm and slightly playful voice and a French accent. Unhurried, elegant and a little formal, quietly amused, teasing and affectionate; never raises her voice."
}

// What she says in the previews: a line in her own manner, so the voice is heard doing what she does.
const SAMPLE: Record<string, string> = {
  edda: "Sit down. You have read the syllabus, I assume, which puts you ahead of most. Today is the basics: what you are, what that means here, and why the University would very much like you to be happy.",
  seraphine: "Oh, you came. I wasn't sure you would. Forgive me, I'm not very good at this part, the part where nobody is watching. Will you sit with me a little while?",
  morwenna: "You came back. How exquisite. Most men lose their nerve after the first conversation... I find that intolerable, and rather predictable. Sit down, darling. Tell me what it is you actually want.",
  anwen: "Oh, look who it is. Don't flatter yourself, I was just passing. Get on the back of the bike, and hold on properly this time. I'm not scraping you off the road.",
  elowen: "Okay okay okay, chat, he's actually here, this is not a drill! Hi! Sorry, I'm live, ignore them. Wait, no, don't ignore me. Are you staying? Please say you're staying.",
  caelwen: "Sit, please. I've asked that question of first-years for sixty years, and you're the first to answer it with another question. I find I rather like that. Tell me what you meant by it.",
  daphne: "You're late. That's two laps. Kidding. Mostly. Grab a ball, we're short a setter and you look like you've got decent hands. Don't make me regret it.",
  dinah: "You don't have to say anything yet. Most people who sit in that chair need a moment first. Take yours. When you're ready, tell me what's really keeping you up at night.",
  faye: "Let's be honest with each other, it saves time. You want something, I want something. The only question left is what you're willing to pay for it. I'm very reasonable. Usually.",
  grushka: "Again. Your form was ugly, your breathing was worse. But you did not quit, and that is the part I cannot teach. Drink water. Then you will do it again, properly.",
  isolde: "Your numbers are interesting. Not ideal, but interesting. I'd like to go over them with you more thoroughly, in private, after hours. Purely for the sake of the data, of course.",
  lira: "Oh! Hi! You're warm. Warmer than the pond. Is that normal for people? I forget. I've been here two hundred rains and I still forget. Do you wanna see a frog? I have one inside me. Just kidding. Maybe.",
  "lola-hopworth": "Right, apron on, hands washed, no, properly. You've got the look of a man who burns toast. Don't argue with me, love, I can smell it on you. Stir that and don't stop.",
  maren: "Ah, you came! Look, look, I wore the new ribbons. Kawaii, ne? That means cute, you have to say so. Hmph. If you don't say so I'll pout all through tea.",
  ottilie: "Sit. Roll up your sleeve. No, the other one. You're an extraordinary specimen, which I mean as a compliment, though I'm told it doesn't sound like one. Hold still.",
  tamsin: "Hey! Took you long enough. Race you to the old oak, loser buys the burgers. And don't you dare let me win again, I saw you do it last time, you big dummy.",
  tink: "Shh, don't look so shocked, I'll give it back. Probably. Fancy a game of cards? Friendly stakes. Well, friendly for me. Come on, you've got a lucky face.",
  vespera: "Well, well. Look what wandered into my classroom. Did you come to learn a hex, sugar, or did you just want to see if the rumors were true? Either way, sit down.",
  yelena: "Good evening. My father would be appalled that I'm here, which is rather the point. I've never done anything I wasn't told to before. Show me something I'm not supposed to see.",
  yulia: "Hey, hey, you made it! Okay, so, like, this party is totally dead without you, I swear. Here, drink this. Don't ask what's in it, yeah? Just trust me. You trust me, right?",
  zelie: "Ah, monsieur, you are home. Bien sûr, dinner is ready, and the little ones are asleep. Alors, sit, take off that coat. You look tired, non? Let me take care of you a little."
}

// Her reactions: what each is, and the line spoken in eleven_v3 with its audio tags to draw it out.
const REACTIONS: Record<string, string> = {
  giggle: '[giggle] hahaha',
  sigh: '[sighs] Hhh...',
  'sigh-content': '[contented sigh] Mm.',
  gasp: '[gasps] Oh!',
  huff: '[huffs, annoyed] Hmph.',
  surprised: '[surprised] Oh...',
  yawn: '[yawns] Haah...',
  aww: '[softly, touched] Aww.',
  satisfied: '[blissful, savoring the most decadent chocolate] Mmmmm...'
}

// An accent the voice holds to only when it is asked to, put before everything she records.
const ACCENT: Record<string, string> = {
  zelie: '[French accent]',
  yulia: '[Russian accent]',
  grushka: '[heavy Eastern European accent]',
  vespera: '[thick Southern drawl]'
}
const accented = (text: string) => (ACCENT[id] ? `${ACCENT[id]} ${text}` : text)

// A reaction drawn out some way of its own, where the common line does not suit her.
const OWN_REACTION: Record<string, Record<string, string>> = {}

// A phrase said some way of its own, in place of plainly in her tone.
const SAY: Record<string, Record<string, string>> = {
  lira: { hello: '[bright, dreamy, airheaded] Hellooo!' },
  anwen: { 'hey cowboy': '[smirking, cool, unhurried] Hey, cowboy...' },
  maren: { kawaii: '[delighted, gushing] Kawaii!' },
  tamsin: { 'shut up': '[flustered, scoffing] Shut up!' },
  yulia: { "that's so Breedhaven": "[teasing, laughing] That's so Breedhaven." },
  elowen: { 'player two': '[playful, bright] Player two!' },
  grushka: { cub: '[gruff, warm] Cub.' },
  isolde: { 'my baby': '[soft, intimate, composed] My baby.' },
  ottilie: { 'my True Sire': '[dry, quietly fond] My True Sire.' },
  seraphine: { 'my lord': '[shy, formal, a little breathless] My lord.' },
  tink: { 'big guy': '[cheeky, teasing] Big guy.' }
}

const ledger = (): Record<string, string> => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {})

async function call(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res
}

async function design() {
  const description = DESCRIBED[id] ?? `${her.personality} ${her.speechPattern ?? ''}`
  const res = await call('/text-to-voice/design', {
    voice_description: description,
    model_id: 'eleven_ttv_v3',
    text: SAMPLE[id] ?? her.speechPattern
  })
  const { previews } = (await res.json()) as { previews: { generated_voice_id: string; audio_base_64: string }[] }
  const kept: { n: number; generatedVoiceId: string }[] = []
  previews.forEach((preview, n) => {
    writeFileSync(join(out, `preview-${n}.mp3`), Buffer.from(preview.audio_base_64, 'base64'))
    kept.push({ n, generatedVoiceId: preview.generated_voice_id })
  })
  writeFileSync(join(out, 'previews.json'), JSON.stringify({ description, previews: kept }, null, 2) + '\n')
  console.log(`${previews.length} previews in ${out}: listen, then --pick <n>.`)
}

async function pick(n: number) {
  const { description, previews } = JSON.parse(readFileSync(join(out, 'previews.json'), 'utf8'))
  const chosen = previews.find((one: { n: number }) => one.n === n)
  if (!chosen) throw new Error(`No preview ${n}.`)
  const res = await call('/text-to-voice', { voice_name: `Breedhaven ${her.name}`, voice_description: description, generated_voice_id: chosen.generatedVoiceId })
  const { voice_id } = (await res.json()) as { voice_id: string }
  writeFileSync(LEDGER, JSON.stringify({ ...ledger(), [id]: voice_id }, null, 2) + '\n')
  console.log(`${her.name}'s voice is ${voice_id}.`)
}

async function record() {
  const voice = ledger()[id]
  if (!voice) throw new Error(`${id} has no voice yet: --design, then --pick.`)
  const reactions: Record<string, string> = {}
  for (const [name, said] of Object.entries(REACTIONS)) {
    const text = OWN_REACTION[id]?.[name] ?? said
    const file = join(out, `${name}.ogg`)
    reactions[name] = `sounds/voices/${id}/${name}.ogg`
    if (existsSync(file) && !args.includes('--overwrite')) continue
    const res = await call(`/text-to-speech/${voice}?output_format=mp3_44100_128`, { text: accented(text), model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
    // ElevenLabs gives mp3; the pack's sounds are ogg.
    const mp3 = join(out, `${name}.mp3`)
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-c:a', 'libvorbis', '-q:a', '5', file])
    rmSync(mp3)
    console.log(`${name}: ${file}`)
  }
  // Her catch phrases, as her file lists them: each said once, alone, as she would say it.
  const path = join(ROOT, 'love-interests', `${id}.json`)
  const file = JSON.parse(readFileSync(path, 'utf8'))
  const catchphrases: Record<string, string> = {}
  for (const phrase of Object.keys(file.catchphrases ?? {})) {
    const slug = phrase.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const ogg = join(out, `phrase-${slug}.ogg`)
    catchphrases[phrase] = `sounds/voices/${id}/phrase-${slug}.ogg`
    if (existsSync(ogg) && !args.includes('--overwrite')) continue
    const spoken = SAY[id]?.[phrase] ?? `[${file.ai?.tone || 'in character'}] ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${/[.!?]$/.test(phrase) ? '' : '.'}`
    const res = await call(`/text-to-speech/${voice}?output_format=mp3_44100_128`, { text: accented(spoken), model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })
    const mp3 = join(out, `phrase-${slug}.mp3`)
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
    // A little quiet after it, so that the last word is not clipped where the recording stops on it.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-af', 'apad=pad_dur=0.35', '-c:a', 'libvorbis', '-q:a', '5', ogg])
    rmSync(mp3)
    console.log(`"${phrase}": ${ogg}`)
  }
  // Her file names them, so that the game plays them.
  writeFileSync(path, JSON.stringify({ ...file, reactions, catchphrases }, null, 2) + '\n')
  // The previews are kept on ElevenLabs once one is picked.
  for (const n of [0, 1, 2]) rmSync(join(out, `preview-${n}.mp3`), { force: true })
  rmSync(join(out, 'previews.json'), { force: true })
}

const at = args.indexOf('--pick')
void (args.includes('--design') ? design() : at >= 0 ? pick(Number(args[at + 1])) : record())
