import { useEffect, useState } from 'react'
import {
  arrearsDeadline,
  askToLeave,
  babiesAtHome,
  buildRoom,
  builtTier,
  canBuild,
  canInvite,
  factor,
  freeBeds,
  goHome,
  goToRoom,
  healthCap,
  healthName,
  houseComfort,
  householdCost,
  houseTotals,
  inRoom,
  invitable,
  invite,
  monthlyRent,
  nextHealthStep,
  nextRentDay,
  nextWork,
  payArrears,
  pregnancyOf,
  toDate,
  viewImage
} from '../../../../shared/game'
import type { ContentPack, GameState, HouseRoom, HousingConfig } from '../../../../shared/model'
import { play } from '../../sound'
import { BackButton } from '../BackButton'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { Dialog } from '../Dialog'
import { Facts, type Fact } from '../Facts'
import { GrandButton } from '../GrandButton'
import { FriendsIcon, HeartIcon, HelpIcon, JobIcon } from '../icons'
import { HelpPanel } from '../HelpPanel'
import { Ornate } from '../Ornate'
import { Portrait } from '../Portrait'
import { HouseFacade, wornSprite } from './HouseFacade'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
  /** Once someone has moved in and it has been celebrated: the scene with her in her new room. */
  onMovedIn: (loveInterestId: string, roomKey: string) => void
}

// How long a room is celebrated once it is built.
const BUILT_MS = 1600
const REFUSED_MS = 500

type Effects = { beds: number; cots: number; comfort: number; study: number }

/** What a room, or a fitting-out of one, adds to the house, as figures. Nothing for what it does not add. */
function effectFacts(part: Effects): Fact[] {
  const facts: (Fact | false)[] = [
    part.beds > 0 && { label: t('panels.house.beds'), value: `+${part.beds}` },
    part.cots > 0 && { label: t('panels.house.cots'), value: `+${part.cots}` },
    part.comfort > 0 && { label: t('panels.house.comfort'), value: `+${part.comfort}` },
    part.study > 0 && { label: t('panels.house.study'), value: `+${part.study}` }
  ]
  return facts.filter((fact): fact is Fact => fact !== false)
}

/**
 * His house, on a screen of its own: the house itself in the middle, every room a window onto it, the household and
 * its accounts at the side, and the room picked laid out on a card. It is opened from the day, never in the middle of a
 * scene, since building and taking people in change where a scene could go.
 */
