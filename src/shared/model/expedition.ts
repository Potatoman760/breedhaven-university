import { z } from 'zod'
import { ModifierSchema } from './modifier'
import { IntroSchema } from './orientation'

/** What a woman does in a party: one of these is written in her file, and with it what she can do in a fight. */
export const ROLES = ['guard', 'striker', 'hexer', 'warder', 'healer'] as const
export const RoleSchema = z.enum(ROLES)
export type Role = z.infer<typeof RoleSchema>

/**
 * What an action in a fight does. `attack` hurts one enemy; `weaken` hurts it a little and has it hit less hard for
 * a few rounds; `shield` puts up a ward that takes the next hits meant for the party; `heal` gives one of the party
 * her footing back; `guard` halves what she takes until her next turn; `taunt` does that and draws the enemy to her.
 */
export const ACTION_KINDS = ['attack', 'weaken', 'shield', 'heal', 'guard', 'taunt'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const PartyActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ACTION_KINDS),
  /** How much it does: footing taken, given back or warded, before anything about her is counted. Nothing for a guard. */
  power: z.number().min(0).default(0),
  /** Rounds before she can do it again. None, and it is always to hand. */
  cooldown: z.number().int().min(0).default(0),
  /** An attack or weakening on every enemy standing, or a heal on everyone in the party, each for the whole of it. */
  all: z.boolean().default(false),
  /** Rounds each enemy it lands on loses its turn. */
  stuns: z.number().int().min(0).default(0),
  /** It also lifts every hex and silence from the party. */
  cleanses: z.boolean().default(false),
  /** Once a run, however long: what an ultimate is. */
  once: z.boolean().default(false)
})
export type PartyAction = z.infer<typeof PartyActionSchema>

export const RoleConfigSchema = z.object({
  id: RoleSchema,
  name: z.string(),
  /** How much she can take before she is down. */
  footing: z.number().int().min(1),
  actions: z.array(PartyActionSchema).min(1),
  /** What she can do besides once she is at `roleMoveStage` with him, as every woman of her role can. */
  friendAction: PartyActionSchema
})
export type RoleConfig = z.infer<typeof RoleConfigSchema>

/**
 * The ways an enemy fights beyond hitting, which the deeper ones have more of. `armor` is taken off every blow on it
 * until it is weakened; every `charges` rounds its hit is a heavy one, twice as hard and shown a turn ahead; every
 * `summons.every` rounds it calls up another of its kind instead; with one of its side under half its footing, it
 * mends it by `mends` instead of hitting; and its hit `silences` whoever it lands on, leaving her only her first move.
 */
const EnemyWaysSchema = z.object({
  armor: z.number().int().min(0).default(0),
  charges: z.number().int().min(0).default(0),
  summons: z.object({ enemyId: z.string(), every: z.number().int().min(1) }).optional(),
  mends: z.number().int().min(0).default(0),
  silences: z.boolean().default(false)
})

/** Something the Bloom has made of itself below. */
export const EnemySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** Its picture, relative to the pack. Without one it is drawn as a card with its name on. */
  image: z.string().optional(),
  footing: z.number().int().min(1),
  /** What a hit of its takes, before the die. */
  attack: z.number().min(0),
  /** It hits everyone at once, for less each. */
  sweeps: z.boolean().default(false),
  /** Its hit leaves whoever it lands on doing less for a couple of rounds. */
  hexes: z.boolean().default(false),
  /** The role whose work it cannot stand: hers does half as much again to it. */
  weakTo: RoleSchema.optional(),
  ...EnemyWaysSchema.shape,
  /**
   * What it turns into as it is worn down: each phase from the share of its footing it begins at, what it says of
   * itself then, and what of its ways it changes. Each holds from then on, over those before it.
   */
  phases: z
    .array(
      z.object({
        /** What a translation knows it by; left out, it is matched by its place. */
        id: z.string().optional(),
        at: z.number().gt(0).lt(1),
        text: z.string(),
        attack: z.number().min(0).optional(),
        sweeps: z.boolean().optional(),
        hexes: z.boolean().optional(),
        armor: z.number().int().min(0).optional(),
        charges: z.number().int().min(0).optional(),
        summons: z.object({ enemyId: z.string(), every: z.number().int().min(1) }).optional(),
        mends: z.number().int().min(0).optional(),
        silences: z.boolean().optional()
      })
    )
    .default([])
})
export type Enemy = z.infer<typeof EnemySchema>

/** What an enemy means to do on the enemies' next turn, shown to the party before it: a hit, at whom, or something else. */
export const INTENT_KINDS = ['hit', 'sweep', 'heavy', 'summon', 'mend', 'stunned'] as const
export type IntentKind = (typeof INTENT_KINDS)[number]
export const IntentSchema = z.object({ kind: z.enum(INTENT_KINDS), target: z.string().optional() })
export type Intent = z.infer<typeof IntentSchema>

