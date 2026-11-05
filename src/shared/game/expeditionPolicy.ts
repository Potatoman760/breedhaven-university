import { HIM, type ContentPack, type GameState } from '../model'
import { act, comeUp, goOn, nodeAt, roleOf, turnActions, turnOf, type Move } from './expedition'

/**
 * A plain way of playing a fight, for trying the numbers without a player: everyone hits the enemy nearest to
 * falling with the strongest thing she has ready, her ultimate kept for the guardian, a healer mends whoever is worst
 * off when someone is hurt, a warder keeps a ward up, a heavy blow coming is warded or drawn, and he grounds a surge
 * before it breaks. Not part of the game: the tests and the scripts use it.
 */
export function plainMove(content: ContentPack, state: GameState): Move | undefined {
  const config = content.expedition!
  const run = state.expedition.run
  const actor = run && turnOf(run)
  if (!run || !actor) return undefined
  const ready = turnActions(content, state).filter((action) => action.ready)
  const foe = [...run.fight!.foes].filter((one) => one.footing > 0).sort((a, b) => a.footing - b.footing)[0]
  const up = run.party.filter((fighter) => fighter.footing > 0)
  const worst = [...up].sort((a, b) => a.footing / a.max - b.footing / b.max)[0]
  const can = (id: string) => ready.some((action) => action.id === id)

  if (actor.id === HIM) {
    const surging = up.find((fighter) => fighter.id !== HIM && fighter.surge >= config.surgeLimit - config.surgePerAction)
    if (surging && can('ground')) return { actionId: 'ground', target: surging.id }
    return { actionId: 'strike', target: foe.key }
  }
  const li = content.loveInterests.find((one) => one.id === actor.id)!
  const role = roleOf(config, li)!
  const hurt = worst.footing / worst.max < 0.6
  const hurtMany = up.filter((fighter) => fighter.footing / fighter.max < 0.6).length > 1
  const foes = run.fight!.foes.filter((one) => one.footing > 0)
  const heavy = foes.some((one) => one.intent?.kind === 'heavy')
  // Her own ultimate at the guardian, her role's further move where it reaches more than one, and a heavy blow met.
  const ultimate = nodeAt(content, run).kind === 'guardian' && li.ultimate ? [li.ultimate.id] : []
  const friend = role.friendAction.all && role.friendAction.kind !== 'heal' && foes.length < 2 ? [] : [role.friendAction.id]
  const order: string[] =
    role.id === 'healer' ? (hurtMany ? [...ultimate, 'renewal', 'deep-mend', 'mend', 'jolt'] : hurt ? ['deep-mend', 'mend', 'jolt'] : [...ultimate, 'jolt'])
    : role.id === 'warder' ? (run.ward < 4 || heavy ? [...ultimate, 'great-ward', 'dispel', 'ward', 'push'] : ['push'])
    : role.id === 'guard' ? (heavy ? ['hold', ...ultimate, ...friend, 'bash'] : [...ultimate, 'hold', ...friend, 'bash'])
    : role.id === 'hexer' ? [...ultimate, ...friend, 'unravel', 'hex']
    : [...ultimate, ...friend, 'all-in', 'strike']
  const actionId = order.find(can) ?? ready[0]?.id
  if (!actionId) return undefined
  const aim = ready.find((action) => action.id === actionId)?.aim
  return { actionId, target: aim === 'ally' ? worst.id : aim === 'foe' ? foe.key : undefined }
}

/** Plays a run that has been started through to its end by `plainMove`, and comes back up. Says how it ended. */
export function playOut(content: ContentPack, started: GameState): { state: GameState; outcome: 'won' | 'lost' | 'left' } {
  let state = started
  for (let step = 0; step < 2000 && !state.expedition.run?.over; step++) {
    const run = state.expedition.run!
    if (run.fight && !run.done) {
      const move = plainMove(content, state)
      const next = move ? act(content, state, move) : state
      if (next === state) throw new Error('The fight has stopped moving')
      state = next
    } else state = goOn(content, state)
  }
  const outcome = state.expedition.run?.over
  if (!outcome) throw new Error('The run did not end')
  return { state: comeUp(content, state), outcome }
}
