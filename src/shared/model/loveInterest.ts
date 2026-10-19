import { z } from "zod";
import { ConditionSchema } from "./condition";
import { StudiesSchema, TeachingSchema } from "./course";
import { StatSchema } from "./stats";
import { ChildNamesSchema } from "./pregnancy";
import { RoleSchema } from "./expedition";

/**
 * One picture of the character. Written in content either as just the image path, or as
 * an object that also describes it so the LLM can tell when it fits.
 */
export const SpriteSchema = z
  .union([
    z.string(),
    z.object({ image: z.string(), description: z.string().default("") }),
  ])
  .transform((sprite) =>
    typeof sprite === "string" ? { image: sprite, description: "" } : sprite,
  );
export type Sprite = z.infer<typeof SpriteSchema>;

/** The faces every outfit can be drawn with. In a scene the LLM picks one of these for each love interest in every reply. */
export const EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "embarrassed",
  "aroused",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** The seed a love interest's pictures are generated with unless she is given one of her own. */
export const DEFAULT_IMAGE_SEED = 60;

/**
 * The four outfits every love interest has. The pregnant two are worn once a pregnancy
 * shows, in place of the other two. A character may have more besides.
 */
export const STANDARD_OUTFITS = [
  { id: "default", name: "Usual clothes", description: "", pregnant: false },
  {
    id: "pregnant",
    name: "Pregnant",
    inherits: "default",
    description: "She has a round, pregnant belly.",
    pregnant: true,
  },
  {
    id: "nude",
    name: "Nude",
    description: "nothing at all, completely nude",
    pregnant: false,
  },
  {
    id: "nude-pregnant",
    name: "Nude, pregnant",
    inherits: "nude",
    description: "She has a round, pregnant belly.",
    pregnant: true,
  },
] as const;

export const OutfitSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * What the character is wearing, told to the AI and to an image model. For an outfit
   * that inherits, only what it adds to the one it builds on.
   */
  description: z.string().default(""),
  /**
   * The id of its parent: another of her outfits, which this one builds on. Its description
   * is then the parent's with its own added to it: `pregnant` is `default` plus "She has a
   * round, pregnant belly." A pregnant outfit is also the pregnant form of its parent: once
   * her pregnancy shows it is worn wherever the parent is asked for. `pregnant` has `default`
   * for its parent, and `nude-pregnant` has `nude`.
   */
  inherits: z.string().optional(),
  /**
   * The id of another of her outfits whose pictures stand for this one, when she looks the
   * same in both: a slime whose nude is her default. This outfit then needs none of its own.
   */
  fallback: z.string().optional(),
  /** Sprites keyed by their title: one of `EXPRESSIONS`, or any other name for a picture of some other kind. */
  sprites: z.record(z.string(), SpriteSchema).default({}),
  /** Drawn pregnant. Worn in its parent's place once a pregnancy shows, and not before. */
  pregnant: z.boolean().default(false),
  /** Worn only where the content puts her in it, as a cutscene of a society's night does: never offered to the LLM to choose. */
  oneOff: z.boolean().optional(),
});
export type Outfit = z.infer<typeof OutfitSchema>;

/** The outfit whose pictures are shown for this one: itself, or the one it falls back on (and the one that falls back on, and so on). */
export function picturedOutfit(outfits: Outfit[], outfit: Outfit): Outfit {
  const seen = new Set<string>();
  let at = outfit;
  for (
    let next: Outfit | undefined = outfit;
    next && !seen.has(next.id);
    next = outfits.find((o) => o.id === at.fallback)
  ) {
    seen.add(next.id);
    at = next;
  }
  return at;
}

/**
 * An outfit's description in its parts: the description of the outfit it builds on (and
 * of the one that builds on, and so on), then what it adds itself. One part for an outfit
 * that inherits nothing.
 */
export function outfitParts(
  outfits: Outfit[],
  outfit: Outfit | undefined,
): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  // Followed from the outfit back to where its description starts, however the content is written.
  for (
    let at = outfit;
    at && !seen.has(at.id);
    at = outfits.find((o) => o.id === at?.inherits)
  ) {
    seen.add(at.id);
    if (at.description.trim() !== "") parts.unshift(at.description.trim());
  }
  return parts;
}