/** What is carried up from below: money, and things for the bag. */
export const FindsSchema = z.object({
  money: z.number().int().min(0).default(0),
  items: z.record(z.string(), z.number().int().min(1)).default({})
})
export type Finds = z.infer<typeof FindsSchema>

/**
 * One stop on the way down. A `fight` and the `guardian` are fought; a `find` is something lying there; a
 * `checkpoint` is where what has been found so far is made safe and everyone gets their breath back.
 */
export const NODE_KINDS = ['fight', 'find', 'checkpoint', 'guardian'] as const
export const NodeSchema = z.object({
  /** What a translation knows it by; left out, it is matched by its place. */
  id: z.string().optional(),
  kind: z.enum(NODE_KINDS),
  name: z.string().default(''),
  enemyIds: z.array(z.string()).default([]),
  finds: FindsSchema.prefault({})
})
export type ExpeditionNode = z.infer<typeof NodeSchema>

/** What a relic can do in a scene when he uses it there, once a scene. */
export const RELIC_USES = ['unravel', 'stillness', 'sapphic', 'minds-eye', 'first-seed'] as const
export type RelicUse = (typeof RELIC_USES)[number]

/**
 * What re-seating an anchor leaves him with for good. Either it is always at work, as long as he leaves it on: a
 * modifier, like what a course teaches, or traits every woman has while it is; or it is used in a scene, once a scene.
 */
export const RelicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Name of a built-in icon, as an item has. */
  icon: z.string().default('stone'),
  /** What the thing itself looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** Its picture, relative to the pack: shown in place of the icon where there is one. */
  image: z.string().optional(),
  modifier: ModifierSchema.optional(),
  /** Traits every love interest has while it is on: what they are is told to each of them as her own. */
  traitIds: z.array(z.string()).default([]),
  /** What it does when he uses it in a scene. */
  use: z.enum(RELIC_USES).optional()
})
export type Relic = z.infer<typeof RelicSchema>

export const DepthSchema = z.object({
  /** What a translation knows it by; the game knows a depth by its place. */
  id: z.string().optional(),
  name: z.string(),
  /** What the place looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** The picture it is fought in front of, relative to the pack. Without one, the way down is shown, darkened. */
  image: z.string().optional(),
  nodes: z.array(NodeSchema).min(1),
  relic: RelicSchema,
  /** What its enemies' footing and blows are multiplied by: how hard it is, beside what they are. */
  power: z.number().min(0.1).default(1),
  /** The stage with him every woman who comes needs, where it asks one. */
  partyStage: z.string().optional()
})
export type Depth = z.infer<typeof DepthSchema>

/**
 * Echoes: once every anchor is set, a way down that is never the same twice, put together from the depths' places
 * and enemies, all of them the stronger by `power`. Each woman who comes back from one won with him has `outfitId`
 * from then on, if she has it.
 */
export const EchoesSchema = z.object({
  name: z.string().default('Echoes'),
  power: z.number().min(0.1).default(1.5),
  /** How many fights before its rest, and how many enemies each. */
  fights: z.number().int().min(1).default(2),
  foes: z.number().int().min(1).default(3),
  /** What its stops give up, before what it was found in is counted. */
  money: z.number().int().min(0).default(60),
  outfitId: z.string().default('echoes')
})
export type Echoes = z.infer<typeof EchoesSchema>

