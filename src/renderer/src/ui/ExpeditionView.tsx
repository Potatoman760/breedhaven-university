import { useState } from 'react'
import { act, comeUp, describeChange, describeFinds, fighterName, goOn, inForce, nodeAt, pregnancyPower, roleOf, runReport, spriteFor, toDate, turnActions, turnBack, turnOf, wornOutfit, type TurnAction } from '../../../shared/game'
import { HIM, type ContentPack, type Fighter, type GameState } from '../../../shared/model'
import { BelowFx, EVENT_GAP_MS } from '../fx/BelowFx'
import { Backdrop } from './Backdrop'
import { Button } from './Button'
import { StopIcon } from './icons'
import { ItemArt } from './ItemSquare'

interface Props {
  content: ContentPack
  state: GameState
  onChange: (state: GameState) => void
}

// What each kind of stop is, said when it is pointed at.
const STOPS: Record<string, string> = { fight: 'A fight', find: 'Something to find', checkpoint: 'A checkpoint: what you have found is made safe, and you rest', guardian: 'The guardian of the anchor' }

/** How full something is, as the width of a bar. */
const share = (now: number, max: number): string => `${Math.max(0, Math.min(100, max > 0 ? (now / max) * 100 : 0))}%`

/**
 * A run below, laid out as a fight is in an old console game: the party stands to the left and what they have met
 * to the right, as they are drawn everywhere else and with the face that fits what last happened to each; along the
 * bottom, a small plate of everyone's name and what they have left, and beside it what whoever's turn it is can do. What happens is said
 * in a line that comes up over the field, and what a stop or the run came to in a small dialog. No LLM is in it.
 */