/** An outfit's whole description, with whatever it inherits in front of what it adds. */
export function outfitDescription(
  outfits: Outfit[],
  outfit: Outfit | undefined,
): string {
  return outfitParts(outfits, outfit)
    .map((part, i, all) =>
      i < all.length - 1 && !/[.!?]$/.test(part) ? `${part}.` : part,
    )
    .join(" ");
}

/**
 * An explicit pose that takes the place of the character's sprite: a picture, and on top
 * of it, if she has one, a clip that is played in the picture's place. The LLM decides
 * when to show one from its name and description. In the editor these are the NSFW
 * section, laid out as an outfit's faces are; in the content and the tags they are still
 * called animations.
 */
export const AnimationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Tells the LLM what it shows, so it knows when it fits. */
  description: z.string().default(""),
  /** Path inside the content pack of the picture. A pose is a picture first. */
  image: z.string().optional(),
  /** Path inside the content pack of a clip (.mp4, .webm) of the same thing, played in the picture's place when she has one. */
  clip: z.string().optional(),
  /** For the clip: plays round and round until something ends it. When false it plays once, and the sprite comes back. A picture stays until something ends it. */
  loop: z.boolean().default(true),
});
export type Animation = z.infer<typeof AnimationSchema>;

/**
 * The poses every character has a slot for in the NSFW section, as she has a slot for every
 * face in an outfit. `description` is what the LLM is told of one whose own is left empty,
 * and `draws` is what the picture is asked for with.
 */
export const NSFW_POSES = [
  {
    id: "blowjob",
    name: "Blowjob",
    description: "she takes him in her mouth",
    draws:
      "POV from above: she kneels in front of a man and performs oral sex on him, penis in her mouth, looking up at the camera",
  },
  {
    id: "missionary",
    name: "Missionary",
    description: "on her back, him above her",
    draws:
      "POV: she lies on her back on a bed, head on a pillow, having sex in the missionary position, legs apart, looking up at the camera. a mans penis is penetrating her pussy",
  },
  {
    id: "doggy",
    name: "Doggy",
    description: "on her hands and knees, him behind her",
    draws:
      "she is on her hands and knees on a bed having sex from behind, seen from the side, looking back over her shoulder. a mans penis is penetrating her pussy from behind",
  },
  {
    id: "cowgirl",
    name: "Cowgirl",
    description: "astride him, on top",
    draws:
      "POV from below: she sits astride a man having sex in the cowgirl position, her hands on his chest, looking down at the camera",
  },
  {
    id: "creampie",
    name: "Creampie",
    description: "the moment he finishes inside her",
    draws:
      "she lies back on a bed after sex, legs apart, lots of white semen leaking from her vagina, flushed and out of breath",
  },
  {
    id: "facial",
    name: "Facial",
    description: "the moment he finishes on her face",
    draws:
      "close on her face and shoulders after sex, semen on her face, eyes half closed, lips parted",
  },
] as const;

// The poses that are what follows the act and not the act: each is a single moment.
const MOMENTS: readonly string[] = ["creampie", "facial"];

/**
 * Whether a pose is a moment: shown for the one reply it happens in, and never for the
 * next as well, however the LLM asks.
 */
export function isMoment(poseId: string): boolean {
  return MOMENTS.includes(poseId);
}

// The poses that show him finishing inside her: choosing one says what the [SEEDED] tag says.
const SEEDING: readonly string[] = ["creampie"];

/**
 * Whether a pose shows the moment that can leave her with child. Asking for one counts as
 * the [SEEDED] tag does, so that conception does not hang on the LLM remembering both.
 */
export function isSeeding(poseId: string): boolean {
  return SEEDING.includes(poseId);
}

// What a pose drawn pregnant is filed under: the pose it is built on, with this before it.
const PREGNANT_POSE = "pregnant-";

/**
 * The same poses drawn pregnant: a second row in the NSFW section, each built on the pose of the row above it. It is
 * drawn from that pose's own wording with her pregnant nude in place of her nude, and it is shown in that pose's
 * place once a pregnancy shows. Being pregnant is the game's to draw and not the LLM's to choose: it asks for the
 * plain pose, and while her pregnancy shows the game puts up this one instead, if she has the picture.
 */