/** The rules of going below. A content pack without this has no Undercroft. */
export const ExpeditionConfigSchema = z.object({
  name: z.string().default('the Undercroft'),
  /** The picture money that is found is shown with: a pouch of coins, say. */
  moneyImage: z.string().optional(),
  /** The picture a checkpoint is shown with: a campfire, say. */
  restImage: z.string().optional(),
  /** The pictures the epilogue tells the way down over: the University saved, with every anchor set, and overrun, with any left. */
  endingImages: z.object({ saved: z.string().optional(), overrun: z.string().optional() }).default({}),
  /** The emblem of each kind of stop on the way down (fight, find, checkpoint, guardian): pictures in the pack. */
  stopImages: z.record(z.string(), z.string()).default({}),
  /**
   * Pictures the fights' effects are drawn with, by name: "firebolt", "explosion", "shadow-orb", "hex-sigil", "force-orb",
   * "smite", "heal", "ward", "stone-spikes". Each glowing one is on black, laid over the fight so that the black drops
   * away. One left out is drawn in lines and circles instead.
   */
  effects: z.record(z.string(), z.string()).default({}),
  /** Where the way down is. */
  entryLocationId: z.string(),
  /** The day it is first open on, counted from 1. */
  opensOnDay: z.number().int().min(1).default(1),
  /** Who shows him the way down when it opens. Without her, it is simply open. */
  guideId: z.string().optional(),
  /**
   * Being shown it: how long she keeps him, what she writes to set the hour and to set it again when he did not come
   * (`{date}` and `{place}` are filled in), and the scene of it, read as a cutscene before she shows him how a way down
   * is gone about.
   */
  intro: z.object({ hours: z.number().int().min(1).default(1), text: z.string(), missedText: z.string(), cutscene: IntroSchema }).optional(),
  /** How long a run takes out of his day, however it ends. */
  hours: z.number().int().min(1).default(3),
  /** How many women he may take, and the trust one needs in him to come. */
  partySize: z.number().int().min(1).default(2),
  trustNeeded: z.number().min(0).default(30),
  /** His own footing before his endurance is counted, and what each point of that bonus adds. */
  playerFooting: z.number().int().min(1).default(20),
  footingPerEndurance: z.number().min(0).default(3),
  /** What his Sire's actions cost him in energy, and what an anchored woman's next action is multiplied by. */
  anchorEnergy: z.number().min(0).default(8),
  groundEnergy: z.number().min(0).default(6),
  anchorPower: z.number().min(1).default(1.5),
  /** How much of a woman's footing a checkpoint gives back, as a share. */
  checkpointRest: z.number().min(0).max(1).default(0.4),
  /** Affection at which she strikes true as often as she ever will, and how often that is. A true strike does half as much again. */
  critAffection: z.number().min(1).default(100),
  critChance: z.number().min(0).max(1).default(0.25),
  /** Footing a woman has besides her role's for each point of the trust she has in him. */
  footingPerTrust: z.number().min(0).default(0.1),
  /**
   * Her passion: what each thing she does adds to it at full desire for him (less as she has less), where it is full,
   * and what her next action is multiplied by once it is.
   */
  passionPerAction: z.number().min(0).default(1.5),
  passionLimit: z.number().min(1).default(3),
  passionPower: z.number().min(1).default(1.5),
  /** The stages with him a woman needs for her role's further move and for her own ultimate. */
  roleMoveStage: z.string().default('friend'),
  ultimateStage: z.string().default('lover'),
  /** What a woman's work is multiplied by at each stage of a pregnancy, by the stage's id. A stage not named here cannot come. */
  pregnancyPower: z.record(z.string(), z.number().min(1)).default({}),
  /** A pregnant woman's surge: what each thing she does adds, where it breaks loose, what breaking loose takes from everyone, and what grounding her clears. */
  surgePerAction: z.number().min(0).default(1),
  surgeLimit: z.number().min(1).default(3),
  misfire: z.number().min(0).default(5),
  grounds: z.number().min(0).default(2),
  /** Trust gained by each who came when an anchor is re-seated, and lost by each who went down when the run is lost. */
  trustWon: z.number().min(0).default(2),
  trustLost: z.number().min(0).default(2),
  roles: z.array(RoleConfigSchema).min(1),
  enemies: z.array(EnemySchema).min(1),
  depths: z.array(DepthSchema).min(1),
  echoes: EchoesSchema.prefault({})
})
export type ExpeditionConfig = z.infer<typeof ExpeditionConfigSchema>

/** The id the player fights under. No character may have it. */
export const HIM = 'him'

/** One of the party in a run: what she has left, and what is on her. */
export const FighterSchema = z.object({
  id: z.string(),
  footing: z.number(),
  max: z.number(),
  /** Rounds left before each of her actions is ready again, by its id. */
  cooldowns: z.record(z.string(), z.number().int()).default({}),
  surge: z.number().default(0),
  /** Until her next turn. */
  guarding: z.boolean().default(false),
  taunting: z.boolean().default(false),
  /** He has steadied her: her next action is stronger. */
  anchored: z.boolean().default(false),
  /** He is standing in front of her: the next hit meant for her is his. */
  covered: z.boolean().default(false),
  /** Rounds for which what she does counts for less. */
  hexed: z.number().int().default(0),
  /** Rounds for which she has only her first move. */
  silenced: z.number().int().default(0),
  /** Her passion, filling as she acts; full, her next action is the stronger for it. */
  passion: z.number().default(0),
  impassioned: z.boolean().default(false),
  /** What she can do once a run that she has done, by id. */
  spent: z.array(z.string()).default([])
})
export type Fighter = z.infer<typeof FighterSchema>

export const FoeSchema = z.object({
  /** Its place in the fight: two of a kind are told apart by it. */
  key: z.string(),
  enemyId: z.string(),
  footing: z.number(),
  max: z.number(),
  /** Rounds for which it hits less hard. */
  weakened: z.number().int().default(0),
  /** Rounds for which it does nothing. */
  stunned: z.number().int().default(0),
  /** How many of its phases it is into. */
  phase: z.number().int().default(0),
  /** How many times it has mended one of its side, and called up another, this fight. */
  mended: z.number().int().default(0),
  called: z.number().int().default(0),
  /** What it means to do on the enemies' next turn. */
  intent: IntentSchema.optional()
})
export type Foe = z.infer<typeof FoeSchema>