export function ExpeditionView({ content, state, onChange }: Props) {
  const config = content.expedition!
  const run = state.expedition.run!
  const depth = config.depths[run.depth]
  const node = nodeAt(content, run)
  const fight = run.fight
  const report = runReport(content, state)
  const actor = turnOf(run)
  const fighting = fight !== undefined && !run.done && !run.over
  // The action he has picked that still wants pointing at something.
  const [pending, setPending] = useState<TurnAction | null>(null)
  const date = toDate(content.calendar, state.time)
  const sees = inForce(content, state, 'insight')

  // The face each of them has: what the last things that happened left her with, and down is down.
  const faces: Record<string, string> = {}
  for (const event of fight?.events ?? []) Object.assign(faces, event.faces)
  const women = run.party.filter((fighter) => fighter.id !== HIM)
  const foes = fight?.foes ?? []
  const events = fight?.events ?? []
  // Changes with every thing done, whether or not it drew a number: what was said and shown is played again only for something new.
  const stamp = `${run.node}:${fight?.round ?? 0}:${fight?.turn ?? 0}:${run.rolls}:${run.done}`

  /** Who an action may be pointed at among the party. */
  const allyFits = (action: TurnAction, fighter: Fighter): boolean =>
    fighter.footing > 0 && (action.aim === 'ally' || (fighter.id !== HIM && (action.aim === 'her' || (action.aim === 'pregnant' && fighter.surge > 0))))

  function choose(action: TurnAction) {
    if (!action.ready) return
    const targets = action.aim === 'foe' ? foes.filter((foe) => foe.footing > 0).map((foe) => foe.key) : action.aim ? run.party.filter((fighter) => allyFits(action, fighter)).map((fighter) => fighter.id) : []
    // With nothing to choose between, it is done at once.
    if (!action.aim || targets.length <= 1) return go(action, targets[0])
    setPending(action)
  }

  function go(action: TurnAction, target?: string) {
    setPending(null)
    onChange(act(content, state, { actionId: action.id, target }))
  }

  const status = (fighter: Fighter): string =>
    [
      fighter.footing <= 0 ? 'down' : '',
      fighter.guarding ? (fighter.taunting ? 'taunting' : 'defending') : '',
      fighter.anchored ? 'empowered' : '',
      fighter.covered ? 'protected' : '',
      fighter.hexed > 0 ? 'hexed' : ''
    ]
      .filter(Boolean)
      .join(', ')

  return (
    <main className="stage below">
      <Backdrop screen="below" location={content.locations.find((l) => l.id === config.entryLocationId)} periodId={date.period.id} light="night" room={depth.image ? { image: depth.image, key: `below-${run.depth}` } : undefined} />
      <div className="below-dim" />

      <div className="below-field">
        <div className="below-party">
          {women.map((fighter) => {
            const li = content.loveInterests.find((one) => one.id === fighter.id)
            const down = fighter.footing <= 0
            const sprite = li && spriteFor(li, wornOutfit(content, state, li), down ? 'sad' : (faces[fighter.id] ?? 'neutral'))
            const pick = pending !== null && allyFits(pending, fighter)
            return (
              <div key={fighter.id} data-fx={fighter.id} className={`below-figure${down ? ' down' : ''}${actor?.id === fighter.id && fighting ? ' acting' : ''}${pick ? ' pick' : ''}`} onClick={() => pick && pending && go(pending, fighter.id)}>
                {sprite && <img src={`content://pack/${sprite}`} alt={li?.name} style={li && li.stageHeight !== 100 ? { transform: `scale(${li.stageHeight / 100})`, transformOrigin: '50% 100%' } : undefined} />}
              </div>
            )
          })}
        </div>

        <div className="below-foes">
          {fight &&
            foes.map((foe) => {
              const enemy = config.enemies.find((one) => one.id === foe.enemyId)!
              const gone = foe.footing <= 0
              const pick = pending?.aim === 'foe' && !gone
              const notes = [foe.weakened > 0 && 'faltering', enemy.sweeps && 'sweeps', enemy.hexes && 'hexes', sees && enemy.weakTo && `weak to a ${config.roles.find((role) => role.id === enemy.weakTo)?.name.toLowerCase()}`].filter(Boolean)
              return (
                <div key={foe.key} data-fx={foe.key} className={`below-figure foe${gone ? ' down' : ''}${pick ? ' pick' : ''}`} onClick={() => pick && pending && go(pending, foe.key)}>
                  {enemy.image ? <img src={`content://pack/${enemy.image}`} alt="" /> : <span className="below-card">{enemy.name}</span>}
                  <span className="below-tag">
                    <strong>{enemy.name}</strong>
                    <span className="below-health">
                      <span style={{ width: share(foe.footing, foe.max) }} />
                      <b>
                        {Math.round(foe.footing)} / {foe.max}
                      </b>
                    </span>
                    {notes.length > 0 && <span className="below-small">{notes.join(' · ')}</span>}
                  </span>
                </div>
              )
            })}
        </div>

        {/* What just happened, said over the field and gone with the next thing done. */}
        {fighting && events.length > 0 && (
          <div key={stamp} className="below-toasts" aria-live="polite">
            {events.map((event, index) => (
              <p key={index} style={{ animationDelay: `${(index * EVENT_GAP_MS) / 1000}s` }}>
                {event.text}
              </p>
            ))}
          </div>
        )}
      </div>

      <section className="below-bottom">
        <div className="below-panels">
        <div className="below-status glass">
          {run.party.map((fighter) => {
            const pick = pending !== null && allyFits(pending, fighter)
            const carrying = fighter.id !== HIM && (pregnancyPower(content, state, fighter.id) ?? 1) > 1
            return (
              <div key={fighter.id} data-fx={fighter.id === HIM ? HIM : undefined} className={`below-row${actor?.id === fighter.id && fighting ? ' acting' : ''}${pick ? ' pick' : ''}${fighter.footing <= 0 ? ' down' : ''}`} onClick={() => pick && pending && go(pending, fighter.id)}>
                <span className="below-who">
                  <strong>{fighterName(content, state, fighter.id)}</strong>
                  <span className="below-small">{[fighter.id === HIM ? 'Sire' : roleOf(config, content.loveInterests.find((one) => one.id === fighter.id))?.name, status(fighter)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="below-gauges">
                  {/* What she has left, with whatever ward is up drawn on the end of it: the ward is everyone's, and is spent before any of them is hurt. */}
                  <span className="below-gauge" title={run.ward > 0 ? `Footing, and a ward that absorbs the next ${Math.round(run.ward)}` : 'Footing'}>
                    <span className="below-bar">
                      <span style={{ width: share(fighter.footing, fighter.max) }} />
                      {run.ward > 0 && fighter.footing > 0 && <i className="below-warded" style={{ width: share(Math.min(run.ward, fighter.max), fighter.max) }} />}
                    </span>
                    <span className="below-number">
                      {Math.round(fighter.footing)}/{fighter.max}
                      {run.ward > 0 && fighter.footing > 0 && <b className="below-ward"> +{Math.round(run.ward)}</b>}
                    </span>
                  </span>
                  {fighter.id === HIM && (
                    <span className="below-gauge" title="Energy: what Anchor and Ground are paid in">
                      <span className="below-bar energy"><span style={{ width: share(state.player.energy, state.player.maxEnergy) }} /></span>
                      <span className="below-number">
                        {state.player.energy}/{state.player.maxEnergy}
                      </span>
                    </span>
                  )}
                  {carrying && (
                    <span className="below-gauge" title="Her surge: ground it before it fills and breaks loose">
                      <span className="below-surge">
                        {Array.from({ length: config.surgeLimit }, (_, index) => (
                          <i key={index} className={index < fighter.surge ? 'on' : undefined} />
                        ))}
                      </span>
                      <span className="below-number">
                        {fighter.surge}/{config.surgeLimit}
                      </span>
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        {/* What whoever's turn it is can do; pointing at one says what it does. The panel is there even with nothing in it, so that the party always has something to stand behind. */}
        <div className="below-menu glass">
          {fighting && actor && (
            <>
            <span className="caps below-turn">{pending ? `${pending.name}: on whom?` : actor.id === HIM ? 'Your turn' : `${fighterName(content, state, actor.id)}'s turn`}</span>
            {pending ? (
              <Button variant="quiet" size="small" onClick={() => setPending(null)}>
                Back
              </Button>
            ) : (
              turnActions(content, state).map((action) => (
                <button key={action.id} className="below-command" title={action.description} disabled={!action.ready} onClick={() => choose(action)}>
                  <strong>
                    {action.id.startsWith('item:') && <ItemArt icon={content.items.find((item) => `item:${item.id}` === action.id)?.icon ?? 'gift'} image={content.items.find((item) => `item:${item.id}` === action.id)?.image} size={22} />} {action.name}
                  </strong>
                  {action.note && <span className="below-small">{action.note}</span>}
                </button>
              ))
            )}
            </>
          )}
        </div>
        </div>

        {/* Where he is on the way down, and what each stop of it is. */}
        <div className="below-way glass">
          <span className="below-where">
            <span className="caps">{config.name}</span>
            <strong>{depth.name}</strong>
          </span>
          <ol className="below-stops" aria-label={`Stop ${run.node + 1} of ${depth.nodes.length}`}>
            {depth.nodes.map((stop, index) => (
              <li key={index} className={index < run.node ? 'done' : index === run.node ? 'here' : undefined} title={STOPS[stop.kind]}>
                <StopIcon kind={stop.kind} size={30} />
              </li>
            ))}
          </ol>
          {!report && (
            <Button variant="quiet" size="small" title="Keeps only what was made safe at a checkpoint" onClick={() => onChange(turnBack(state))}>
              Turn back
            </Button>
          )}
        </div>
      </section>

      <BelowFx events={events} stamp={stamp} />

      {/* What a stop came to, and at the end what the run did: a small dialog over the field. */}
      {report ? (
        <div className="below-dialog glass" role="dialog">
          <h2>{report.outcome === 'won' ? 'The anchor holds' : report.outcome === 'lost' ? 'Carried back up' : 'Back up the stair'}</h2>
          <p>{run.note}</p>
          <p>You come up with {describeFinds(content, report.kept)}.</p>
          {Object.keys(report.kept.items).length > 0 && (
            <p className="below-haul">
              {Object.entries(report.kept.items).map(([id, count]) => {
                const item = content.items.find((one) => one.id === id)
                return (
                  <span key={id} title={item?.description}>
                    <ItemArt icon={item?.icon ?? 'gift'} image={item?.image} size={40} />
                    {item?.name ?? id}
                    {count > 1 && ` ×${count}`}
                  </span>
                )
              })}
            </p>
          )}
          {report.relic && (
            <p className="below-relic">
              <ItemArt icon={report.relic.icon} image={report.relic.image} size={72} />
              <span>
                <strong>{report.relic.name}</strong> ({describeChange(report.relic.modifier)}). {report.relic.description}
              </span>
            </p>
          )}
          {report.outcome === 'lost' && <p>You have nothing left in you for the day.</p>}
          <div className="actions end">
            <Button variant="primary" onClick={() => onChange(comeUp(content, state))}>
              Come up
            </Button>
          </div>
        </div>
      ) : (
        !fighting && (
          <div className="below-dialog glass" role="dialog">
            {fight ? events.slice(-2).map((event, index) => <p key={index}>{event.text}</p>) : <p>{run.note || node.name}</p>}
            <div className="actions end">
              <Button variant="primary" onClick={() => onChange(goOn(content, state))}>
                Go on
              </Button>
            </div>
          </div>
        )
      )}
    </main>
  )
}
