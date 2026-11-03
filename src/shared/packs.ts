import { z } from 'zod'
import { ADDON_PREFIX, isSafeId, type EditorInfo } from './editor'
import { AnimationSchema, LooksSchema, LoveInterestSchema, MajorSchema, OutfitSchema, TraitSchema, basePoseId, poseMedia, posesOf, type Animation, type ContentPack, type LoveInterest, type Outfit } from './model'

/**
 * A pack: some of a character's pictures and clips, whole characters of a player's own, and subjects made in the editor,
 * in a zip to be passed to another player. The zip holds `pack.json` and the files it names, under `files/`. Nothing in it is taken on trust: only what `pack.json` names is ever read
 * out of the zip, and where a file ends up is the game's to say.
 */
export const PACK_MANIFEST = 'pack.json'
const PACK_FORMAT = 1

/** What a pack can hold: the pictures and clips the editor takes in. */
export const PACK_MEDIA = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.mp4', '.webm']

/** Where a file is in a zip: one plain name in a folder of the character's. */
const PACK_FILE = /^files\/[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*$/

export function isPackFile(path: string): boolean {
  return PACK_FILE.test(path) && PACK_MEDIA.some((extension) => path.endsWith(extension))
}

const PackedOutfitSchema = OutfitSchema.extend({
  /** The outfit itself was chosen. Otherwise it is here only for the faces chosen in it, or for another that builds on it. */
  whole: z.boolean()
})
export type PackedOutfit = z.infer<typeof PackedOutfitSchema>

const PackedCharacterSchema = z.object({
  id: z.string().refine(isSafeId),
  name: z.string(),
  outfits: z.array(PackedOutfitSchema),
  animations: z.array(AnimationSchema)
})
export type PackedCharacter = z.infer<typeof PackedCharacterSchema>

export const PackManifestSchema = z.object({
  format: z.literal(PACK_FORMAT),
  name: z.string(),
  /** The added faces and sex-acts what is in it is filed under. */
  looks: LooksSchema,
  /** The traits its whole characters have. */
  traits: z.array(TraitSchema),
  /** Subjects made in the editor: those chosen, and those its whole characters study or teach, each with its college. */
  majors: z.array(z.object({ major: MajorSchema, college: z.object({ id: z.string(), name: z.string() }) })),
  /** Things for characters who are already in the game it goes to. */
  characters: z.array(PackedCharacterSchema),
  /** Whole characters, as the content has them. */
  people: z.array(LoveInterestSchema.refine((who) => isSafeId(who.id)))
})
export type PackManifest = z.infer<typeof PackManifestSchema>

/** What of one character is chosen for a pack: outfits by id, added faces by id, sex-acts by the id of the act. */
export interface PackPicks {
  outfits: string[]
  expressions: string[]
  acts: string[]
}

export const PackSelectionSchema = z.object({
  name: z.string().trim().min(1).max(64),
  characters: z.record(z.string(), z.object({ outfits: z.array(z.string()), expressions: z.array(z.string()), acts: z.array(z.string()) })),
  /** Whole characters, by id. */
  people: z.array(z.string()),
  /** Subjects, by code. */
  majors: z.array(z.string())
})
export type PackSelection = z.infer<typeof PackSelectionSchema>

/** One thing that can be put in a pack, and how many files come with it. */
export interface PackChoice {
  id: string
  name: string
  pictures: number
  clips: number
}

/** All that can be packed of one character. */
export interface PackChoices {
  id: string
  name: string
  /** She can go whole, and all that comes with her: she is the player's own, and nobody else's game has her. */
  whole?: PackChoice
  outfits: PackChoice[]
  expressions: PackChoice[]
  acts: PackChoice[]
}

/** How much of what the game has is the player's to pass on. */
type Ownership = Pick<EditorInfo, 'base' | 'loveInterests' | 'majors'>

/** Which files count: as a player has the game, those of their own and not the game's, which everyone has already. */
const packableFile = (info: Ownership) => (path: string): boolean => info.base || path.startsWith(ADDON_PREFIX)

const isClip = (path: string): boolean => /\.(mp4|webm)$/i.test(path)

function choice(id: string, name: string, files: string[]): PackChoice {
  return { id, name, clips: files.filter(isClip).length, pictures: files.filter((file) => !isClip(file)).length }
}

const everyone = (content: ContentPack): LoveInterest[] => [...content.loveInterests, ...content.npcs]

/** Everything that can go in a pack, character by character, and the subjects. Only those with something to pack are listed. */
export function packChoices(content: ContentPack, info: Ownership): { characters: PackChoices[]; majors: { code: string; name: string }[] } {
  const counts = packableFile(info)
  const acts = posesOf(content.looks).all
  const characters = everyone(content).flatMap((who) => {
    const outfits = who.outfits.flatMap((outfit) => {
      const files = Object.values(outfit.sprites).map((sprite) => sprite.image).filter(counts)
      return files.length > 0 ? [choice(outfit.id, outfit.name, files)] : []
    })
    const expressions = content.looks.expressions.flatMap((face) => {
      const files = who.outfits.flatMap((outfit) => (outfit.sprites[face.id] ? [outfit.sprites[face.id].image] : [])).filter(counts)
      return files.length > 0 ? [choice(face.id, face.name, files)] : []
    })
    const poses = [...new Set(who.animations.map((pose) => basePoseId(pose.id)))].flatMap((id) => {
      const files = who.animations.filter((pose) => basePoseId(pose.id) === id).flatMap(poseMedia).filter(counts)
      const name = acts.find((act) => act.id === id)?.name ?? who.animations.find((pose) => pose.id === id)?.name ?? id
      return files.length > 0 ? [choice(id, name, files)] : []
    })
    const whole = info.loveInterests[who.id] === 'addon' ? choice(who.id, who.name, personFiles(who)) : undefined
    return whole || outfits.length + expressions.length + poses.length > 0 ? [{ id: who.id, name: who.name, ...(whole && { whole }), outfits, expressions, acts: poses }] : []
  })
  const majors = (content.curriculum?.majors ?? []).filter((major) => !major.general && info.majors[major.code] === 'addon').map((major) => ({ code: major.code, name: major.subject }))
  return { characters, majors }
}

/** A pose as it goes in a pack: with only the files that count. */
function packedPose(pose: Animation, counts: (path: string) => boolean): Animation {
  const { image, clip, ...rest } = pose
  return { ...rest, ...(image && counts(image) && { image }), ...(clip && counts(clip) && { clip }) }
}

/** What of a character's outfits the picks take: the sprites asked for, and the definitions of any outfit they lean on. */
function packedOutfits(who: LoveInterest, picks: PackPicks, counts: (path: string) => boolean): PackedOutfit[] {
  const packed: PackedOutfit[] = who.outfits.flatMap((outfit) => {
    const whole = picks.outfits.includes(outfit.id)
    const sprites = Object.fromEntries(Object.entries(outfit.sprites).filter(([face, sprite]) => (whole || picks.expressions.includes(face)) && counts(sprite.image)))
    return whole || Object.keys(sprites).length > 0 ? [{ ...outfit, sprites, whole }] : []
  })
  // An outfit that builds on another, or borrows its pictures, can't be saved without it: the other comes along, as a definition and nothing more.
  const add = (outfit: Outfit): void => {
    for (const id of [outfit.inherits, outfit.fallback]) {
      const leaned = who.outfits.find((one) => one.id === id)
      if (!leaned || packed.some((one) => one.id === leaned.id)) continue
      packed.push({ ...leaned, sprites: {}, whole: false })
      add(leaned)
    }
  }
  for (const outfit of [...packed]) add(outfit)
  return packed
}

/**
 * What a pack holds for these picks, with paths as the content has them. The faces and sex-acts added in the editor
 * that anything in it is filed under come along. A character or an outfit left with nothing to give is left out.
 */
export function packManifest(content: ContentPack, selection: PackSelection, info: Ownership): PackManifest {
  const counts = packableFile(info)
  const people = everyone(content).filter((who) => selection.people.includes(who.id))
  const characters = Object.entries(selection.characters).flatMap(([id, picks]): PackedCharacter[] => {
    const who = everyone(content).find((one) => one.id === id)
    // One going whole has it all already.
    if (!who || selection.people.includes(id)) return []
    const outfits = packedOutfits(who, picks, counts)
    const animations = who.animations.filter((pose) => picks.acts.includes(basePoseId(pose.id))).map((pose) => packedPose(pose, counts)).filter((pose) => poseMedia(pose).length > 0)
    return outfits.some((outfit) => Object.keys(outfit.sprites).length > 0) || animations.length > 0 ? [{ id, name: who.name, outfits, animations }] : []
  })
  const dressed = [...characters, ...people]
  const faces = new Set(dressed.flatMap((who) => who.outfits.flatMap((outfit) => Object.keys(outfit.sprites))))
  const acts = new Set(dressed.flatMap((who) => who.animations.map((pose) => basePoseId(pose.id))))
  // A subject someone in it studies or teaches comes along, unless it is the game's own and every player has it.
  const read = people.flatMap((who) => [who.studies?.code, ...(who.teaching?.subjects.map((subject) => subject.code) ?? [])])
  const majors = (content.curriculum?.majors ?? []).filter((major) => selection.majors.includes(major.code) || (read.includes(major.code) && info.majors[major.code] === 'addon'))
  return {
    format: PACK_FORMAT,
    name: selection.name,
    looks: { expressions: content.looks.expressions.filter((face) => faces.has(face.id)), acts: content.looks.acts.filter((act) => acts.has(act.id)) },
    traits: content.traits.filter((trait) => people.some((who) => who.traitIds.includes(trait.id))),
    majors: majors.flatMap((major) => {
      const college = content.curriculum?.colleges.find((one) => one.id === major.college)
      return college ? [{ major, college }] : []
    }),
    characters,
    people
  }
}

/** One character of a pack with every file's path changed by `to`. A file it has no answer for is left out. */
export function withPackPaths(who: PackedCharacter, to: (path: string) => string | undefined): PackedCharacter {
  return {
    ...who,
    outfits: who.outfits.map((outfit) => ({
      ...outfit,
      sprites: Object.fromEntries(
        Object.entries(outfit.sprites).flatMap(([face, sprite]) => {
          const image = to(sprite.image)
          return image ? [[face, { ...sprite, image }]] : []
        })
      )
    })),
    animations: who.animations.map(({ image, clip, ...pose }) => {
      const [movedImage, movedClip] = [image && to(image), clip && to(clip)]
      return { ...pose, ...(movedImage && { image: movedImage }), ...(movedClip && { clip: movedClip }) }
    })
  }
}

/** A whole character with every file's path changed by `to`. A file it has no answer for is left out. */
export function withPersonPaths(who: LoveInterest, to: (path: string) => string | undefined): LoveInterest {
  const { outfits, animations } = withPackPaths({ ...who, outfits: who.outfits.map((outfit) => ({ ...outfit, whole: true })) }, to)
  const { birthPictures, walkSprite, room, tonedAnimations, ...rest } = who
  const moved = (path: string | undefined) => (path ? to(path) : undefined)
  const walk = moved(walkSprite)
  const births = Object.fromEntries(Object.entries(birthPictures).flatMap(([tone, image]) => (moved(image) ? [[tone, moved(image)]] : [])))
  const images = room?.images && Object.fromEntries(Object.entries(room.images).flatMap(([when, image]) => (moved(image) ? [[when, moved(image)]] : [])))
  return {
    ...rest,
    outfits: outfits.map(({ whole: _whole, ...outfit }) => outfit),
    animations,
    birthPictures: births,
    // Each tone's sex-acts moved as the light ones are.
    tonedAnimations: Object.fromEntries(Object.entries(tonedAnimations).map(([tone, poses]) => [tone, withPackPaths({ id: who.id, name: who.name, outfits: [], animations: poses ?? [] }, to).animations])),
    ...(walk && { walkSprite: walk }),
    ...(room && { room: { ...room, ...(images && { images }) } })
  }
}

/** Every file a character of a pack names. */
export function packedFiles(who: PackedCharacter): string[] {
  return [...new Set([...who.outfits.flatMap((outfit) => Object.values(outfit.sprites).map((sprite) => sprite.image)), ...who.animations.flatMap(poseMedia)])]
}

/** Every file a whole character names. */
export function personFiles(who: LoveInterest): string[] {
  const own = [...Object.values(who.room?.images ?? {}), ...Object.values(who.birthPictures), ...Object.values(who.tonedAnimations).flatMap((poses) => (poses ?? []).flatMap(poseMedia)), who.walkSprite].filter((path): path is string => typeof path === 'string')
  return [...new Set([...packedFiles({ ...who, outfits: who.outfits.map((outfit) => ({ ...outfit, whole: true })) }), ...own])]
}

/** Every file a pack names. */
export function allPackFiles(manifest: PackManifest): string[] {
  return [...new Set([...manifest.characters.flatMap(packedFiles), ...manifest.people.flatMap(personFiles)])]
}

/** A character with a pack's things laid over hers: what she has that it does not name stays. Paths are to have been made hers first. */
export function withPacked(who: LoveInterest, packed: PackedCharacter): LoveInterest {
  const outfits = packed.outfits.reduce((all, { whole, ...outfit }) => {
    const mine = all.find((one) => one.id === outfit.id)
    if (!mine) return [...all, outfit]
    const merged = { ...(whole ? outfit : mine), sprites: { ...mine.sprites, ...outfit.sprites } }
    return all.map((one) => (one === mine ? merged : one))
  }, who.outfits)
  const animations = packed.animations.reduce((all, pose) => {
    const mine = all.find((one) => one.id === pose.id)
    return mine ? all.map((one) => (one === mine ? { ...mine, ...pose } : one)) : [...all, pose]
  }, who.animations)
  return { ...who, outfits, animations }
}

/** What importing a pack would do, to be shown before it does. */
export interface PackPreview {
  name: string
  /** Added faces, sex-acts and traits that are new to this game, by name. */
  looks: string[]
  /** Subjects by name, and whether this game has that code already: it then keeps its own. */
  majors: { name: string; present: boolean }[]
  /** Whole characters: `replaces` when this game has someone of that id, who is taken away. */
  people: { id: string; name: string; replaces: boolean; pictures: number; clips: number }[]
  characters: {
    id: string
    name: string
    /** She is in this game: one who is not is passed over. */
    present: boolean
    outfits: string[]
    expressions: string[]
    acts: string[]
    pictures: number
    clips: number
    /** What she has already that would be replaced, by name. */
    replaces: string[]
  }[]
}

export function packPreview(content: ContentPack, manifest: PackManifest): PackPreview {
  const known = (id: string) => content.looks.expressions.some((face) => face.id === id) || content.looks.acts.some((act) => act.id === id) || content.traits.some((trait) => trait.id === id)
  const sizeOf = (files: string[]) => ({ clips: files.filter(isClip).length, pictures: files.filter((file) => !isClip(file)).length })
  return {
    name: manifest.name,
    looks: [...manifest.looks.expressions, ...manifest.looks.acts, ...manifest.traits].filter((look) => !known(look.id)).map((look) => look.name),
    majors: manifest.majors.map(({ major }) => ({ name: major.subject, present: (content.curriculum?.majors ?? []).some((one) => one.code === major.code) })),
    people: manifest.people.map((who) => ({ id: who.id, name: who.name, replaces: everyone(content).some((one) => one.id === who.id), ...sizeOf(personFiles(who)) })),
    characters: manifest.characters.map((packed) => {
      const who = everyone(content).find((one) => one.id === packed.id)
      const files = packedFiles(packed)
      const clips = files.filter(isClip).length
      const faces = [...new Set(packed.outfits.filter((outfit) => !outfit.whole).flatMap((outfit) => Object.keys(outfit.sprites)))]
      const acts = [...new Set(packed.animations.map((pose) => basePoseId(pose.id)))]
      const names = posesOf(manifest.looks).all
      return {
        id: packed.id,
        name: who?.name ?? packed.name,
        present: who !== undefined,
        outfits: packed.outfits.filter((outfit) => outfit.whole).map((outfit) => outfit.name),
        expressions: faces.map((id) => manifest.looks.expressions.find((face) => face.id === id)?.name ?? id),
        acts: acts.map((id) => names.find((act) => act.id === id)?.name ?? id),
        pictures: files.length - clips,
        clips,
        replaces: [
          ...packed.outfits.flatMap((outfit) => {
            const mine = who?.outfits.find((one) => one.id === outfit.id)
            return mine && Object.keys(outfit.sprites).some((face) => face in mine.sprites) ? [mine.name] : []
          }),
          ...packed.animations.flatMap((pose) => (who?.animations.some((one) => one.id === pose.id && poseMedia(one).length > 0) ? [pose.name] : []))
        ]
      }
    })
  }
}
