import { HIM, type ContentPack, type Depth, type Enemy, type ExpeditionConfig, type ExpeditionNode, type ExpeditionRun, type Fight, type FightEvent, type FightFx, type Fighter, type Finds, type Foe, type GameState, type LoveInterest, type PartyAction, type Relic, type RoleConfig } from '../model'
import type { PerformCheck } from './activities'
import { growTies } from './bonds'
import { toDate } from './calendar'
import { consume } from './market'
import { addMemory, applyFeelings } from './memory'
import { factor, inForce, trustOf } from './modifiers'
import { checkOuting } from './outing'
import { pregnancyStage } from './pregnancy'
import { hasMet } from './scene'
import { draws, seedOf } from './seed'
import { abilityModifier, statOf } from './stats'
import { t } from '../i18n'

/**
 * Going below: a run through one depth of the Undercroft with a party of the women he knows, fought a turn at a
 * time. Nothing here is written by the LLM. A run is kept in the save as it stands, and every number it draws comes
 * from the game's seed, so that the same run plays the same way and is there again after loading.
 */

// What a true strike, something an enemy cannot stand, a hex and a weakening each multiply by.
const CRIT = 1.5
const WEAKNESS = 1.5
const HEXED = 0.7
const WEAKENED = 0.6
// How long a weakening lasts on an enemy and a hex on one of the party, in rounds.
const WEAKEN_ROUNDS = 2
const HEX_ROUNDS = 2
// A sweep hits everyone, for this share each; a guard takes this share of what is meant for her.
const SWEEP = 0.6
const GUARDED = 0.5
// How much of her footing someone who went down has when the fight is over and she is helped up.
const HELPED_UP = 0.25
// What his own strike does before his strength is counted and what each point of that bonus adds, and how much of a hit he takes standing in front of someone, less for his endurance.
const STRIKE = 4
const STRIKE_PER_STRENGTH = 2
const COVER = 0.8
const COVER_PER_ENDURANCE = 0.08

const firstName = (li: Pick<LoveInterest, 'name'>): string => li.name.split(' ')[0]

/** The role a woman fights in, if she has one the game knows. */
export function roleOf(config: ExpeditionConfig, li: Pick<LoveInterest, 'partyRole'> | undefined): RoleConfig | undefined {
  return config.roles.find((role) => role.id === li?.partyRole)
}

/** Whether the way down is open yet. */
export function belowOpen(content: ContentPack, state: Pick<GameState, 'time'>): boolean {
  return content.expedition !== undefined && toDate(content.calendar, state.time).dayIndex + 1 >= content.expedition.opensOnDay
}

/** Where the way down is, once it is open and he has been told of it: the place the map marks as more than it seems. */
export function wayDownAt(content: ContentPack, state: Pick<GameState, 'time' | 'expedition'>): string | undefined {
  return belowOpen(content, state) && state.expedition.invited ? content.expedition?.entryLocationId : undefined
}

/** The depths he can go to: every one he has cleared, and the next. */
export function depthsOpen(content: ContentPack, state: Pick<GameState, 'expedition'>): number {
  return Math.min(state.expedition.cleared + 1, content.expedition?.depths.length ?? 0)
}

/** The relics he holds. */
export function relicsHeld(content: ContentPack, state: Pick<GameState, 'expedition'>): Relic[] {
  return (content.expedition?.depths ?? []).map((depth) => depth.relic).filter((relic) => state.expedition.relics.includes(relic.id))
}

/** What a woman's work is multiplied by for the child she is carrying: 1 when she carries none, and nothing at a stage she cannot come at. */
export function pregnancyPower(content: ContentPack, state: GameState, loveInterestId: string): number | undefined {
  const stage = pregnancyStage(content, state, loveInterestId)
  return stage ? content.expedition?.pregnancyPower[stage.id] : 1
}

/** Why one of the women could not come below now, or nothing if she could. Being busy is asked of the party as a whole. */
export function whyNot(content: ContentPack, state: GameState, li: LoveInterest): string | undefined {
  const config = content.expedition
  if (!config || !roleOf(config, li)) return t('game.expedition.noUse')
  if (!hasMet(state, li.id)) return t('game.expedition.notMet')
  if (trustOf(content, state, li.id) < config.trustNeeded) return t('game.expedition.noTrust', { needed: config.trustNeeded })
  if (pregnancyPower(content, state, li.id) === undefined) return t('game.expedition.nearHerTime')
  return undefined
}

/** Everyone who could be asked, in the order the content lists them, each with what stands in her way if anything does. */
export function partyChoices(content: ContentPack, state: GameState): { li: LoveInterest; role: RoleConfig; reason: string | undefined }[] {
  const config = content.expedition
  if (!config) return []
  return content.loveInterests.flatMap((li) => {
    const role = roleOf(config, li)
    return role && hasMet(state, li.id) ? [{ li, role, reason: whyNot(content, state, li) }] : []
  })
}