export function HouseView({ content, state, onChange, onClose, onMovedIn }: Props) {
  const config = content.housing
  const [picked, setPicked] = useState<string | undefined>(state.housing.room)
  const [built, setBuilt] = useState<string>()
  const [refused, setRefused] = useState<string>()
  const [panel, setPanel] = useState<'household' | 'ledger' | null>(null)
  // The help, opened over the house on how the house works: closing it is back to the house.
  const [helping, setHelping] = useState(false)
  const { ask, dialog } = useConfirm()

  // Escape leaves the house, unless a dialog over it is up: that closes first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.overlay')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Each celebration is over after a while.
  useEffect(() => {
    if (!built) return
    const timer = window.setTimeout(() => setBuilt(undefined), BUILT_MS)
    return () => window.clearTimeout(timer)
  }, [built])
  useEffect(() => {
    if (!refused) return
    const timer = window.setTimeout(() => setRefused(undefined), REFUSED_MS)
    return () => window.clearTimeout(timer)
  }, [refused])

  if (!config || state.housing.status !== 'resident') {
    return (
      <Dialog title={t('panels.house.home')} onClose={onClose} narrow>
        <p className="hint">{t('panels.house.noHouse')}</p>
      </Dialog>
    )
  }

  const { calendar } = content
  const house = content.locations.find((l) => l.id === config.locationId)
  const light = toDate(calendar, state.time).period.light
  const atHome = state.locationId === config.locationId
  const room = config.rooms.find((r) => r.key === picked)
  const builtCount = config.rooms.filter((r) => builtTier(state, r.key) > 0).length
  const nanny = content.loveInterests.find((li) => li.id === config.nannyId)
  const residents = Object.keys(state.housing.residents).flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
  // What is seen around the house: its own picture, or failing that the hearth room's, blurred.
  const exterior = config.exterior?.[light] ?? config.exterior?.day ?? config.exterior?.night
  const fallback = viewImage(house?.backgrounds[0], light)
  const backdrop = exterior ?? fallback

  function pick(key: string) {
    setPicked(key)
    // A room that cannot be paid for says so where its price is.
    const r = config!.rooms.find((one) => one.key === key)
    if (r && builtTier(state, key) < 1 && nextWork(config!, state, key, factor(content, state, 'build')) && !canBuild(content, state, key).ok) setRefused(key)
  }

  function build(key: string) {
    play('build')
    onChange((s) => buildRoom(content, s, key))
    setBuilt(key)
  }

  function moveIn(key: string, id: string) {
    play('door')
    onChange((s) => invite(content, s, id, key))
    // Straight on to the hour with her in her new room: the scene is what marks it.
    onMovedIn(id, key)
  }

  return (
    <main className="stage house-screen">
      {dialog}
      {backdrop && <div className={exterior ? 'house-backdrop' : 'house-backdrop blurred'} style={{ backgroundImage: `url("content://pack/${backdrop}")` }} />}

      <Ornate
        title={config.name}
        note={atHome ? t('panels.house.atHome') : t('panels.house.yourHouse')}
        aside={
          <Button className="ornate-help" aria-label={t('panels.house.help')} title={t('panels.house.help')} onClick={() => setHelping(true)}>
            <HelpIcon size={24} />
          </Button>
        }
        corners
        className="house-side"
      >
        <div className="house-progress">
          <span className="caps">
            {t('panels.house.roomsBuilt', { n: builtCount, total: config.rooms.length })}
          </span>
          <span className="gold-bar">
            <span style={{ width: `${(builtCount / config.rooms.length) * 100}%` }} />
          </span>
        </div>
        <div className="house-household">
          <span className="caps">{t('panels.house.household')}</span>
          <div className="house-faces">
            {nanny && <Portrait who={nanny} image={wornSprite(content, state, nanny)} size={72} className="room-face" />}
            {residents.map((li) => (
              <Portrait key={li.id} who={li} image={wornSprite(content, state, li)} size={72} className="room-face" />
            ))}
            {babiesAtHome(state).length > 0 && <span className="house-children" title={t('panels.house.childrenAtHome')}>+{babiesAtHome(state).length}</span>}
          </div>
        </div>
        <HouseChildren content={content} state={state} config={config} />
        <HouseFacts content={content} state={state} config={config} onChange={onChange} />
        <div className="house-side-actions">
          <GrandButton label={t('panels.house.household')} icon={<FriendsIcon size={24} />} onClick={() => setPanel('household')} />
          <GrandButton label={t('panels.house.ledger')} icon={<JobIcon name="scroll" size={24} />} onClick={() => setPanel('ledger')} />
          {!atHome && (
            <GrandButton
              label={t('panels.house.goHome')}
              icon={<JobIcon name="house" size={24} />}
              onClick={() => {
                onChange((s) => goHome(content, s))
                onClose()
              }}
            />
          )}
        </div>
      </Ornate>

      {/* The way out, on its own in the corner, where it is looked for. */}
      <BackButton className="house-close" onClick={onClose} />

      <div className="house-stage">
        <HouseFacade content={content} state={state} config={config} light={light} picked={picked} built={built} refused={refused} onPick={pick} />
      </div>

      {room && (
        <RoomCard
          key={room.key}
          content={content}
          state={state}
          config={config}
          room={room}
          image={viewImage(house?.backgrounds.find((view) => view.id === room.viewId), light)}
          atHome={atHome}
          onBuild={() => build(room.key)}
          onInvite={(id) => moveIn(room.key, id)}
          onGo={() => {
            onChange((s) => goToRoom(content, s, room.key))
            onClose()
          }}
        />
      )}

      {panel === 'household' && (
        <Dialog title={t('panels.house.household')} onClose={() => setPanel(null)} ornate>
          <Household content={content} state={state} config={config} onAskToLeave={async (id, name) =>
            (await ask({ title: t('panels.house.askLeaveTitle', { name }), detail: t('panels.house.askLeaveDetail'), confirm: t('panels.house.askLeaveConfirm'), cancel: t('panels.house.askLeaveCancel'), grave: true })) &&
            onChange((s) => askToLeave(content, s, id))
          } />
        </Dialog>
      )}
      {panel === 'ledger' && (
        <Dialog title={t('panels.house.ledger')} onClose={() => setPanel(null)} narrow ornate>
          <div className="house-ledger sheet">
            {state.housing.ledger.length === 0 && <p className="hint">{t('panels.house.nothingYet')}</p>}
            {[...state.housing.ledger].reverse().map((line, i) => {
              const date = toDate(calendar, line.time)
              return (
                <div key={i} className="house-line">
                  <span className="hint">
                    {t('panels.house.ledgerDate', { day: date.day, month: date.month.name })}
                  </span>
                  <span>{line.text}</span>
                  <strong>{line.amount === 0 ? '' : `−$${-line.amount}`}</strong>
                </div>
              )
            })}
          </div>
        </Dialog>
      )}
      {helping && <HelpPanel content={content} state={state} tab="House and children" onClose={() => setHelping(false)} />}
    </main>
  )
}

