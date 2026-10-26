import { useState, type ReactNode } from 'react'
import { canUse, canUseAbility, carried, describeChange, liveBoons, readyIn, relicOn, relicsHeld, skillsOf } from '../../../shared/game'
import { STATS, type ContentPack, type Effect, type GameState, type Stat } from '../../../shared/model'
import { Button } from './Button'
import { EmptySquare, ItemSquare } from './ItemSquare'
import { t, type MessageKey } from '../../../shared/i18n'

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
  /** Turns a relic that is always at work off, or on again. */
  onToggleRelic: (relicId: string) => void
  /** Uses a relic in the scene he is in, and why one cannot be. Left out, he is in no scene. */
  onUseRelic?: (relicId: string) => void
  canUseRelic?: (relicId: string) => { ok: boolean; reasons: string[] }
}

// What the bag is sorted into: what he carries, what he has brought up from below for good, and what he can make.
const TABS = ['Regular', 'Relics', 'Crafting'] as const
const TAB_LABELS: Record<(typeof TABS)[number], MessageKey> = { Regular: 'panels.bag.tab.regular', Relics: 'panels.bag.tab.relics', Crafting: 'panels.bag.tab.crafting' }

// The fewest squares the grid of what he carries shows, empty ones among them, so that it reads as a bag and not as a list.
const SLOTS = 12

/** In a few words, what using a thing does: for the line under its name. */
function effectsLine(content: ContentPack, effects: Effect[]): string {
  return effects
    .map((effect) => {
      if (effect.type === 'boon')
        return `${t('panels.bag.effect.boon', { change: describeChange(effect.modifier), duration: effect.hours >= 24 ? t('panels.bag.effect.days', { n: Math.round(effect.hours / 24), many: effect.hours >= 48 }) : t('panels.bag.effect.hours', { n: effect.hours }) })}${effect.on === 'her' ? t('panels.bag.onHer') : ''}`
      if (effect.type === 'energy') return t('panels.bag.effect.energy', { amount: `${effect.amount > 0 ? '+' : ''}${effect.amount}` })
      if (effect.type === 'item') return t(effect.count > 1 ? 'panels.bag.effect.makesSome' : 'panels.bag.effect.makes', { count: effect.count, name: content.items.find((item) => item.id === effect.itemId)?.name ?? effect.itemId })
      if (effect.type === 'money') return `${effect.amount > 0 ? '+' : '-'}$${Math.abs(effect.amount)}`
      // Her affection, trust or desire, or one of his stats.
      if (effect.type === 'meter' || effect.type === 'stat') return t('panels.bag.effect.meter', { amount: `${effect.amount > 0 ? '+' : ''}${effect.amount}`, what: effect.type === 'meter' ? t(`panels.common.meter.${effect.meter}` as const) : (STATS as readonly string[]).includes(effect.stat) ? t(`panels.common.stat.${effect.stat as Stat}` as const) : effect.stat })
      return ''
    })
    .filter(Boolean)
    .join(' · ')
}

