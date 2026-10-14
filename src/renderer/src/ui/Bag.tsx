import { useState, type ReactNode } from 'react'
import { canUse, canUseAbility, carried, describeChange, liveBoons, readyIn, relicsHeld, skillsOf } from '../../../shared/game'
import type { ContentPack, Effect, GameState } from '../../../shared/model'
import { Button } from './Button'
import { EmptySquare, ItemSquare } from './ItemSquare'

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

// What the bag is sorted into: what he carries, what he has brought up from below for good, and what he can make.
const TABS = ['Regular', 'Relics', 'Crafting'] as const

// The fewest squares the grid of what he carries shows, empty ones among them, so that it reads as a bag and not as a list.
const SLOTS = 12

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

/** One square of the bag: what is in it, drawn, with how many and, pointed at, everything there is to say of it. */
interface Slot {
  key: string
  name: string
  icon: string
  /** Its own picture, shown in place of the icon where it has one. */
  image?: string
  count?: number
  /** A word on the square itself: "ready", "3 days". */
  tag?: string
  /** Said in full when it is pointed at. */
  tip: string
  /** The one line said of it when it is picked. */
  line: string
  /** What can be done with it, when it is picked. */
  actions?: ReactNode
}

/**
 * What he has to hand, as a bag of squares under three tabs: the things he carries, to use or to give; the relics he has brought up
 * from below; what he has learnt to make or set off, and when each is ready again; and whatever of it is working
 * now. Pointing at a square says what it is; picking one shows what can be done with it. The same on the day screen
 * and in a scene, where there is someone to use a thing on.
 */
export function Bag({ content, state, company = [], busy, onUseItem, onAbility, onGive }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Regular')
  const [picked, setPicked] = useState<string | null>(null)
  const boons = liveBoons(state)
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const hoursPerDay = content.calendar.hoursPerDay

  /** One button for himself, or one for each woman he is with when it is for her. */
  const targets = (on: 'self' | 'her', act: (onId?: string) => void, ok: (onId?: string) => { ok: boolean; reasons: string[] }, label: string) =>
    on === 'self' ? (
      <Button variant="primary" size="small" disabled={busy || !ok().ok} title={ok().reasons.join(' · ')} onClick={() => act()}>
        {label}
      </Button>
    ) : company.length === 0 ? (
      <span className="hint">For someone you are with</span>
    ) : (
      company.map((who) => (
        <Button key={who.id} variant="primary" size="small" disabled={busy || !ok(who.id).ok} title={ok(who.id).reasons.join(' · ')} onClick={() => act(who.id)}>
          {label} on {who.name}
        </Button>
      ))
    )

  const items: Slot[] = carried(content, state).map(({ item, count }) => {
    const below = item.below ? `In a fight below: ${[item.below.footing > 0 && `+${item.below.footing} footing`, item.below.calms && 'clears a surge'].filter(Boolean).join(' · ')}` : ''
    const use = item.use ? `Use: ${effectsLine(content, item.use.effects)}` : ''
    return {
      key: `item:${item.id}`,
      name: item.name,
      icon: item.icon,
      image: item.image,
      count,
      tip: [item.description, use, below].filter(Boolean).join('\n'),
      line: [use, below].filter(Boolean).join(' · ') || (item.lovedByAll ? 'A gift any woman loves' : 'A gift'),
      actions: (
        <>
          {item.use && targets(item.use.on, (onId) => onUseItem(item.id, onId), (onId) => canUse(content, state, item.id, onId), 'Use')}
          {onGive &&
            !item.use &&
            !item.below &&
            company.map((who) => (
              <Button key={who.id} variant="primary" size="small" disabled={busy} onClick={() => onGive(item.id, who.id)}>
                {company.length > 1 ? `Give ${who.name}` : 'Give'}
              </Button>
            ))}
        </>
      )
    }
  })
  const relics: Slot[] = relicsHeld(content, state).map((relic) => ({
    key: `relic:${relic.id}`,
    name: relic.name,
    icon: relic.icon,
    image: relic.image,
    tip: `${relic.description}\nAlways: ${describeChange(relic.modifier)}`,
    line: `Always: ${describeChange(relic.modifier)}`
  }))
  const makes: Slot[] = skillsOf(content, state)
    .filter((skill) => skill.ability)
    .map((skill) => {
      const wait = readyIn(content, state, skill)
      // What is made, where it is a thing: the square shows that, and says what the thing does, not that it is made.
      const made = skill.ability!.effects.flatMap((effect) => (effect.type === 'item' ? (content.items.find((item) => item.id === effect.itemId) ?? []) : []))[0]
      const does = made ? (made.use ? effectsLine(content, made.use.effects) : made.lovedByAll ? 'a gift any woman loves' : made.description) : effectsLine(content, skill.ability!.effects)
      const line = `${does} · ${wait > 0 ? `ready in ${span(wait, hoursPerDay)}` : `every ${span(skill.ability!.cooldownDays * hoursPerDay, hoursPerDay)}`}`
      return {
        key: `skill:${skill.id}`,
        name: made?.name ?? skill.name,
        icon: made?.icon ?? 'vial',
        image: made?.image,
        tag: wait > 0 ? span(wait, hoursPerDay) : 'ready',
        tip: line,
        line,
        actions: targets(skill.ability!.on, (onId) => onAbility(skill.id, onId), (onId) => canUseAbility(content, state, skill.id, onId), made ? 'Craft' : skill.ability!.label)
      }
    })

  const all = [...items, ...relics, ...makes]
  const chosen = all.find((slot) => slot.key === picked)
  const grid = (slots: Slot[], least = 0) => (
    <div className="bag-grid">
      {slots.map((slot) => (
        <div key={slot.key} className="bag-cell">
          <ItemSquare icon={slot.icon} image={slot.image} count={slot.count} tag={slot.tag} picked={slot.key === picked} faint={slot.tag !== undefined && slot.tag !== 'ready'} title={slot.tip} onClick={() => setPicked(slot.key === picked ? null : slot.key)} />
          <span className="bag-name">{slot.name}</span>
        </div>
      ))}
      {Array.from({ length: Math.max(0, least - slots.length) }, (_, index) => (
        <div key={index} className="bag-cell">
          <EmptySquare />
        </div>
      ))}
    </div>
  )

  return (
    <div className="bag">
      <div className="tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'tab selected' : 'tab'}
            onClick={() => {
              setTab(name)
              setPicked(null)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {/* Each is the same bag of squares, so that going from one to another changes what is in it and not its size. */}
      {grid(tab === 'Regular' ? items : tab === 'Relics' ? relics : makes, SLOTS)}

      {/* What is picked, while something is: its name, the one line that matters, and what can be done with it. */}
      {chosen && (
        <div className="bag-picked">
          <span className="bag-picked-what">
            <strong>
              {chosen.name}
              {chosen.count !== undefined && chosen.count > 1 && ` ×${chosen.count}`}
            </strong>
            <span className="hint">{chosen.line}</span>
          </span>
          <span className="give-to">{chosen.actions}</span>
        </div>
      )}

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
