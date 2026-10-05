import { useState, type FormEvent } from 'react'
import { attendees, describeBond, describeWhen, statusOf, dialogueLines, firstNames, sceneCast, toDate, weatherOn } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest, Scene } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import {
  BackgroundIcon,
  CalendarIcon,
  CharacterIcon,
  ChevronIcon,
  HideIcon,
  ItemIcon,
  LogIcon,
  NoticeBoardIcon,
  SettingsIcon,
  WeatherIcon
} from './icons'
import type { Panel } from './panels'

interface Props {
  content: ContentPack
  state: GameState
  scene: Scene
  /** The view of the current location the player picked, if any. */
  backgroundId: string | undefined
  busy: boolean
  notice: string
  /** The character has closed the scene; all that is left is to move on. */
  ended: boolean
  onSend: (text: string) => void
  /** Move on from a scene that has ended, to its summary. */
  onContinue: () => void
  /** Put the plan the love interest suggested on the calendar. */
  onAcceptProposal: () => void
  onDeclineProposal: () => void
  /** Answer a change to the relationship that the love interest has asked for. */
  onAnswerBond: (accept: boolean) => void
  /** Confirmation of a plan just accepted. */
  agreed: string
  onOpen: (panel: Panel) => void
}

/** Renders *asterisked* runs inside a spoken line as emphasis. */
function emphasise(text: string) {
  return text
    .split(/(\*[^*]+\*)/)
    .map((part, i) => (/^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : part))
}

/** A character's default look: what everyone but a lone love interest is shown in. */
function defaultSprite(li: LoveInterest): string | undefined {
  const outfit = li.outfits.find((o) => o.id === li.defaultOutfitId)
  return (outfit?.sprites['neutral'] ?? Object.values(outfit?.sprites ?? {})[0])?.image
}