const span = (hours: number, hoursPerDay: number) => (hours >= hoursPerDay ? t('panels.bag.spanDays', { n: Math.ceil(hours / hoursPerDay) }) : t('panels.bag.spanHours', { n: hours }))

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
export function Bag({ content, state, company = [], busy, onUseItem, onAbility, onGive, onToggleRelic, onUseRelic, canUseRelic }: Props) {
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
      <span className="hint">{t('panels.bag.forHer')}</span>
    ) : (
      company.map((who) => (
        <Button key={who.id} variant="primary" size="small" disabled={busy || !ok(who.id).ok} title={ok(who.id).reasons.join(' · ')} onClick={() => act(who.id)}>
          {t('panels.bag.actionOn', { action: label, name: who.name })}
        </Button>
      ))
    )

  const items: Slot[] = carried(content, state).map(({ item, count }) => {
    const below = item.below ? t('panels.bag.below', { effects: [item.below.footing > 0 && t('panels.bag.belowFooting', { n: item.below.footing }), item.below.calms && t('panels.bag.belowCalms')].filter(Boolean).join(' · ') }) : ''
    const does = item.use ? effectsLine(content, item.use.effects) : ''
    const use = does ? `${t('panels.bag.useLine', { effects: does })}${item.use?.on === 'her' && !does.includes(t('panels.bag.onHer')) ? t('panels.bag.onHer') : ''}` : ''
    return {
      key: `item:${item.id}`,
      name: item.name,
      icon: item.icon,
      image: item.image,
      count,
      tip: [item.description, use, below].filter(Boolean).join('\n'),
      line: [use, below].filter(Boolean).join(' · ') || (item.lovedByAll ? t('panels.bag.giftAll') : t('panels.bag.gift')),
      actions: (
        <>
          {item.use && targets(item.use.on, (onId) => onUseItem(item.id, onId), (onId) => canUse(content, state, item.id, onId), t('panels.bag.use'))}
          {onGive &&
            !item.use &&
            !item.below &&
            company.map((who) => (
              <Button key={who.id} variant="primary" size="small" disabled={busy} onClick={() => onGive(item.id, who.id)}>
                {company.length > 1 ? t('panels.bag.giveTo', { name: who.name }) : t('panels.bag.give')}
              </Button>
            ))}
        </>
      )
    }
  })
  // A relic is either always at work, and can be turned off and on, or used in a scene, once a scene.
  const relics: Slot[] = relicsHeld(content, state).map((relic) => {
    const on = relicOn(state, relic.id)
    const usable = canUseRelic?.(relic.id)
    return {
      key: `relic:${relic.id}`,
      name: relic.name,
      icon: relic.icon,
      image: relic.image,
      tag: relic.use || on ? undefined : t('panels.bag.off'),
      tip: relic.description,
      line: relic.description,
      actions: relic.use ? (
        onUseRelic ? (
          <Button variant="primary" size="small" disabled={busy || !usable?.ok} title={usable?.reasons.join(' · ') || undefined} onClick={() => onUseRelic(relic.id)}>
            {t('panels.bag.use')}
          </Button>
        ) : (
          <span className="hint">{t('panels.bag.usedInScene')}</span>
        )
      ) : (
        <Button size="small" variant={on ? 'secondary' : 'primary'} disabled={busy} onClick={() => onToggleRelic(relic.id)}>
          {on ? t('panels.bag.turnOff') : t('panels.bag.turnOn')}
        </Button>
      )
    }
  })
  const makes: Slot[] = skillsOf(content, state)
    .filter((skill) => skill.ability)
    .map((skill) => {
      const wait = readyIn(content, state, skill)
      // What is made, where it is a thing: the square shows that, and says what the thing does, not that it is made.
      const made = skill.ability!.effects.flatMap((effect) => (effect.type === 'item' ? (content.items.find((item) => item.id === effect.itemId) ?? []) : []))[0]
      const does = made ? (made.use ? effectsLine(content, made.use.effects) : made.lovedByAll ? t('panels.bag.giftAllLower') : made.description) : effectsLine(content, skill.ability!.effects)
      const line = `${does} · ${wait > 0 ? t('panels.bag.readyIn', { span: span(wait, hoursPerDay) }) : t('panels.bag.every', { span: span(skill.ability!.cooldownDays * hoursPerDay, hoursPerDay) })}`
      return {
        key: `skill:${skill.id}`,
        name: made?.name ?? skill.name,
        icon: made?.icon ?? 'vial',
        image: made?.image,
        tag: wait > 0 ? span(wait, hoursPerDay) : t('panels.bag.ready'),
        tip: line,
        line,
        actions: targets(skill.ability!.on, (onId) => onAbility(skill.id, onId), (onId) => canUseAbility(content, state, skill.id, onId), made ? t('panels.bag.craft') : skill.ability!.label)
      }
    })

  const all = [...items, ...relics, ...makes]
  const chosen = all.find((slot) => slot.key === picked)
  const grid = (slots: Slot[], least = 0) => (
    <div className="bag-grid">
      {slots.map((slot) => (
        <div key={slot.key} className="bag-cell">
          <ItemSquare icon={slot.icon} image={slot.image} count={slot.count} tag={slot.tag} picked={slot.key === picked} faint={slot.tag !== undefined && slot.tag !== t('panels.bag.ready')} title={slot.tip} onClick={() => setPicked(slot.key === picked ? null : slot.key)} />
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
            {t(TAB_LABELS[name])}
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

      {boons.length > 0 && <h2>{t('panels.bag.inEffect')}</h2>}
      {boons.map((boon, i) => (
        <p key={i} className="bag-boon">
          <strong>{boon.source}</strong>
          {t(boon.targetId ? 'panels.bag.boonOnLine' : 'panels.bag.boonLine', { name: boon.targetId && nameOf(boon.targetId), change: describeChange(boon), span: span(boon.until - state.time, hoursPerDay) })}
        </p>
      ))}
    </div>
  )
}