/** Whether he can go below now, to a depth, with these women. */
export function canGoBelow(content: ContentPack, state: GameState, partyIds: string[], depth: number): PerformCheck {
  const config = content.expedition
  if (!config || !belowOpen(content, state) || !state.expedition.invited) return { ok: false, reasons: [t('game.expedition.noWayDown')] }
  const reasons: string[] = []
  if (state.expedition.run) reasons.push(t('game.expedition.alreadyBelow'))
  if (state.locationId !== config.entryLocationId) reasons.push(t('game.expedition.wayDownAt', { place: content.locations.find((l) => l.id === config.entryLocationId)?.name ?? config.entryLocationId }))
  if (depth < 0 || depth >= depthsOpen(content, state)) reasons.push(t('game.expedition.notThatDeep'))
  if (partyIds.length > config.partySize) reasons.push(t('game.expedition.partySize', { size: config.partySize }))
  for (const id of partyIds) {
    const li = content.loveInterests.find((one) => one.id === id)
    const why = li ? whyNot(content, state, li) : t('game.expedition.nobodyOfThatName')
    if (why) reasons.push(t('game.expedition.whyNot', { name: li ? firstName(li) : id, why }))
  }
  // Whether the place is open, the hours are there, he has the energy and each of them is free is what any outing is asked.
  reasons.push(...checkOuting(content, state, { title: config.name, description: '', withIds: partyIds, locationId: config.entryLocationId, hours: config.hours }).blockers)
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] }
}

/** The numbers a run draws: the next of them each time, counted so that the run can pick up where it left off. */
function roller(state: GameState, run: ExpeditionRun): { next: () => number; die: (sides: number) => number; used: () => number } {
  const source = draws(state.weatherSeed ^ seedOf(`below:${run.depth}`) ^ Math.imul(run.startedAt + 1, 0x9e3779b1))
  for (let i = 0; i < run.rolls; i++) source()
  let used = 0
  const next = () => {
    used++
    return source()
  }
  return { next, die: (sides) => 1 + Math.floor(next() * sides), used: () => used }
}

const depthAt = (config: ExpeditionConfig, run: ExpeditionRun): Depth => config.depths[run.depth]
const enemyOf = (config: ExpeditionConfig, foe: Foe): Enemy => config.enemies.find((enemy) => enemy.id === foe.enemyId)!
const standing = (fighter: Fighter): boolean => fighter.footing > 0
const add = (a: Finds, b: Finds): Finds => ({
  money: a.money + b.money,
  items: Object.entries(b.items).reduce<Record<string, number>>((all, [id, count]) => ({ ...all, [id]: (all[id] ?? 0) + count }), a.items)
})
const NOTHING: Finds = { money: 0, items: {} }

/** The stop of the run he is at. */
export function nodeAt(content: ContentPack, run: ExpeditionRun): ExpeditionNode {
  return depthAt(content.expedition!, run).nodes[run.node]
}

/** What he calls one of the party: himself, or her first name. */
export function fighterName(content: ContentPack, state: GameState, id: string): string {
  return id === HIM ? state.player.name : firstName(content.loveInterests.find((li) => li.id === id) ?? { name: id })
}

/** "$40 and 2 Stillwater" */
export function describeFinds(content: ContentPack, finds: Finds): string {
  const things = Object.entries(finds.items).map(([id, count]) => t('game.expedition.findItem', { many: count > 1, count, name: content.items.find((item) => item.id === id)?.name ?? id }))
  const all = [...(finds.money > 0 ? [t('game.expedition.findMoney', { amount: finds.money })] : []), ...things]
  return all.length === 0 ? t('game.expedition.nothing') : all.length === 1 ? all[0] : t('game.expedition.list', { rest: all.slice(0, -1).join(', '), last: all.at(-1) })
}

/** Arrives at a stop of the run: a fight is set up, what is lying there is picked up, a checkpoint makes safe what has been found and rests everyone. */
function arrive(content: ContentPack, state: GameState, run: ExpeditionRun): ExpeditionRun {
  const config = content.expedition!
  const node = depthAt(config, run).nodes[run.node]
  if (node.kind === 'find') return { ...run, fight: undefined, done: true, found: add(run.found, node.finds), spoils: node.finds, note: t('game.expedition.findNote', { name: node.name || t('game.expedition.somethingLeft'), finds: describeFinds(content, node.finds) }) }
  if (node.kind === 'checkpoint') {
    const rested = run.party.map((fighter) => ({ ...fighter, footing: Math.min(fighter.max, Math.round(fighter.footing + fighter.max * config.checkpointRest)) }))
    const healed = Object.fromEntries(rested.map((fighter, index) => [fighter.id, fighter.footing - run.party[index].footing]))
    return { ...run, fight: undefined, done: true, party: rested, banked: add(run.banked, run.found), found: NOTHING, rest: { healed, secured: run.found }, note: t('game.expedition.checkpointNote', { name: node.name || t('game.expedition.dryLedge') }) }
  }
  const foes: Foe[] = node.enemyIds.map((enemyId, index) => {
    const enemy = config.enemies.find((one) => one.id === enemyId)!
    return { key: `${enemyId}-${index}`, enemyId, footing: enemy.footing, max: enemy.footing, weakened: 0 }
  })
  const fresh = run.party.map((fighter) => ({ ...fighter, cooldowns: {}, guarding: false, taunting: false, anchored: false, covered: false, hexed: 0 }))
  let entered: ExpeditionRun = { ...run, party: fresh, ward: 0, done: false, note: node.name, fight: { foes, round: 1, turn: fresh.findIndex(standing), events: [] } }
  // Unless he has learnt to see it coming, what is down there gets its blow in first about half the time.
  if (!inForce(content, state, 'ambush')) {
    const roll = roller(state, entered)
    const caught = roll.next() < 0.5
    entered = { ...entered, rolls: entered.rolls + roll.used() }
    if (caught) entered = enemiesAct(content, state, entered, [{ text: t('game.expedition.ambushed'), faces: {}, fx: [] }])
  }
  return entered
}