export const NSFW_PREGNANT_POSES = NSFW_POSES.map((pose) => ({
  ...pose,
  id: `${PREGNANT_POSE}${pose.id}`,
  name: `${pose.name}, pregnant`,
  /** The pose it is built on. */
  base: pose.id,
}));

/** What of a pose is shown, best first: its clip, then its picture. */
export function poseMedia(pose: Pick<Animation, "clip" | "image">): string[] {
  return [pose.clip, pose.image].filter((file): file is string => file !== undefined);
}

/** Every pose with a slot of its own: the standard ones, and each of them drawn pregnant. */
export const STANDARD_POSES = [...NSFW_POSES, ...NSFW_PREGNANT_POSES];

/** Whether a pose is one drawn pregnant, which stands in for another and is not chosen for itself. */
export function isPregnantPose(poseId: string): boolean {
  return poseId.startsWith(PREGNANT_POSE);
}

/** The pose a given one is built on: itself, unless it is one drawn pregnant. */
export function basePoseId(poseId: string): string {
  return isPregnantPose(poseId) ? poseId.slice(PREGNANT_POSE.length) : poseId;
}

/** The id of the pose a given one is drawn pregnant as. */
export function pregnantPoseId(poseId: string): string {
  return `${PREGNANT_POSE}${poseId}`;
}

/** What a pose shows, as the LLM is told it: her own words for it, or the standard ones. */
export function poseDescription(
  pose: Pick<Animation, "id" | "description">,
): string {
  return (
    pose.description.trim() ||
    NSFW_POSES.find((known) => known.id === pose.id)?.description ||
    ""
  );
}

/** Where the character is at a given time. The first matching entry wins. */
export const ScheduleEntrySchema = z.object({
  weekdays: z.array(z.string()).optional(),
  periods: z.array(z.string()).optional(),
  locationId: z.string(),
});
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

