import { useState } from 'react'
import {
  arrearsDeadline,
  askToLeave,
  babiesAtHome,
  buildRoom,
  builtTier,
  canBuild,
  canInvite,
  freeBeds,
  goHome,
  goToRoom,
  healthCap,
  healthName,
  houseComfort,
  householdCost,
  houseTotals,
  invitable,
  invite,
  nextRentDay,
  nextWork,
  payArrears,
  pregnancyOf,
  toDate,
  viewImage
} from '../../../shared/game'
import type { ContentPack, GameState, HouseRoom, HousingConfig } from '../../../shared/model'
import { useConfirm } from './Confirm'
import { Dialog } from './Dialog'
import { Portrait } from './MapPanel'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
}

const TABS = ['Plan', 'Household', 'Ledger'] as const
type Tab = (typeof TABS)[number]

/** What a room, or a fitting-out of one, adds to the house, in a few words. Nothing for one that adds nothing that is counted. */
function effectsOf(part: { beds: number; cots: number; comfort: number; study: number }): string {
  return [
    part.beds > 0 && `${part.beds} bed${part.beds === 1 ? '' : 's'} for someone to live here`,
    part.cots > 0 && `${part.cots} cot${part.cots === 1 ? '' : 's'}`,
    part.comfort > 0 && `comfort +${part.comfort}`,
    part.study > 0 && `study at home +${part.study}`
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The house the Sire Relations Office lets him: a plan of it, drawn from its rooms, with what each is and what can be
 * made of it; who lives in it and how the children do; and its accounts. It is opened from the day, never in the
 * middle of a scene, since building and taking people in change where a scene could go.
 */
export function HousePanel({ content, state, onChange, onClose }: Props) {
  const config = content.housing
  const [tab, setTab] = useState<Tab>('Plan')
  const [picked, setPicked] = useState<string | undefined>(state.housing.room)
  const { ask, dialog } = useConfirm()
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
  const dayLabel = (dayIndex: number) => {
    const date = toDate(calendar, dayIndex * calendar.hoursPerDay)
    return `${date.weekday} ${date.day} ${date.month.name}`
  }
  const firstOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const totals = houseTotals(config, state)
  const residents = Object.entries(state.housing.residents)
  const babies = babiesAtHome(state)
  const rentDay = nextRentDay(content, state)
  const deadline = arrearsDeadline(content, state)
  const cap = healthCap(config, state)
  const atHome = state.locationId === config.locationId
  const room = config.rooms.find((r) => r.key === picked) ?? config.rooms[0]

  /** Who is to be found in a room: whoever lives in it. */
  const occupants = (r: HouseRoom): string[] => [
    ...(r.role === 'master' ? ['You'] : []),
    ...(r.role === 'nanny' ? [firstOf(config.nannyId)] : []),
    ...residents.filter(([, key]) => key === r.key).map(([id]) => firstOf(id))
  ]

  return (
    <Dialog title={config.name} note={atHome ? 'You are at home' : undefined} onClose={onClose} wide>
      {dialog}
      <div className="house">
        <div className="chips house-head">
          {deadline !== undefined ? (
            <>
              <span className="chip madder">
                Rent owing: ${state.housing.arrears} · by {dayLabel(deadline)}
              </span>
              <button disabled={state.player.money < state.housing.arrears} title={state.player.money < state.housing.arrears ? `You have $${state.player.money}` : undefined} onClick={() => onChange((s) => payArrears(content, s))}>
                Pay ${state.housing.arrears}
              </button>
            </>
          ) : (
            <span className="chip">{rentDay === undefined ? 'No more rent this year' : `Rent $${config.rent} · due ${dayLabel(rentDay)}`}</span>
          )}
          <span className="chip">
            Beds {residents.length} / {totals.beds}
          </span>
          <span className="chip">
            Cots {babies.length} / {totals.cots}
          </span>
          <span className="chip">Children's week ${householdCost(content, state)}</span>
          <span className="chip" title="How well the house looks after those in it. It sets how well a child can come to do here.">
            Comfort {houseComfort(config, state)} · children can reach {healthName(config, cap).toLowerCase()}
          </span>
          <span className="chip">You have ${state.player.money}</span>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
          {!atHome && (
            <button
              className="secondary house-go"
              onClick={() => {
                onChange((s) => goHome(content, s))
                onClose()
              }}
            >
              Go home
            </button>
          )}
        </div>

        {tab === 'Plan' && (
          <div className="house-plan">
            <div className="house-floors">
              {/* The top of the house first, as a house is looked at. */}
              {config.floors
                .map((name, floor) => ({ name, floor }))
                .reverse()
                .map(({ name, floor }) => (
                  <div key={name} className="house-floor-block">
                    <span className="caps">{name}</span>
                    <div className="house-floor" style={{ gridTemplateColumns: `repeat(${config.grid.columns}, 1fr)` }}>
                      {config.rooms
                        .filter((r) => r.plan.floor === floor)
                        .map((r) => {
                          const tier = builtTier(state, r.key)
                          const here = occupants(r)
                          return (
                            <button
                              key={r.key}
                              type="button"
                              className={['house-cell', tier < 1 && 'unbuilt', r.plan.outdoors && 'outdoors', room.key === r.key && 'selected'].filter(Boolean).join(' ')}
                              style={{ gridColumn: `${r.plan.x + 1} / span ${r.plan.w}`, gridRow: `${r.plan.y + 1} / span ${r.plan.h}` }}
                              onClick={() => setPicked(r.key)}
                            >
                              <strong>{r.name}</strong>
                              <span>{tier < 1 ? `Not built · $${r.cost}` : here.length > 0 ? here.join(', ') : tier > 1 ? r.tiers[tier - 2]?.name : ''}</span>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                ))}
            </div>

            <RoomCard
              content={content}
              state={state}
              config={config}
              room={room}
              image={viewImage(house?.backgrounds.find((view) => view.id === room.viewId), light)}
              occupants={occupants(room)}
              atHome={atHome}
              onChange={onChange}
              onClose={onClose}
            />
          </div>
        )}

        {tab === 'Household' && (
          <div className="house-people">
            <h2>Who lives here</h2>
            <div className="card house-person">
              {content.loveInterests.filter((li) => li.id === config.nannyId).map((li) => <Portrait key={li.id} li={li} />)}
              <div>
                <strong>{content.loveInterests.find((li) => li.id === config.nannyId)?.name}</strong>
                <span className="hint">The nanny, employed by the Sire Relations Office. She comes with the house.</span>
              </div>
            </div>
            {residents.length === 0 && <p className="hint">Nobody else yet. Someone carrying your child, or the mother of one, can be offered a bedroom from the plan.</p>}
            {residents.map(([id, key]) => {
              const li = content.loveInterests.find((c) => c.id === id)
              if (!li) return null
              return (
                <div key={id} className="card house-person">
                  <Portrait li={li} />
                  <div>
                    <strong>{li.name}</strong>
                    <span className="hint">
                      {config.rooms.find((r) => r.key === key)?.name}
                      {pregnancyOf(state, id) ? ' · pregnant' : ''}
                    </span>
                  </div>
                  <button
                    className="secondary"
                    onClick={async () =>
                      (await ask({ title: `Ask ${firstOf(id)} to leave?`, detail: 'She will take her children back to the creche, will think the less of you for it, and will not come back.', confirm: 'Ask her to leave', cancel: 'Let her stay', grave: true })) &&
                      onChange((s) => askToLeave(content, s, id))
                    }
                  >
                    Ask to leave
                  </button>
                </div>
              )
            })}

            <h2>The children</h2>
            {state.children.length === 0 && <p className="hint">None yet.</p>}
            {state.children.map((child, i) => {
              const whose = `${firstOf(child.motherId)}'s ${child.daughter ? 'daughter' : 'son'}`
              return (
                <div key={i} className="card house-person">
                  <div>
                    <strong>{whose}</strong>
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
              )
            })}
            {babies.length > 0 && (
              <p className="hint">
                Each child in the house costs ${config.babies.weeklyCost} on the first day of the week. Paid for, it does a little better each week, as far as the comfort of the house allows. Not paid for, it does worse, and
                its mother will not stay to watch.
              </p>
            )}
          </div>
        )}

        {tab === 'Ledger' && (
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
        )}
      </div>
    </Dialog>
  )
}

interface RoomCardProps {
  content: ContentPack
  state: GameState
  config: HousingConfig
  room: HouseRoom
  image: string | undefined
  occupants: string[]
  atHome: boolean
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
}

/** The room picked on the plan: its picture, what it is, who is in it, and what can be done with it. */
function RoomCard({ content, state, config, room, image, occupants, atHome, onChange, onClose }: RoomCardProps) {
  const tier = builtTier(state, room.key)
  const work = nextWork(config, state, room.key)
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
  return (
    <aside className="house-room card">
      {image ? <img src={`content://pack/${image}`} alt={room.name} /> : <div className="house-room-blank">{tier < 1 ? 'Not built' : 'No picture yet'}</div>}
      <h2>{room.name}</h2>
      <p>{[room.description, ...made.map((t) => t.description)].filter(Boolean).join(' ')}</p>
      {effectsOf(room) && <span className="caps">{effectsOf(room)}</span>}
      {made.map((t) => (
        <span key={t.name} className="chip">
          {t.name}
          {effectsOf(t) ? ` · ${effectsOf(t)}` : ''}
        </span>
      ))}
      {tier > 0 && occupants.length > 0 && <span className="hint">Here: {occupants.join(', ')}</span>}

      {work && (
        <div className="house-work">
          <button disabled={!check.ok} title={check.reasons.join(' · ')} onClick={() => onChange((s) => buildRoom(content, s, room.key))}>
            {work.upgrade ? `${work.name} · $${work.cost}` : `Build · $${work.cost}`}
          </button>
          {work.upgrade && <span className="hint">{[work.description, effectsOf(room.tiers[tier - 1] ?? { beds: 0, cots: 0, comfort: 0, study: 0 })].filter(Boolean).join(' ')}</span>}
          {!check.ok && <span className="hint">{check.reasons.join(' · ')}</span>}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="house-work">
          <span className="caps">Offer this room to</span>
          {candidates.map((li) => (
            <button key={li.id} className="secondary" onClick={() => onChange((s) => invite(content, s, li.id, room.key))}>
              {li.name}
            </button>
          ))}
        </div>
      )}
      {waiting.map(({ li, check }) => (
        <span key={li.id} className="hint">
          {li.name.split(' ')[0]}: {check.reasons.join(' · ')}
        </span>
      ))}

      {tier > 0 && (!atHome || state.housing.room !== room.key) && (
        <button
          className="secondary"
          onClick={() => {
            onChange((s) => goToRoom(content, s, room.key))
            onClose()
          }}
        >
          Go to this room
        </button>
      )}
    </aside>
  )
}