/** Starts a run at a depth with a party. Throws when he cannot go. */
export function startRun(content: ContentPack, state: GameState, partyIds: string[], depth: number): GameState {
  const check = canGoBelow(content, state, partyIds, depth)
  if (!check.ok) throw new Error(`Cannot go below: ${check.reasons.join('; ')}`)
  const config = content.expedition!
  const tough = factor(content, state, 'footing')
  const his = Math.round((config.playerFooting + Math.max(0, abilityModifier(statOf(state, 'endurance'))) * config.footingPerEndurance) * tough)
  const party: Fighter[] = [
    { id: HIM, footing: his, max: his, cooldowns: {}, surge: 0, guarding: false, taunting: false, anchored: false, covered: false, hexed: 0 },
    ...partyIds.map((id) => {
      const max = Math.round(roleOf(config, content.loveInterests.find((li) => li.id === id))!.footing * tough)
      return { id, footing: max, max, cooldowns: {}, surge: 0, guarding: false, taunting: false, anchored: false, covered: false, hexed: 0 }
    })
  ]
  const run: ExpeditionRun = { depth, node: 0, startedAt: state.time, party, ward: 0, found: NOTHING, banked: NOTHING, downed: [], rolls: 0, done: false, note: '' }
  return { ...state, expedition: { ...state.expedition, run: arrive(content, state, run) } }
}

/**
 * A fight to practise on, made without the checks of a real way down and never meant to be kept: him and these women
 * at the first fight of the first depth, his turn first. Its state is shown and played, and then thrown away.
 */
export function practiceRun(content: ContentPack, state: GameState, partyIds: string[]): GameState {
  const config = content.expedition!
  const tough = factor(content, state, 'footing')
  const his = Math.round((config.playerFooting + Math.max(0, abilityModifier(statOf(state, 'endurance'))) * config.footingPerEndurance) * tough)
  const fresh = (id: string, max: number): Fighter => ({ id, footing: max, max, cooldowns: {}, surge: 0, guarding: false, taunting: false, anchored: false, covered: false, hexed: 0 })
  const party: Fighter[] = [
    fresh(HIM, his),
    ...partyIds.flatMap((id) => {
      const role = roleOf(config, content.loveInterests.find((li) => li.id === id))
      return role ? [fresh(id, Math.round(role.footing * tough))] : []
    })
  ]
  const node = Math.max(0, config.depths[0].nodes.findIndex((one) => one.kind === 'fight'))
  // He sees it coming, so that the fight opens on his turn.
  const ready: GameState = { ...state, boons: [...state.boons, { kind: 'ambush', amount: 1, until: state.time + 1, source: t('game.expedition.practice') }] }
  const run: ExpeditionRun = { depth: 0, node, startedAt: state.time, party, ward: 0, found: NOTHING, banked: NOTHING, downed: [], rolls: 0, done: false, note: '' }
  return { ...ready, expedition: { ...ready.expedition, run: arrive(content, ready, run) } }
}

/** Goes on from a stop that is dealt with to the next. */
export function goOn(content: ContentPack, state: GameState): GameState {
  const run = state.expedition.run
  if (!run || !run.done || run.over) return state
  return { ...state, expedition: { ...state.expedition, run: arrive(content, state, { ...run, node: run.node + 1, spoils: undefined, rest: undefined }) } }
}

/** Something one of the party can do on her turn, and whether she can do it now. */
export interface TurnAction {
  id: string
  name: string
  /** What it does, in a line. */
  description: string
  /** What it needs pointing at, if anything. */
  aim: 'foe' | 'ally' | 'her' | 'pregnant' | undefined
  ready: boolean
  /** Why not, or what it costs. */
  note?: string
}