/** A scene with a love interest, or up to three: background, sprites, and the text box. */
export function SceneView(props: Props) {
  const { content, state, scene, busy, notice, ended, onSend, onContinue, onOpen } = props
  const [input, setInput] = useState('')
  const [hidden, setHidden] = useState(false)
  // The sprite or video file that last failed to load, so it isn't retried every render.
  const [missing, setMissing] = useState<string | null>(null)

  const date = toDate(content.calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const partner = content.loveInterests.find((li) => li.id === scene.loveInterestId)!
  // In a group everyone stands side by side and each line carries its speaker's name.
  const cast = sceneCast(scene)
    .map((id) => content.loveInterests.find((li) => li.id === id))
    .filter((li): li is LoveInterest => li !== undefined)
  const group = cast.length > 1
  const together = firstNames(content, sceneCast(scene))
  // The look the LLM last chose, falling back to the default outfit's neutral sprite.
  const outfit = partner.outfits.find((o) => o.id === (scene.outfitId ?? partner.defaultOutfitId))
  const sprite = (
    outfit?.sprites[scene.expression ?? 'neutral'] ??
    outfit?.sprites['neutral'] ??
    Object.values(outfit?.sprites ?? {})[0]
  )?.image
  // An animation takes the sprite's place while it plays.
  const animation = partner.animations.find((a) => a.id === scene.animationId)
  const playing = !group && animation !== undefined && missing !== animation.video
  const beat = scene.beats[scene.beats.length - 1]

  // What the text box shows: the latest exchange, or the activity's description as
  // narration before anyone has spoken.
  const lastIndex = scene.messages.length - 1
  const last = scene.messages[lastIndex]
  const waiting = busy && last?.role === 'user'
  const reply = last?.role === 'assistant' ? last : undefined
  const playerLine = waiting ? last : reply ? scene.messages[lastIndex - 1] : undefined
  const narration =
    beat?.description ?? content.activities.find((a) => a.name === beat?.activityName)?.description

  // A reply is shown one beat at a time. `shown` is how far through the current one the
  // player has clicked; it starts over whenever a new message arrives.
  const lines = reply ? dialogueLines(reply.content, group ? cast : []) : []
  const [progress, setProgress] = useState({ message: lastIndex, shown: 0 })
  const shown = progress.message === lastIndex ? Math.min(progress.shown, Math.max(0, lines.length - 1)) : 0
  const setShown = (next: number) => setProgress({ message: lastIndex, shown: next })
  const line = lines[shown]
  const more = shown < lines.length - 1
  const speaker = cast.find((li) => li.id === line?.speakerId)
  // Whose name is on the text box: the line's speaker, or the one the scene is with.
  const firstName = (speaker ?? partner).name.split(' ')[0]
  const leadName = partner.name.split(' ')[0]
  const weather = weatherOn(content, state)

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    onSend(text)
  }


  return (
    <main className="stage">
      <Backdrop location={location} periodId={date.period.id} backgroundId={props.backgroundId} />
      {group ? (
        <div className="cast">
          {cast.map((li) => {
            const image = defaultSprite(li)
            return (
              image && (
                <img
                  key={li.id}
                  className={speaker && speaker.id !== li.id && !line?.action ? 'listening' : undefined}
                  src={`content://pack/${image}`}
                  alt={li.name}
                />
              )
            )
          })}
        </div>
      ) : playing ? (
        <video
          key={animation.video}
          className="scene-video"
          src={`content://pack/${animation.video}`}
          aria-label={animation.name}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setMissing(animation.video)}
        />
      ) : sprite && missing !== sprite ? (
        <img
          className="sprite-art"
          src={`content://pack/${sprite}`}
          alt={partner.name}
          onError={() => setMissing(sprite)}
        />
      ) : (
        <div className="sprite">
          {sprite ?? `No sprite set for ${partner.name}`}
          <span>{sprite ? 'Sprite file not found' : 'Add one to the character file'}</span>
        </div>
      )}

      {hidden ? (
        <button className="unhide" aria-label="Show the interface" onClick={() => setHidden(false)} />
      ) : (
        <>
          <div className="date-badge">
            <div className="caps">Day</div>
            <div className="badge-day">{date.dayIndex + 1}</div>
            <hr />
            <div className="badge-date">
              {date.day} {date.month.name}
            </div>
            <div className="caps">{date.weekday}</div>
            <div className="caps badge-period" title={weather?.name}>
              {date.period.name}
              <WeatherIcon kind={weather?.icon} size={20} />
            </div>
          </div>

          <div className="textbox glass framed">
            {notice && (
              <div className="notice">
                {notice}
                {/* The way out when the AI can't be reached to end the scene itself. */}
                <button className="quiet" disabled={busy} onClick={onContinue}>
                  End the scene here
                </button>
              </div>
            )}
            {playerLine && (
              <div className="player-line">
                <strong>{state.player.name}</strong> · {playerLine.content}
              </div>
            )}
            {waiting ? (
              <div className="speech">
                <span className="nameplate">{group ? '…' : leadName}</span>
                <p>…</p>
              </div>
            ) : line?.action ? (
              <p className="narration action">{line.text}</p>
            ) : line ? (
              <div className="speech">
                <span className="nameplate">{firstName}</span>
                <p>{emphasise(line.text)}</p>
              </div>
            ) : (
              <p className="narration">{narration || `You and ${together} have a moment together.`}</p>
            )}
            {props.agreed && <p className="agreed">{props.agreed}</p>}
            {!more && !waiting && scene.bondProposal && (
              <div className="proposal">
                <div>
                  <span className="caps">{firstNames(content, [scene.bondProposal.memberIds[0]])} asks</span>
                  <strong>{describeBond(content, scene.bondProposal)}</strong>
                  <span>{statusOf(content, scene.bondProposal)?.description}</span>
                </div>
                <button disabled={busy} onClick={() => props.onAnswerBond(true)}>
                  Yes
                </button>
                <button className="secondary" disabled={busy} onClick={() => props.onAnswerBond(false)}>
                  Not now
                </button>
              </div>
            )}
            {!more && !waiting && scene.proposal && (
              <div className="proposal">
                <div>
                  <span className="caps">{firstNames(content, [scene.proposal.loveInterestId])} suggests</span>
                  <strong>
                    {scene.proposal.title}
                    {scene.proposal.companionIds.length > 0 &&
                      ` with ${firstNames(content, attendees(scene.proposal))}`}
                  </strong>
                  <span>
                    {describeWhen(content, scene.proposal.time)} ·{' '}
                    {content.locations.find((l) => l.id === scene.proposal?.locationId)?.name}
                  </span>
                </div>
                <button disabled={busy} onClick={props.onAcceptProposal}>
                  Accept
                </button>
                <button className="secondary" disabled={busy} onClick={props.onDeclineProposal}>
                  Not now
                </button>
              </div>
            )}
            {more ? (
              // The reply is read a beat at a time; the player's turn comes after the last one.
              <button className="continue-scene" onClick={() => setShown(shown + 1)} autoFocus>
                <span className="hint">
                  {shown + 1} / {lines.length}
                </span>
                Next
                <ChevronIcon size={16} />
              </button>
            ) : ended ? (
              <button className="continue-scene" disabled={busy} onClick={onContinue} autoFocus>
                {busy ? 'Remembering...' : 'Continue'}
                <ChevronIcon size={16} />
              </button>
            ) : (
              <form onSubmit={submit}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Your reply"
                  placeholder={`Say something to ${together}, or say goodbye to end the scene`}
                  autoFocus
                />
                <button type="submit" disabled={busy} aria-label="Send" className="icon">
                  <ChevronIcon size={18} />
                </button>
              </form>
            )}
          </div>

          <div className="scene-utils">
            <button className="util glass" onClick={() => onOpen({ kind: 'log' })}>
              <LogIcon size={18} />
              Log
            </button>
            <button className="util glass" onClick={() => setHidden(true)}>
              <HideIcon size={18} />
              Hide
            </button>
            <button className="util glass" onClick={() => onOpen({ kind: 'char', id: partner.id })}>
              <CharacterIcon size={18} />
              Char
            </button>
            <button className="util glass" disabled={busy || ended} onClick={() => onOpen({ kind: 'gifts' })}>
              <ItemIcon name="gift" size={18} />
              Gift
            </button>
            <button className="util glass" onClick={() => onOpen({ kind: 'backgrounds' })}>
              <BackgroundIcon size={18} />
              BG
            </button>
          </div>

          <div className="scene-tiles">
            <button
              className="tile glass"
              aria-label="Courier"
              onClick={() => onOpen({ kind: 'courier' })}
            >
              <NoticeBoardIcon size={28} />
            </button>
            <button className="tile glass" aria-label="Calendar" onClick={() => onOpen({ kind: 'calendar' })}>
              <CalendarIcon size={28} />
            </button>
            <button className="tile glass" aria-label="Settings" onClick={() => onOpen({ kind: 'settings' })}>
              <SettingsIcon size={26} />
            </button>
          </div>
        </>
      )}
    </main>
  )
}