/** A love interest's own room: somewhere private a scene can go, with artwork of its own. */
export const RoomSchema = z.object({
  /** What it is, in a few words: "a garret at the Honeyed Bee". */
  name: z.string(),
  /** Told to the LLM when a scene is there. */
  description: z.string().default(""),
  /** The location it is in. Going there from that location takes no time. */
  locationId: z.string(),
  /** Image path inside the content pack. Left out, the location's own artwork is shown. */
  background: z.string().optional(),
  /** A view of its location that is this room's picture, by day and by night, in place of a picture of its own. */
  viewId: z.string().optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const SecretSchema = z.object({
  text: z.string(),
  /** Until these pass, the character keeps the secret to themselves. */
  revealWhen: z.array(ConditionSchema).default([]),
});
export type Secret = z.infer<typeof SecretSchema>;

/** Fields that exist only to steer the AI when this character speaks. */
export const LoveInterestAiSchema = z.object({
  speechPattern: z.string().default(""),
  tone: z.string().default(""),
  verbalQuirks: z.array(z.string()).default([]),
  exampleDialogue: z
    .array(z.object({ user: z.string(), reply: z.string() }))
    .default([]),
  backstory: z.string().default(""),
  /** Things they know and will tell the player if asked: directions, gossip, how the place works. */
  knowledge: z.array(z.string()).default([]),
  secrets: z.array(SecretSchema).default([]),
  extraInstructions: z.string().default(""),
});
export type LoveInterestAi = z.infer<typeof LoveInterestAiSchema>;

/**
 * What a character is. The first three are love interests; an `npc` is someone to talk to
 * and work for, with a look, a voice and a place to be found, and no relationship to build.
 * Changing an NPC's kind is all it takes to make a love interest of her.
 */
export const LOVE_INTEREST_KINDS = [
  "student",
  "teacher",
  "outsider",
  "npc",
] as const;
export type LoveInterestKind = (typeof LOVE_INTEREST_KINDS)[number];

/**
 * A character: a love interest, or an NPC. Both are written the same way, in the same
 * folder, and only an id, a name, an age and an outfit are needed; everything else has a
 * default, so an NPC's file can be as short as she is.
 */
export const LoveInterestSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What they are, in a few words: "hall manager of the Cloister Halls". Shown beside an NPC's name. */
  role: z.string().default(""),
  age: z.number().int().min(18),
  pronouns: z.string().default("she/her"),
  bio: z.string().default(""),
  appearance: z.string().default(""),
  personality: z.string().default(""),
  traitIds: z.array(z.string()).default([]),
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
  /**
   * The stats they are drawn to in the player. High ones make them warmer, quicker to
   * grow fond, and more likely to write and invite him unprompted.
   */
  admires: z.array(StatSchema).max(3).default([]),
  /**
   * Other love interests she is friends with in every game, by id, and those she is at
   * odds with. A student with few of either is given more at random when a game begins.
   */
  friends: z.array(z.string()).default([]),
  enemies: z.array(z.string()).default([]),
  birthday: z
    .object({ month: z.string(), day: z.number().int().min(1) })
    .optional(),
  /** Their name on Bloomr, without the @. Left out, one is made from their name. */
  handle: z.string().optional(),
  outfits: z.array(OutfitSchema).min(1),
  defaultOutfitId: z.string(),
  /**
   * How far down their sprites the face sits, as a percentage of the image height. Used
   * to crop small portraits. Most figures fill the image, with the face near the top.
   */
  faceY: z.number().min(0).max(100).default(4),
  /**
   * ImageGen preferred seed: the seed her pictures are generated with, so that a new one
   * comes out looking like the ones she has. Left out, each picture gets a seed of its own.
   */
  imageSeed: z.number().int().min(0).optional(),
  /**
   * How tall she stands on stage, as a percentage of a full-height figure. Her pictures
   * are drawn filling the frame like anyone's; someone short is made so here, standing on
   * the same floor as the others. Portraits are cut from the picture as drawn.
   */
  stageHeight: z.number().min(30).max(120).default(100),
  /**
   * Where things stand with the player when a game begins, for someone he already knows: an
   * old friend. She has been met and he has her Bloomr from the first day. Left out, they
   * are strangers.
   */
  startsAt: z
    .object({
      affection: z.number().min(0),
      trust: z.number().min(0),
      desire: z.number().min(0),
    })
    .optional(),
  /**
   * What they are. A student has `studies` and takes courses; a teacher has `teaching` and
   * gives them; an outsider is a love interest with nothing to do with classes; an `npc` is
   * not a love interest at all. Left out, it is read off `studies` and `teaching`.
   */
  kind: z.enum(LOVE_INTEREST_KINDS).optional(),
  /** What she does in a party that goes below. Without one she does not come. */
  partyRole: RoleSchema.optional(),
  /** A student's own subject. Omitted for anyone who isn't one. */
  studies: StudiesSchema.optional(),
  /** What a teacher teaches. Omitted for anyone who isn't one. */
  teaching: TeachingSchema.optional(),
  animations: z.array(AnimationSchema).default([]),
  schedule: z.array(ScheduleEntrySchema).default([]),
  /** Where she lives. A scene can move there. */
  room: RoomSchema.optional(),
  /** A picture of her just after giving birth: sitting up in a hospital bed with the child in her arms. It is the whole stage of the scene of a birth he is there for. */
  birthPicture: z.string().optional(),
  /** Her walking in profile, facing right, in her usual clothes, cut out: she walks across the loading screen of a scene with her. */
  walkSprite: z.string().optional(),
  /** The names she would give a child of hers: she suggests the next one not yet used when it is born. */
  childNames: ChildNamesSchema.prefault({}),
  /** She takes something against the Bloom when the game begins, as most women do. She may stop, in a scene, when she chooses to. */
  birthControl: z.boolean().default(true),
  ai: LoveInterestAiSchema.prefault({}),
});
export type LoveInterest = z.infer<typeof LoveInterestSchema>;

/** A student's year as an American university says it: "sophomore", or "graduate student" from the fifth on. */
export function classYear(level: number): string {
  return ["freshman", "sophomore", "junior", "senior"][level - 1] ?? "graduate student";
}

/** Whether a character is a student, a teacher, a love interest from outside the University, or an NPC. */
export function kindOf(
  li: Pick<LoveInterest, "kind" | "studies" | "teaching">,
): LoveInterestKind {
  return (
    li.kind ?? (li.teaching ? "teacher" : li.studies ? "student" : "outsider")
  );
}