/** What one of a role's actions does, in a line, with its numbers. */
export function describeAction(action: PartyAction): string {
  const about = Math.round(action.power + 2.5)
  const what =
    action.kind === 'attack' ? t('game.expedition.action.attack', { about })
    : action.kind === 'weaken' ? t('game.expedition.action.weaken', { about: Math.round((action.power + 2.5) / 2), rounds: WEAKEN_ROUNDS })
    : action.kind === 'shield' ? t('game.expedition.action.shield', { about })
    : action.kind === 'heal' ? t('game.expedition.action.heal', { about })
    : action.kind === 'taunt' ? t('game.expedition.action.taunt')
    : t('game.expedition.action.guard')
  return action.cooldown > 0 ? t('game.expedition.action.cooldown', { what, rounds: action.cooldown }) : what
}

/** Whoever of the party it is the turn of, in a fight. */
export function turnOf(run: ExpeditionRun): Fighter | undefined {
  return run.fight && !run.over ? run.party[run.fight.turn] : undefined
}

const isPregnant = (content: ContentPack, state: GameState, id: string): boolean => id !== HIM && pregnancyStage(content, state, id) !== undefined

/** What whoever's turn it is can do. */
export function turnActions(content: ContentPack, state: GameState): TurnAction[] {
  const config = content.expedition
  const run = state.expedition.run
  const actor = run && turnOf(run)
  if (!config || !run || !actor) return []
  if (actor.id !== HIM) {
    const role = roleOf(config, content.loveInterests.find((li) => li.id === actor.id))
    return (role?.actions ?? []).map((action) => {
      const wait = actor.cooldowns[action.id] ?? 0
      return { id: action.id, name: action.name, description: describeAction(action), aim: action.kind === 'attack' || action.kind === 'weaken' ? 'foe' : action.kind === 'heal' ? 'ally' : undefined, ready: wait === 0, note: wait > 0 ? t('game.expedition.readyIn', { wait }) : undefined }
    })
  }
  const women = run.party.filter((fighter) => fighter.id !== HIM && standing(fighter))
  const energy = (cost: number) => (state.player.energy >= cost ? t('game.expedition.energy', { cost }) : t('game.expedition.needsEnergy', { cost }))
  const carried = content.items.filter((item) => item.below && (state.inventory[item.id] ?? 0) > 0)
  return [
    { id: 'strike', name: t('game.expedition.strike.name'), description: t('game.expedition.strike.description'), aim: 'foe', ready: true },
    { id: 'cover', name: t('game.expedition.cover.name'), description: t('game.expedition.cover.description'), aim: 'her', ready: women.length > 0 },
    { id: 'anchor', name: t('game.expedition.anchor.name'), description: t('game.expedition.anchor.description', { percent: Math.round((config.anchorPower - 1) * 100) }), aim: 'her', ready: women.length > 0 && state.player.energy >= config.anchorEnergy, note: energy(config.anchorEnergy) },
    {
      id: 'ground',
      name: t('game.expedition.ground.name'),
      description: inForce(content, state, 'grounding') ? t('game.expedition.ground.all') : t('game.expedition.ground.description', { grounds: config.grounds }),
      aim: 'pregnant',
      ready: women.some((fighter) => fighter.surge > 0) && state.player.energy >= config.groundEnergy,
      note: energy(config.groundEnergy)
    },
    ...carried.map((item): TurnAction => ({ id: `item:${item.id}`, name: item.name, description: [item.below!.footing > 0 ? t('game.expedition.item.footing', { footing: item.below!.footing }) : '', item.below!.calms ? t('game.expedition.item.calms') : ''].filter(Boolean).join(' '), aim: 'ally', ready: true, note: t('game.expedition.item.left', { count: state.inventory[item.id] }) }))
  ]
}

/** What steadying a woman multiplies her next action by: more for his wisdom, and for what he has learnt. */
function anchorWorth(content: ContentPack, state: GameState): number {
  return (content.expedition!.anchorPower + Math.max(0, abilityModifier(statOf(state, 'wisdom'))) * 0.05) * factor(content, state, 'anchoring')
}

/**
 * Takes footing from one of the party: the ward first, then her, unless it comes from inside the party and goes
 * through the ward. Says what the blow was, how much of it the ward took and how much she did, and whether she went down.
 */
function hurt(run: ExpeditionRun, id: string, amount: number, through = false): { run: ExpeditionRun; dealt: number; warded: number; taken: number; left: number; down: boolean } {
  const dealt = Math.max(1, Math.round(amount))
  const warded = through ? 0 : Math.min(Math.round(run.ward), dealt)
  const taken = dealt - warded
  const before = run.party.find((fighter) => fighter.id === id)!
  const left = Math.max(0, before.footing - taken)
  const down = left === 0 && before.footing > 0
  return {
    run: { ...run, ward: run.ward - warded, party: run.party.map((fighter) => (fighter.id === id ? { ...fighter, footing: left } : fighter)), downed: down && !run.downed.includes(id) ? [...run.downed, id] : run.downed },
    dealt,
    warded,
    taken,
    left,
    down
  }
}

