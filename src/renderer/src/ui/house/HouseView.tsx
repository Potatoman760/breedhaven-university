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
  nextRentDay,
  nextWork,
  payArrears,
  pregnancyOf,
  toDate,
  viewImage
} from '../../../../shared/game'
import type { ContentPack, GameState, HouseRoom, HousingConfig } from '../../../../shared/model'
import { play } from '../../sound'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { Dialog } from '../Dialog'
import { Facts, type Fact } from '../Facts'
import { GrandButton } from '../GrandButton'
import { BackIcon, FriendsIcon, HeartIcon, JobIcon } from '../icons'
import { Ornate } from '../Ornate'
import { Portrait } from '../Portrait'
import { HouseFacade, wornSprite } from './HouseFacade'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
}

// How long a room is celebrated once it is built, and once someone has moved into it.
const BUILT_MS = 1600
const MOVED_IN_MS = 3200
const REFUSED_MS = 500

type Effects = { beds: number; cots: number; comfort: number; study: number }

/** What a room, or a fitting-out of one, adds to the house, as figures. Nothing for what it does not add. */
function effectFacts(part: Effects): Fact[] {
  const facts: (Fact | false)[] = [
    part.beds > 0 && { label: 'Beds', value: `+${part.beds}` },
    part.cots > 0 && { label: 'Cots', value: `+${part.cots}` },
    part.comfort > 0 && { label: 'Comfort', value: `+${part.comfort}` },
    part.study > 0 && { label: 'Study', value: `+${part.study}` }
  ]
  return facts.filter((fact): fact is Fact => fact !== false)
}

/**
 * His house, on a screen of its own: the house itself in the middle, every room a window onto it, the household and
 * its accounts at the side, and the room picked laid out on a card. It is opened from the day, never in the middle of a
 * scene, since building and taking people in change where a scene could go.
 */
export function HouseView({ content, state, onChange, onClose }: Props) {
  const config = content.housing
  const [picked, setPicked] = useState<string | undefined>(state.housing.room)
  const [built, setBuilt] = useState<string>()
  const [movedIn, setMovedIn] = useState<{ key: string; name: string }>()
  const [refused, setRefused] = useState<string>()
  const [panel, setPanel] = useState<'household' | 'ledger' | null>(null)
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
    if (!movedIn) return
    const timer = window.setTimeout(() => setMovedIn(undefined), MOVED_IN_MS)
    return () => window.clearTimeout(timer)
  }, [movedIn])
  useEffect(() => {
    if (!refused) return
    const timer = window.setTimeout(() => setRefused(undefined), REFUSED_MS)
    return () => window.clearTimeout(timer)
  }, [refused])

  if (!config || state.housing.status !== 'resident') {
    return (
      <Dialog title="Home" onClose={onClose} narrow>
        <p className="hint">You have no house of your own.</p>
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
    setMovedIn({ key, name: content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id })
  }

  return (
    <main className="stage house-screen">
      {dialog}
      {backdrop && <div className={exterior ? 'house-backdrop' : 'house-backdrop blurred'} style={{ backgroundImage: `url("content://pack/${backdrop}")` }} />}
      {movedIn && <div className="house-banner">{movedIn.name} has moved in!</div>}

      <Ornate title={config.name} note={atHome ? 'You are at home' : 'Your house'} corners className="house-side">
        <div className="house-progress">
          <span className="caps">
            {builtCount} of {config.rooms.length} rooms
          </span>
          <span className="gold-bar">
            <span style={{ width: `${(builtCount / config.rooms.length) * 100}%` }} />
          </span>
        </div>
        <div className="house-household">
          <span className="caps">Household</span>
          <div className="house-faces">
            {nanny && <Portrait who={nanny} image={wornSprite(content, state, nanny)} size={72} className="room-face" />}
            {residents.map((li) => (
              <Portrait key={li.id} who={li} image={wornSprite(content, state, li)} size={72} className="room-face" />
            ))}
            {babiesAtHome(state).length > 0 && <span className="house-children" title="Children at home">+{babiesAtHome(state).length}</span>}
          </div>
        </div>
        <HouseFacts content={content} state={state} config={config} onChange={onChange} />
        <div className="house-side-actions">
          <GrandButton label="Household" icon={<FriendsIcon size={24} />} onClick={() => setPanel('household')} />
          <GrandButton label="Ledger" icon={<JobIcon name="scroll" size={24} />} onClick={() => setPanel('ledger')} />
          {!atHome && (
            <GrandButton
              label="Go home"
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
      <GrandButton label="Close" icon={<BackIcon size={22} />} chevron={false} className="house-close" onClick={onClose} />

      <div className="house-stage">
        <HouseFacade content={content} state={state} config={config} light={light} picked={picked} built={built} movedInto={movedIn?.key} refused={refused} onPick={pick} />
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
          onClose={() => setPicked(undefined)}
        />
      )}

      {panel === 'household' && (
        <Dialog title="Household" onClose={() => setPanel(null)}>
          <Household content={content} state={state} config={config} onAskToLeave={async (id, name) =>
            (await ask({ title: `Ask ${name} to leave?`, detail: 'She will take her children back to the creche, will think the less of you for it, and will not come back.', confirm: 'Ask her to leave', cancel: 'Let her stay', grave: true })) &&
            onChange((s) => askToLeave(content, s, id))
          } />
        </Dialog>
      )}
      {panel === 'ledger' && (
        <Dialog title="Ledger" onClose={() => setPanel(null)} narrow>
          <div className="house-ledger">
            {state.housing.ledger.length === 0 && <p className="hint">Nothing yet.</p>}
            {[...state.housing.ledger].reverse().map((line, i) => {
              const date = toDate(calendar, line.time)
              return (
                <div key={i} className="house-line">
                  <span className="hint">
                    {date.day} {date.month.name}
                  </span>
                  <span>{line.text}</span>
                  <strong>{line.amount === 0 ? '' : `−$${-line.amount}`}</strong>
                </div>
              )
            })}
          </div>
        </Dialog>
      )}
    </main>
  )
}