/** How a child is doing: a pip for each level, filled up to where it stands. One the house cannot yet take it to is dashed. */
function ChildPips({ config, health, cap }: { config: HousingConfig; health: number; cap: number }) {
  return (
    <span className="house-pips" role="img" aria-label={t('panels.house.pips', { health: healthName(config, health), n: health + 1, total: config.babies.levels.length })}>
      {config.babies.levels.map((_, level) => (
        <i key={level} className={level <= health ? (health < config.babies.startLevel ? 'on low' : 'on') : level > cap ? 'out' : undefined} />
      ))}
    </span>
  )
}

/**
 * The children at home, the goal the house is for: how each is doing, and what the house would need for them to do
 * better. Nothing until a child lives there.
 */
function HouseChildren({ content, state, config }: { content: ContentPack; state: GameState; config: HousingConfig }) {
  const children = babiesAtHome(state)
  if (children.length === 0) return null
  const cap = healthCap(content, state)
  const step = nextHealthStep(content, state)
  return (
    <div className="house-kids">
      <span className="caps">{t('panels.house.children')}</span>
      {children.map((child, i) => (
        <div key={i} className="house-kid" title={config.babies.levels[child.health ?? 0]?.description}>
          <span className="house-kid-name">{child.name}</span>
          <span className="house-kid-health">{healthName(config, child.health ?? 0)}</span>
          <ChildPips config={config} health={child.health ?? 0} cap={cap} />
        </div>
      ))}
      {step && (
        <span className="house-kid-next" title={t('panels.house.nextStepTitle')}>
          {t('panels.house.nextStep', { comfort: houseComfort(content, state), need: step.comfort, level: step.level.toLowerCase() })}
        </span>
      )}
    </div>
  )
}