/** Every enemy still up takes its turn, and the round turns over. */
function enemiesAct(content: ContentPack, state: GameState, before: ExpeditionRun, said: FightEvent[] = []): ExpeditionRun {
  const config = content.expedition!
  const roll = roller(state, before)
  const events = [...said]
  let run = before
  const name = (id: string) => fighterName(content, state, id)
  const steady = inForce(content, state, 'steady')
  const endurance = Math.max(0, abilityModifier(statOf(state, 'endurance')))

  for (const foe of run.fight!.foes.filter((one) => one.footing > 0)) {
    const enemy = enemyOf(config, foe)
    const up = run.party.filter(standing)
    if (up.length === 0) break
    const force = (enemy.attack + roll.die(4)) * (foe.weakened > 0 ? WEAKENED : 1)
    const marked = up.filter((fighter) => fighter.taunting)
    const targets = enemy.sweeps ? up : [marked[0] ?? up[Math.floor(roll.next() * up.length)]]
    for (const aimedAt of targets) {
      // He is standing in front of her: the blow is his, and less of one for how much he can take.
      const him = run.party.find((fighter) => fighter.id === HIM)!
      const stepsIn = aimedAt.covered && aimedAt.id !== HIM && standing(him)
      const target = stepsIn ? him : run.party.find((fighter) => fighter.id === aimedAt.id)!
      if (!standing(target)) continue
      const amount = force * (enemy.sweeps ? SWEEP : 1) * (target.guarding ? GUARDED : 1) * (stepsIn ? Math.max(0.3, COVER - endurance * COVER_PER_ENDURANCE) : 1)
      const result = hurt(run, target.id, amount)
      run = result.run
      if (stepsIn) run = { ...run, party: run.party.map((fighter) => (fighter.id === aimedAt.id ? { ...fighter, covered: false } : fighter)) }
      if (enemy.hexes && !result.down && result.taken > 0) run = { ...run, party: run.party.map((fighter) => (fighter.id === target.id ? { ...fighter, hexed: steady ? 1 : HEX_ROUNDS } : fighter)) }
      const hexed = enemy.hexes && !result.down && result.taken > 0
      const whom = name(target.id)
      events.push({
        text: [
          t('game.expedition.log.enemyHits', { enemy: enemy.name, whom, covering: stepsIn, covered: name(aimedAt.id), dealt: result.dealt }),
          result.warded === 0 ? '' : result.taken === 0 ? t('game.expedition.log.wardAll', { warded: result.warded }) : t('game.expedition.log.ward', { warded: result.warded }),
          result.down ? t('game.expedition.log.down', { whom }) : '',
          hexed ? t('game.expedition.log.hexed', { rounds: steady ? 1 : HEX_ROUNDS }) : ''
        ]
          .filter(Boolean)
          .join(' '),
        faces: target.id === HIM ? {} : { [target.id]: result.down ? 'sad' : 'surprised' },
        fx: [
          ...(result.warded > 0 ? [{ kind: 'absorb' as const, on: target.id, amount: result.warded }] : []),
          ...(result.taken > 0 ? [{ kind: 'hit' as const, on: target.id, amount: result.taken, style: enemy.sweeps ? 'sweep' : 'claw' }] : []),
          ...(hexed ? [{ kind: 'hex' as const, on: target.id }] : []),
          ...(result.down ? [{ kind: 'fall' as const, on: target.id }] : [])
        ]
      })
    }
  }

  // The round turns over: what was held until the next turn is let go, and what was counting down counts down.
  const fight: Fight = { ...run.fight!, foes: run.fight!.foes.map((foe) => ({ ...foe, weakened: Math.max(0, foe.weakened - 1) })), round: run.fight!.round + 1, events }
  const party = run.party.map((fighter) => ({
    ...fighter,
    guarding: false,
    taunting: false,
    hexed: Math.max(0, fighter.hexed - 1),
    cooldowns: Object.fromEntries(Object.entries(fighter.cooldowns).flatMap(([id, wait]) => (wait > 1 ? [[id, wait - 1]] : [])))
  }))
  run = { ...run, party, fight: { ...fight, turn: party.findIndex(standing) }, rolls: run.rolls + roll.used() }
  if (!party.some(standing)) return { ...run, fight: { ...run.fight!, turn: 0 }, over: 'lost', found: NOTHING, note: t('game.expedition.lost') }
  return run
}

/** What an action of the party is asked to do: which, and at what or whom. */
export interface Move {
  actionId: string
  /** A foe's key, or the id of one of the party. */
  target?: string
}

/**
 * Whoever's turn it is does something. The turn passes to the next of the party still standing; after the last, the
 * enemies act. A fight won moves the run on: its spoils are picked up, and at a guardian the anchor is re-seated.
 * Something that cannot be done leaves everything as it was.
 */
