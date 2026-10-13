import { canUse, canUseAbility, carried, describeChange, liveBoons, readyIn, skillsOf } from '../../../shared/game'
import type { ContentPack, Effect, GameState } from '../../../shared/model'
import { ItemIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  /** Who he is with, when he is in a scene: anything that is for a woman can be used on one of them, and a gift given. */
  company?: { id: string; name: string }[]
  busy?: boolean
  onUseItem: (itemId: string, onId?: string) => void
  onAbility: (skillId: string, onId?: string) => void
  /** Gives one of what he carries to someone he is with. Left out, there is nobody to give to. */
  onGive?: (itemId: string, toId: string) => void
}

/** In a few words, what using a thing does: for the line under its name. */
function effectsLine(content: ContentPack, effects: Effect[]): string {
  return effects
    .map((effect) => {
      if (effect.type === 'boon') return `${describeChange(effect.modifier)} for ${effect.hours >= 24 ? `${Math.round(effect.hours / 24)} day${effect.hours >= 48 ? 's' : ''}` : `${effect.hours} hours`}${effect.on === 'her' ? ', on her' : ''}`
      if (effect.type === 'energy') return `${effect.amount > 0 ? '+' : ''}${effect.amount} energy`
      if (effect.type === 'item') return `makes ${effect.count > 1 ? `${effect.count} of ` : ''}${content.items.find((item) => item.id === effect.itemId)?.name ?? effect.itemId}`
      if (effect.type === 'money') return `${effect.amount > 0 ? '+' : '-'}$${Math.abs(effect.amount)}`
      return ''
    })
    .filter(Boolean)
    .join(' · ')
}

const span = (hours: number, hoursPerDay: number) => (hours >= hoursPerDay ? `${Math.ceil(hours / hoursPerDay)} day${Math.ceil(hours / hoursPerDay) === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`)

/**
 * What he has to hand: the things he carries, to use or to give; what he has learnt to make or set off, and when
 * each is ready again; and whatever of it is working now. The same on his phone and in a scene, where there is
 * someone to use a thing on.
 */
export function Bag({ content, state, company = [], busy, onUseItem, onAbility, onGive }: Props) {
  const held = carried(content, state)
  const abilities = skillsOf(content, state).filter((skill) => skill.ability)
  const boons = liveBoons(state)
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const hoursPerDay = content.calendar.hoursPerDay

  /** One button for himself, or one for each woman he is with when it is for her. */
  const targets = (on: 'self' | 'her', act: (onId?: string) => void, ok: (onId?: string) => { ok: boolean; reasons: string[] }, label: string) =>
    on === 'self' ? (
      <button disabled={busy || !ok().ok} title={ok().reasons.join(' · ')} onClick={() => act()}>
        {label}
      </button>
    ) : company.length === 0 ? (
      <span className="hint">For someone you are with</span>
    ) : (
      company.map((who) => (
        <button key={who.id} disabled={busy || !ok(who.id).ok} title={ok(who.id).reasons.join(' · ')} onClick={() => act(who.id)}>
          {label} on {who.name}
        </button>
      ))
    )

  return (
    <div className="bag">
      <h2>Carrying</h2>
      {held.length === 0 && <p className="hint">Nothing. The market sells gifts and a few things worth using.</p>}
      {held.map(({ item, count }) => (
        <div key={item.id} className="ware">
          <span className="ware-icon">
            <ItemIcon name={item.icon} />
          </span>
          <div>
            <strong>
              {item.name}
              {count > 1 && ` ×${count}`}
            </strong>
            <span>{item.description}</span>
            {item.use && <span className="hint">Use: {effectsLine(content, item.use.effects)}</span>}
          </div>
          <div className="give-to">
            {item.use && targets(item.use.on, (onId) => onUseItem(item.id, onId), (onId) => canUse(content, state, item.id, onId), 'Use')}
            {onGive &&
              !item.use &&
              company.map((who) => (
                <button key={who.id} disabled={busy} onClick={() => onGive(item.id, who.id)}>
                  {company.length > 1 ? `Give ${who.name}` : 'Give'}
                </button>
              ))}
          </div>
        </div>
      ))}

      {abilities.length > 0 && <h2>What you can make</h2>}
      {abilities.map((skill) => {
        const wait = readyIn(content, state, skill)
        return (
          <div key={skill.id} className="ware">
            <span className="ware-icon">
              <ItemIcon name="vial" />
            </span>
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
              <span className="hint">
                {effectsLine(content, skill.ability!.effects)} · {wait > 0 ? `ready in ${span(wait, hoursPerDay)}` : `ready, then ${span(skill.ability!.cooldownDays * hoursPerDay, hoursPerDay)} to wait`}
              </span>
            </div>
            <div className="give-to">{targets(skill.ability!.on, (onId) => onAbility(skill.id, onId), (onId) => canUseAbility(content, state, skill.id, onId), skill.ability!.label)}</div>
          </div>
        )
      })}

      {boons.length > 0 && <h2>In effect</h2>}
      {boons.map((boon, i) => (
        <p key={i} className="bag-boon">
          <strong>{boon.source}</strong>
          {boon.targetId ? ` on ${nameOf(boon.targetId)}` : ''}: {describeChange(boon)} · {span(boon.until - state.time, hoursPerDay)} left
        </p>
      ))}
    </div>
  )
}