/** The standing of the house, as figures: rent, the children's keep, beds and cots taken, comfort, and his money. */
function HouseFacts({ content, state, config, onChange }: { content: ContentPack; state: GameState; config: HousingConfig; onChange: Props['onChange'] }) {
  const { calendar } = content
  const dayLabel = (dayIndex: number) => {
    const date = toDate(calendar, dayIndex * calendar.hoursPerDay)
    return t('panels.house.dayLabel', { weekday: date.weekday, day: date.day, month: date.month.name })
  }
  const totals = houseTotals(config, state)
  const rentDay = nextRentDay(content, state)
  const deadline = arrearsDeadline(content, state)
  const cap = healthCap(content, state)
  return (
    <Facts
      facts={[
        deadline !== undefined
          ? {
              label: t('panels.house.rentOwing'),
              value: `$${state.housing.arrears}`,
              note: t('panels.house.by', { day: dayLabel(deadline) }),
              warn: true,
              action: (
                <Button variant="primary" size="small" disabled={state.player.money < state.housing.arrears} title={state.player.money < state.housing.arrears ? t('panels.house.youHaveMoney', { money: state.player.money }) : undefined} onClick={() => onChange((s) => payArrears(content, s))}>
                  {t('panels.house.pay')}
                </Button>
              )
            }
          : {
              label: t('panels.house.rent'),
              value: rentDay === undefined ? t('panels.house.noneLeft') : `$${monthlyRent(content, state)}`,
              note: rentDay === undefined ? t('panels.house.thisYear') : t('panels.house.due', { day: dayLabel(rentDay) }),
              title: config.rentRelief.perChild > 0 ? t('panels.house.rentTitle', { rent: config.rent, perChild: config.rentRelief.perChild, floor: Math.min(config.rent, config.rentRelief.floor) }) : undefined
            },
        { label: t('panels.house.childrensWeek'), value: `$${householdCost(content, state)}` },
        { label: t('panels.house.beds'), value: t('panels.house.countOf', { n: Object.keys(state.housing.residents).length, total: totals.beds }) },
        { label: t('panels.house.cots'), value: t('panels.house.countOf', { n: babiesAtHome(state).length, total: totals.cots }) },
        { label: t('panels.house.comfort'), value: houseComfort(content, state), title: t('panels.house.comfortTitle', { level: healthName(config, cap).toLowerCase() }) },
        { label: t('panels.house.youHave'), value: `$${state.player.money}` }
      ]}
    />
  )
}

interface RoomCardProps {
  content: ContentPack
  state: GameState
  config: HousingConfig
  room: HouseRoom
  image: string | undefined
  atHome: boolean
  onBuild: () => void
  onInvite: (id: string) => void
  onGo: () => void
}

/** The room picked: its picture, what it is and adds, who is in it, and what can be done with it. */
function RoomCard({ content, state, config, room, image, atHome, onBuild, onInvite, onGo }: RoomCardProps) {
  const tier = builtTier(state, room.key)
  const work = nextWork(config, state, room.key, factor(content, state, 'build'))
  const check = canBuild(content, state, room.key)
  const bedroom = room.role === 'suite' || room.role === 'master'
  const free = freeBeds(config, state, room.key)
  const candidates = bedroom && tier > 0 && free > 0 ? invitable(content, state, room.key) : []
  // Those the house is for who cannot be asked yet, each with why, so that he knows what stands in the way.
  const waiting =
    bedroom && tier > 0 && free > 0
      ? content.loveInterests
          .filter((li) => li.id !== config.nannyId && state.housing.residents[li.id] === undefined && (pregnancyOf(state, li.id) !== undefined || state.children.some((child) => child.motherId === li.id)))
          .map((li) => ({ li, check: canInvite(content, state, li.id, room.key) }))
          .filter(({ check }) => !check.ok)
      : []
  const made = room.tiers.slice(0, Math.max(0, tier - 1))
  const present = tier > 0 ? inRoom(content, state, room.key) : []
  const adds = effectFacts(room)
  return (
    <Ornate className="house-card">
      <div className="house-card-picture">
        {image ? <img src={`content://pack/${image}`} alt={room.name} className={tier < 1 ? 'locked' : undefined} /> : <div className="room-blank" />}
      </div>
      <h2>{room.name}</h2>
      {tier < 1 && <span className="caps">{t('panels.house.notBuilt')}</span>}
      <p>{[room.description, ...made.map((t) => t.description)].filter(Boolean).join(' ')}</p>
      {adds.length > 0 && <Facts facts={adds} />}
      {made.length > 0 && (
        <div className="house-tiers">
          {made.map((t) => (
            <span key={t.name} className="chip">
              {t.name}
            </span>
          ))}
        </div>
      )}
      {present.length > 0 && (
        <div className="house-faces">
          {present.map((li) => (
            <Portrait key={li.id} who={li} image={wornSprite(content, state, li)} size={76} className="room-face" />
          ))}
        </div>
      )}

      {work && (
        <div className="house-work">
          <GrandButton
            label={work.upgrade ? work.name : t('panels.house.build')}
            note={check.ok ? `$${work.cost}` : `$${work.cost} · ${check.reasons.join(' · ')}`}
            icon={<JobIcon name="crate" size={24} />}
            tip={work.description || undefined}
            disabled={!check.ok}
            onClick={onBuild}
          />
        </div>
      )}

      {candidates.length > 0 && (
        <div className="house-work">
          {candidates.map((li) => (
            <GrandButton key={li.id} label={t('panels.house.offerTo', { name: li.name.split(' ')[0] })} icon={<HeartIcon size={24} />} onClick={() => onInvite(li.id)} />
          ))}
        </div>
      )}
      {waiting.map(({ li, check }) => (
        <span key={li.id} className="hint">
          {li.name.split(' ')[0]}: {check.reasons.join(' · ')}
        </span>
      ))}

      {tier > 0 && (!atHome || state.housing.room !== room.key) && <GrandButton label={t('panels.house.goToRoom')} icon={<JobIcon name="door" size={24} />} onClick={onGo} />}
    </Ornate>
  )
}