export function act(content: ContentPack, state: GameState, move: Move): GameState {
  const config = content.expedition
  const before = state.expedition.run
  const actor = before && turnOf(before)
  const choice = turnActions(content, state).find((one) => one.id === move.actionId)
  if (!config || !before || !actor || !choice?.ready) return state

  const roll = roller(state, before)
  const name = (id: string) => fighterName(content, state, id)
  const events: FightEvent[] = []
  let run = before
  let after = state
  const foe = run.fight!.foes.find((one) => one.key === move.target && one.footing > 0) ?? run.fight!.foes.find((one) => one.footing > 0)!
  const ally = run.party.find((fighter) => fighter.id === move.target && standing(fighter))
  const setFighter = (id: string, change: Partial<Fighter>) => {
    run = { ...run, party: run.party.map((fighter) => (fighter.id === id ? { ...fighter, ...change } : fighter)) }
  }
  const strike = (target: Foe, amount: number, change: Partial<Foe> = {}): number => {
    // However weak the blow, it is a blow: it never does less than one.
    const taken = Math.max(1, Math.round(amount))
    run = { ...run, fight: { ...run.fight!, foes: run.fight!.foes.map((one) => (one.key === target.key ? { ...one, footing: Math.max(0, one.footing - taken), ...change } : one)) } }
    return taken
  }
  const spend = (energy: number) => {
    after = { ...after, player: { ...after.player, energy: Math.max(0, after.player.energy - energy) } }
  }
  // Said after a blow that finishes an enemy. What it has left otherwise is on its bar.
  const left = (target: Foe) => {
    const now = run.fight!.foes.find((one) => one.key === target.key)!
    return now.footing === 0 ? t('game.expedition.log.comesApart') : ''
  }
  // What is seen of a blow on an enemy: the cut, and its coming apart if that finished it.
  const cut = (target: Foe, amount: number, kind: 'slash' | 'crit' = 'slash', look: Pick<FightFx, 'by' | 'style'> = {}): FightFx[] => [
    { kind, on: target.key, amount, ...look },
    ...(run.fight!.foes.find((one) => one.key === target.key)!.footing === 0 ? [{ kind: 'fall' as const, on: target.key }] : [])
  ]

  if (actor.id === HIM) {
    const her = ally && ally.id !== HIM ? ally : undefined
    if (move.actionId === 'strike') {
      const taken = strike(foe, (STRIKE + abilityModifier(statOf(state, 'strength')) * STRIKE_PER_STRENGTH + roll.die(6)) * factor(content, state, 'might') * (actor.hexed > 0 ? HEXED : 1))
      events.push({ text: t('game.expedition.log.heHits', { him: name(HIM), enemy: enemyOf(config, foe).name, taken, left: left(foe) }), faces: {}, fx: cut(foe, taken) })
    } else if (move.actionId === 'cover' && her) {
      setFighter(her.id, { covered: true })
      events.push({ text: t('game.expedition.log.protects', { him: name(HIM), her: name(her.id) }), faces: { [her.id]: 'happy' }, fx: [{ kind: 'guard', on: her.id }] })
    } else if (move.actionId === 'anchor' && her) {
      spend(config.anchorEnergy)
      setFighter(her.id, { anchored: true })
      events.push({ text: t('game.expedition.log.empowers', { him: name(HIM), her: name(her.id), percent: Math.round((anchorWorth(content, state) - 1) * 100) }), faces: { [her.id]: 'happy' }, fx: [{ kind: 'anchor', on: her.id }] })
    } else if (move.actionId === 'ground' && her && her.surge > 0) {
      spend(config.groundEnergy)
      const calmed = inForce(content, state, 'grounding') ? 0 : Math.max(0, her.surge - config.grounds)
      setFighter(her.id, { surge: calmed })
      events.push({ text: t('game.expedition.log.grounds', { him: name(HIM), her: name(her.id), surge: her.surge - calmed }), faces: { [her.id]: 'neutral' }, fx: [{ kind: 'ground', on: her.id }] })
    } else if (move.actionId.startsWith('item:')) {
      const item = content.items.find((one) => `item:${one.id}` === move.actionId)
      const to = ally ?? actor
      if (!item?.below) return state
      after = consume(after, item.id)
      const restored = Math.min(to.max, to.footing + item.below.footing)
      setFighter(to.id, { footing: restored, ...(item.below.calms ? { surge: 0 } : {}) })
      events.push({
        text: t('game.expedition.log.usesItem', { him: name(HIM), item: item.name, self: to.id === HIM, target: name(to.id), restored: restored - to.footing, cleared: item.below.calms && to.surge > 0 }),
        faces: to.id === HIM ? {} : { [to.id]: 'happy' },
        fx: [{ kind: 'heal', on: to.id, amount: restored - to.footing }]
      })
    } else return state
  } else {
    const li = content.loveInterests.find((one) => one.id === actor.id)!
    const role = roleOf(config, li)!
    const action: PartyAction = role.actions.find((one) => one.id === move.actionId)!
    const carrying = pregnancyPower(content, after, actor.id) ?? 1
    const anchored = actor.anchored ? anchorWorth(content, state) : 1
    const affection = state.relationships[actor.id]?.affection ?? 0
    const trueStrike = roll.next() < config.critChance * Math.min(1, affection / config.critAffection)
    const worth = (action.power + roll.die(4)) * carrying * anchored * (actor.hexed > 0 ? HEXED : 1) * (trueStrike ? CRIT : 1)
    const who = name(actor.id)
    const face = { [actor.id]: 'angry' }
    // What it looks like: this role's take on this action, flying from her.
    const look = { by: actor.id, style: `${role.id}:${action.id}` }
    if (action.kind === 'attack' || action.kind === 'weaken') {
      const weak = enemyOf(config, foe).weakTo === role.id ? WEAKNESS : 1
      const taken = strike(foe, worth * weak * (action.kind === 'weaken' ? 0.5 : 1), action.kind === 'weaken' ? { weakened: WEAKEN_ROUNDS } : {})
      const why = [trueStrike && t('game.expedition.log.trueStrike'), weak > 1 && t('game.expedition.log.weakness')].filter(Boolean)
      events.push({
        text: t('game.expedition.log.herHits', { who, action: action.name, enemy: enemyOf(config, foe).name, taken, why: why.length > 0 ? `, ${why.join(', ')}` : '', left: left(foe), weakened: action.kind === 'weaken' && run.fight!.foes.find((one) => one.key === foe.key)!.footing > 0 ? t('game.expedition.log.weakened', { rounds: WEAKEN_ROUNDS }) : '' }),
        faces: face,
        fx: [...cut(foe, taken, trueStrike ? 'crit' : 'slash', look), ...(action.kind === 'weaken' && run.fight!.foes.find((one) => one.key === foe.key)!.footing > 0 ? [{ kind: 'weaken' as const, on: foe.key }] : [])]
      })
    } else if (action.kind === 'heal') {
      const to = ally ?? run.party.filter(standing).sort((a, b) => a.footing / a.max - b.footing / b.max)[0]
      const mended = Math.min(to.max, Math.round(to.footing + worth))
      setFighter(to.id, { footing: mended })
      events.push({ text: t('game.expedition.log.restores', { who, action: action.name, amount: mended - to.footing, self: to.id === actor.id, target: name(to.id) }), faces: { [actor.id]: 'happy' }, fx: [{ kind: 'heal', on: to.id, amount: mended - to.footing, ...look }] })
    } else if (action.kind === 'shield') {
      run = { ...run, ward: run.ward + Math.round(worth) }
      events.push({ text: t('game.expedition.log.addsWard', { who, action: action.name, amount: Math.round(worth) }), faces: { [actor.id]: 'neutral' }, fx: run.party.filter(standing).map((fighter) => ({ kind: 'ward' as const, on: fighter.id, ...look })) })
    } else {
      setFighter(actor.id, { guarding: true, taunting: action.kind === 'taunt' })
      events.push({ text: t('game.expedition.log.uses', { who, action: action.name }), faces: { [actor.id]: 'neutral' }, fx: [{ kind: 'guard', on: actor.id, ...look }] })
    }
    setFighter(actor.id, { anchored: false, cooldowns: action.cooldown > 0 ? { ...actor.cooldowns, [action.id]: action.cooldown + 1 } : actor.cooldowns })

    // What she carries makes her stronger and harder to hold: each thing she does builds the surge, and past its limit it breaks loose on everyone.
    if (isPregnant(content, after, actor.id) && action.kind !== 'guard' && action.kind !== 'taunt') {
      const surge = (run.party.find((fighter) => fighter.id === actor.id)!.surge ?? 0) + config.surgePerAction * factor(content, state, 'surge')
      if (surge >= config.surgeLimit) {
        setFighter(actor.id, { surge: 0 })
        const struck = run.party.filter(standing)
        for (const fighter of struck) run = hurt(run, fighter.id, config.misfire, true).run
        events.push({ text: t('game.expedition.log.surge', { who, misfire: config.misfire }), faces: { [actor.id]: 'embarrassed' }, fx: struck.map((fighter) => ({ kind: 'misfire' as const, on: fighter.id, amount: config.misfire })) })
      } else setFighter(actor.id, { surge })
    }
  }

  run = { ...run, rolls: run.rolls + roll.used() }
  const fight = run.fight!

  // Won: what it was guarding is picked up, and at the guardian the anchor is his to re-seat.
  if (fight.foes.every((one) => one.footing === 0)) {
    const node = nodeAt(content, run)
    const spoils: Finds = { money: Math.round(node.finds.money * factor(content, state, 'spoils')), items: node.finds.items }
    const helpedUp = run.party.map((fighter) => (standing(fighter) ? fighter : { ...fighter, footing: Math.max(1, Math.round(fighter.max * HELPED_UP)) }))
    const faces = Object.fromEntries(run.party.filter((fighter) => fighter.id !== HIM).map((fighter) => [fighter.id, 'happy']))
    const won = { ...run, party: helpedUp, done: true, found: add(run.found, spoils), spoils, fight: { ...fight, events: [...events, { text: t('game.expedition.log.won', { finds: describeFinds(content, spoils) }), faces, fx: [] }] } }
    const guardian = node.kind === 'guardian'
    return {
      ...after,
      expedition: {
        ...after.expedition,
        run: guardian ? { ...won, over: 'won', banked: add(won.banked, won.found), found: NOTHING, note: t('game.expedition.anchorHolds', { depth: depthAt(config, run).name }) } : won
      }
    }
  }
  if (!run.party.some(standing)) {
    return { ...after, expedition: { ...after.expedition, run: { ...run, fight: { ...fight, events }, over: 'lost', found: NOTHING, note: t('game.expedition.lost') } } }
  }

  // The turn passes to the next of the party still up; when there is none, the enemies answer.
  const next = run.party.findIndex((fighter, index) => index > fight.turn && standing(fighter))
  const passed: ExpeditionRun = next >= 0 ? { ...run, fight: { ...fight, turn: next, events } } : enemiesAct(content, after, { ...run, fight: { ...fight, events: [] } }, events)
  return { ...after, expedition: { ...after.expedition, run: passed } }
}