/** The standing of the house, as figures: rent, the children's keep, beds and cots taken, comfort, and his money. */
function HouseFacts({ content, state, config, onChange }: { content: ContentPack; state: GameState; config: HousingConfig; onChange: Props['onChange'] }) {
  const { calendar } = content
  const dayLabel = (dayIndex: number) => {
    const date = toDate(calendar, dayIndex * calendar.hoursPerDay)
    return `${date.weekday} ${date.day} ${date.month.name}`
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
              label: 'Rent owing',
              value: `$${state.housing.arrears}`,
              note: `by ${dayLabel(deadline)}`,
              warn: true,
              action: (
                <Button variant="primary" size="small" disabled={state.player.money < state.housing.arrears} title={state.player.money < state.housing.arrears ? `You have $${state.player.money}` : undefined} onClick={() => onChange((s) => payArrears(content, s))}>
                  Pay
                </Button>
              )
            }
          : {
              label: 'Rent',
              value: rentDay === undefined ? 'None left' : `$${monthlyRent(content, state)}`,
              note: rentDay === undefined ? 'this year' : `due ${dayLabel(rentDay)}`,
              title: config.rentRelief.perChild > 0 ? `$${config.rent} a month, less $${config.rentRelief.perChild} for each child of yours, to no less than $${Math.min(config.rent, config.rentRelief.floor)}.` : undefined
            },
        { label: "Children's week", value: `$${householdCost(content, state)}` },
        { label: 'Beds', value: `${Object.keys(state.housing.residents).length} of ${totals.beds}` },
        { label: 'Cots', value: `${babiesAtHome(state).length} of ${totals.cots}` },
        { label: 'Comfort', value: houseComfort(content, state), title: `How well the house looks after those in it: children can reach ${healthName(config, cap).toLowerCase()}.` },
        { label: 'You have', value: `$${state.player.money}` }
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
  onClose: () => void
}

/** The room picked: its picture, what it is and adds, who is in it, and what can be done with it. */
function RoomCard({ content, state, config, room, image, atHome, onBuild, onInvite, onGo, onClose }: RoomCardProps) {
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
        <Button variant="quiet" size="small" className="house-card-close" title="Close" onClick={onClose}>
          ×
        </Button>
      </div>
      <h2>{room.name}</h2>
      {tier < 1 && <span className="caps">Not built yet</span>}
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
            label={work.upgrade ? work.name : 'Build this room'}
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
            <GrandButton key={li.id} label={`Offer to ${li.name.split(' ')[0]}`} icon={<HeartIcon size={24} />} onClick={() => onInvite(li.id)} />
          ))}
        </div>
      )}
      {waiting.map(({ li, check }) => (
        <span key={li.id} className="hint">
          {li.name.split(' ')[0]}: {check.reasons.join(' · ')}
        </span>
      ))}

      {tier > 0 && (!atHome || state.housing.room !== room.key) && <GrandButton label="Go to this room" icon={<JobIcon name="door" size={24} />} onClick={onGo} />}
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
      <h2>Who lives here</h2>
      {nanny && (
        <div className="card house-person">
          <Portrait who={nanny} image={wornSprite(content, state, nanny)} size={62} className="room-face" />
          <div>
            <strong>{nanny.name}</strong>
            <span className="hint">The nanny. She comes with the house.</span>
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
                {pregnancyOf(state, id) ? ' · pregnant' : ''}
              </span>
            </div>
            <Button size="small" onClick={() => onAskToLeave(id, firstOf(id))}>
              Ask to leave
            </Button>
          </div>
        )
      })}

      <h2>The children</h2>
      {state.children.length === 0 && <p className="hint">None yet.</p>}
      {state.children.map((child, i) => (
        <div key={i} className="card house-person">
          <div>
            <strong>{`${child.name}, ${firstOf(child.motherId)}'s ${child.daughter ? 'daughter' : 'son'}`}</strong>
            {child.health === undefined ? (
              <span className="hint">
                At the University's creche
                {state.housing.residents[child.motherId] !== undefined || child.motherId === config.nannyId ? ': there is no free cot' : ''}
              </span>
            ) : (
              <span className="hint">
                {healthName(config, child.health)} · ${config.babies.weeklyCost} a week
              </span>
            )}
          </div>
          {child.health !== undefined && (
            <span className="house-pips" role="img" aria-label={`${healthName(config, child.health)}: level ${child.health + 1} of ${config.babies.levels.length}`}>
              {config.babies.levels.map((_, level) => (
                <i key={level} className={level <= child.health! ? (child.health! < config.babies.startLevel ? 'on low' : 'on') : level > cap ? 'out' : undefined} />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