/** Who lives in the house, and how the children do. */
function Household({ content, state, config, onAskToLeave }: { content: ContentPack; state: GameState; config: HousingConfig; onAskToLeave: (id: string, name: string) => void }) {
  const firstOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const nanny = content.loveInterests.find((li) => li.id === config.nannyId)
  const cap = healthCap(content, state)
  return (
    <div className="house-people">
      <h2>{t('panels.house.whoLivesHere')}</h2>
      {nanny && (
        <div className="card house-person">
          <Portrait who={nanny} image={wornSprite(content, state, nanny)} size={62} className="room-face" />
          <div>
            <strong>{nanny.name}</strong>
            <span className="hint">{t('panels.house.nanny')}</span>
          </div>
        </div>
      )}
      {Object.entries(state.housing.residents).map(([id, key]) => {
        const li = content.loveInterests.find((c) => c.id === id)
        if (!li) return null
        return (
          <div key={id} className="card house-person">
            <Portrait who={li} image={wornSprite(content, state, li)} size={62} className="room-face" />
            <div>
              <strong>{li.name}</strong>
              <span className="hint">
                {config.rooms.find((r) => r.key === key)?.name}
                {pregnancyOf(state, id) ? t('panels.house.pregnant') : ''}
              </span>
            </div>
            <Button size="small" onClick={() => onAskToLeave(id, firstOf(id))}>
              {t('panels.house.askToLeave')}
            </Button>
          </div>
        )
      })}

      <h2>{t('panels.house.theChildren')}</h2>
      {state.children.length === 0 && <p className="hint">{t('panels.house.noneYet')}</p>}
      {state.children.map((child, i) => (
        <div key={i} className="card house-person">
          <div>
            <strong>{t('panels.house.childOf', { name: child.name, mother: firstOf(child.motherId), daughter: child.daughter })}</strong>
            {child.health === undefined ? (
              <span className="hint">
                {state.housing.residents[child.motherId] !== undefined || child.motherId === config.nannyId ? t('panels.house.crecheFull') : t('panels.house.creche')}
              </span>
            ) : (
              <span className="hint">
                {t('panels.house.childKeep', { health: healthName(config, child.health), cost: config.babies.weeklyCost })}
              </span>
            )}
          </div>
          {child.health !== undefined && <ChildPips config={config} health={child.health} cap={cap} />}
        </div>
      ))}
    </div>
  )
}