/** Turns back: the run is over, with what was made safe and nothing else. */
export function turnBack(state: GameState): GameState {
  const run = state.expedition.run
  if (!run || run.over) return state
  return { ...state, expedition: { ...state.expedition, run: { ...run, fight: undefined, over: 'left', found: NOTHING, note: t('game.expedition.turnBack') } } }
}

/** What a run that is over came to, for the reckoning. */
export interface RunReport {
  outcome: 'won' | 'lost' | 'left'
  depth: Depth
  kept: Finds
  /** The relic he comes up with, when this is the first time the depth's anchor is re-seated. */
  relic: Relic | undefined
  /** The women who came, and who of them went down. */
  wentIds: string[]
  downedIds: string[]
}

export function runReport(content: ContentPack, state: GameState): RunReport | undefined {
  const config = content.expedition
  const run = state.expedition.run
  if (!config || !run?.over) return undefined
  const depth = depthAt(config, run)
  const wentIds = run.party.map((fighter) => fighter.id).filter((id) => id !== HIM)
  return {
    outcome: run.over,
    depth,
    kept: run.banked,
    relic: run.over === 'won' && !state.expedition.relics.includes(depth.relic.id) ? depth.relic : undefined,
    wentIds,
    downedIds: run.downed.filter((id) => id !== HIM)
  }
}