/**
 * Something to be seen happening to one of those in a fight: a cut across an enemy, a ward lighting up over one of
 * the party. The view plays it where she or it stands; nothing of the game depends on it.
 */
export const FX_KINDS = ['slash', 'crit', 'hit', 'absorb', 'ward', 'heal', 'guard', 'anchor', 'ground', 'hex', 'weaken', 'misfire', 'fall'] as const
export const FightFxSchema = z.object({
  kind: z.enum(FX_KINDS),
  /** Whom it is on: the id of one of the party, or an enemy's key. */
  on: z.string(),
  /** The number that goes up with it, when it has one. */
  amount: z.number().optional(),
  /** Who did it, for what flies from her to whom it is on: the id of one of the party, or an enemy's key. */
  by: z.string().optional(),
  /** What it looks like: the role and action that did it ("striker:strike"), or how an enemy hits ("sweep", "claw"). Left out, as its kind is drawn. */
  style: z.string().optional()
})
export type FightFx = z.infer<typeof FightFxSchema>

/** One thing that happened in a fight, for the view to say, to show on a face, and to play. */
export const FightEventSchema = z.object({
  text: z.string(),
  /** Whose face it changes, and to what. */
  faces: z.record(z.string(), z.string()).default({}),
  fx: z.array(FightFxSchema).default([])
})
export type FightEvent = z.infer<typeof FightEventSchema>

export const FightSchema = z.object({
  foes: z.array(FoeSchema),
  round: z.number().int().default(1),
  /** Whose turn it is, as a place in the party. */
  turn: z.number().int().default(0),
  /** What the last thing done came to. */
  events: z.array(FightEventSchema).default([])
})
export type Fight = z.infer<typeof FightSchema>

/** A run in progress, kept in the save so that it is there again after loading. */
export const ExpeditionRunSchema = z.object({
  /** The depth it is at, or for an echo, the one whose place it is in. */
  depth: z.number().int().min(0),
  /** What its enemies are multiplied by. */
  power: z.number().default(1),
  /** An echo's own way down, put together as it began. */
  echo: DepthSchema.optional(),
  node: z.number().int().min(0),
  startedAt: z.number().int(),
  party: z.array(FighterSchema).min(1),
  /** What is left of the ward a warder put up. */
  ward: z.number().default(0),
  /** What has been picked up since the last checkpoint, and what is safe. */
  found: FindsSchema.prefault({}),
  banked: FindsSchema.prefault({}),
  /** Who went down at any point, for what they make of it afterwards. */
  downed: z.array(z.string()).default([]),
  /** How many numbers the run has drawn, so that the next is the next of the same run. */
  rolls: z.number().int().default(0),
  fight: FightSchema.optional(),
  /** The stop he is at is dealt with, and he can go on. */
  done: z.boolean().default(false),
  /** What there is to say of the stop he is at. */
  note: z.string().default(''),
  /** What the stop he is at gave up, for the screen that shows it: a fight won, or something lying there. */
  spoils: FindsSchema.optional(),
  /** At a checkpoint: what each of the party got back, by id, and what was made safe there. */
  rest: z.object({ healed: z.record(z.string(), z.number()), secured: FindsSchema }).optional(),
  /** Set when it is over and only its reckoning is left. */
  over: z.enum(['won', 'lost', 'left']).optional()
})
export type ExpeditionRun = z.infer<typeof ExpeditionRunSchema>

export const ExpeditionStateSchema = z.object({
  /** How many depths' anchors he has re-seated: the next is the deepest he can go. */
  cleared: z.number().int().min(0).default(0),
  /** The relics he holds, by id. */
  relics: z.array(z.string()).default([]),
  /** Those of them always at work that he has turned on: each starts off, and is his to turn on. */
  relicsOn: z.array(z.string()).default([]),
  /** He has been shown the way down, and may go. */
  invited: z.boolean().default(false),
  /** How many runs each woman has come back from won, by id: her role's further move waits on the first. */
  wins: z.record(z.string(), z.number().int().min(0)).default({}),
  /** How many echoes he has come back from won, and the women who have come back from one with him. */
  echoes: z.number().int().min(0).default(0),
  echoed: z.array(z.string()).default([]),
  /** Those of them whose outfit for it he has put away: it is not drawn for her day, as if she had not earned it. */
  echoOutfitOff: z.array(z.string()).default([]),
  run: ExpeditionRunSchema.optional()
})
export type ExpeditionState = z.infer<typeof ExpeditionStateSchema>