/**
 * Comes back up from a run that is over: its hours go by, what was kept is his, an anchor re-seated for the first
 * time leaves its relic and opens the next depth, and each of the women remembers it. Beaten, he has nothing left in
 * him for the day, and whoever went down thinks the less of where he led her.
 */
export function comeUp(content: ContentPack, state: GameState): GameState {
  const config = content.expedition
  const report = runReport(content, state)
  if (!config || !report) return state
  const run = state.expedition.run!
  const won = report.outcome === 'won'
  let after: GameState = {
    ...state,
    time: state.time + config.hours,
    player: { ...state.player, money: state.player.money + report.kept.money, energy: report.outcome === 'lost' ? 0 : state.player.energy },
    inventory: Object.entries(report.kept.items).reduce<Record<string, number>>((all, [id, count]) => ({ ...all, [id]: (all[id] ?? 0) + count }), state.inventory),
    expedition: {
      ...state.expedition,
      run: undefined,
      cleared: won ? Math.max(state.expedition.cleared, run.depth + 1) : state.expedition.cleared,
      relics: report.relic ? [...state.expedition.relics, report.relic.id] : state.expedition.relics
    }
  }
  for (const id of report.wentIds) {
    const role = roleOf(config, content.loveInterests.find((li) => li.id === id))?.name.toLowerCase() ?? t('game.expedition.company')
    const down = report.downedIds.includes(id)
    const told = won
      ? t('game.expedition.memory.won', { place: content.locations.find((l) => l.id === config.entryLocationId)?.name ?? t('game.expedition.theUniversity'), player: state.player.name, below: config.name, role, depth: report.depth.name, down })
      : report.outcome === 'lost'
        ? t('game.expedition.memory.lost', { below: config.name, player: state.player.name, depth: report.depth.name })
        : t('game.expedition.memory.left', { below: config.name, player: state.player.name, depth: report.depth.name })
    after = addMemory(after, id, told)
    const trust = won ? config.trustWon : report.outcome === 'lost' && down ? -config.trustLost : 0
    if (trust !== 0) after = applyFeelings(content, after, id, { affection: 0, trust, desire: 0, reason: '' }, true)
  }
  return growTies(content, after, report.wentIds)
}
