import { useState, type FormEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { attendees, describeBond, describeWhen, statusOf, dialogueLines, firstNames, sceneCast, toDate, weatherOn, wornOutfit, lookOf, spriteFor, npcAsCharacter, roomOwner, sceneExtras } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest, Scene } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import {
  CalendarIcon,
  ChevronIcon,
  HideIcon,
  ItemIcon,
  LogIcon,
  ChatIcon,
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
  /** What the reply on screen let the player find out about someone. */
  learned: string[]
  /** Dice rolled for the reply on screen. */
  rolls: string[]
  onOpen: (panel: Panel) => void
  /** An animation that plays once has played: the sprite takes its place again. */
  onAnimationEnd: () => void
}

/** Renders *asterisked* runs inside a spoken line as emphasis. */
function emphasise(text: string) {
  return text
    .split(/(\*[^*]+\*)/)
    .map((part, i) => (/^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : part))
}

/** A character's look when nothing else has been chosen: what everyone in a group is shown in. */
function defaultSprite(content: ContentPack, state: GameState, li: LoveInterest): string | undefined {
  return spriteFor(li, wornOutfit(content, state, li), undefined)
}

/**
 * How a character's picture is sized on stage: at her own height, scaled from the floor up
 * so that she stands level with the others. Nothing for someone of full height.
 */
function standing(li: Pick<LoveInterest, 'stageHeight'>, before = ''): CSSProperties | undefined {
  return li.stageHeight === 100 ? undefined : { transform: `${before}scale(${li.stageHeight / 100})`, transformOrigin: '50% 100%' }
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
  // Someone who leaves in the reply on screen is still there while it is read: her parting
  // line is hers, and she is gone when the player next speaks.
  const goingNow = scene.departed.filter((d) => d.at === scene.messages.length).map((d) => d.id)
  const cast = [...sceneCast(scene), ...goingNow]
    .map((id) => content.loveInterests.find((li) => li.id === id))
    .filter((li): li is LoveInterest => li !== undefined)
  const group = cast.length > 1
  // NPCs who are about. One steps into view while a line of theirs is on screen.
  const extras = sceneExtras(content, state, scene).map(npcAsCharacter)
  const together = firstNames(content, sceneCast(scene))
  // The look the LLM last chose, falling back to the default outfit's neutral sprite.
  const outfit = wornOutfit(content, state, partner, scene.outfitId)
  const sprite = spriteFor(partner, outfit, scene.expression)
  /** The picture of anyone on stage: the face and outfit the LLM last gave her, or failing that how she came. */
  const spriteOf = (li: LoveInterest): string | undefined => {
    if (li.id === partner.id) return sprite
    if (!sceneCast(scene).includes(li.id)) return defaultSprite(content, state, li)
    const look = lookOf(scene, li.id)
    return spriteFor(li, wornOutfit(content, state, li, look.outfitId), look.expression)
  }
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
  // What the player has just said, shown only until it is answered: once her reply is up, the box is hers.
  const playerLine = waiting ? last : undefined
  const narration =
    beat?.description ?? content.activities.find((a) => a.name === beat?.activityName)?.description

  // A reply is shown one beat at a time. `shown` is how far through the current one the
  // player has clicked; it starts over whenever a new message arrives.
  const lines = reply ? dialogueLines(reply.content, group || extras.length > 0 ? [...cast, ...extras] : []) : []
  const [progress, setProgress] = useState({ message: lastIndex, shown: 0 })
  const shown = progress.message === lastIndex ? Math.min(progress.shown, Math.max(0, lines.length - 1)) : 0
  const setShown = (next: number) => setProgress({ message: lastIndex, shown: next })
  const line = lines[shown]
  const more = shown < lines.length - 1
  const speaker = [...cast, ...extras].find((li) => li.id === line?.speakerId)
  const extraSpeaking = extras.find((extra) => extra.id === speaker?.id)
  const onStage = extraSpeaking ? [...cast, extraSpeaking] : cast
  // Whose name is on the text box: whoever says the line on screen, or while a reply is awaited the one the
  // scene is with. Nobody, for narration, an action, or a group that has yet to answer.
  const talking = waiting ? (group ? undefined : partner) : line && !line.action ? (speaker ?? partner) : undefined
  const weather = weatherOn(content, state)
  const owner = roomOwner(content, scene)

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    onSend(text)
  }


  return (
    // A right click anywhere hides the interface to look at the picture, and another brings it back.
    <main
      className="stage"
      onContextMenu={(event) => {
        event.preventDefault()
        setHidden(!hidden)
      }}
    >
      <Backdrop
        screen="scene"
        room={owner && { image: owner.room?.background, key: `room-of-${owner.id}` }}
        weather={weather?.effect}
        location={location} periodId={date.period.id} light={date.period.light} backgroundId={props.backgroundId} />
      {group || extraSpeaking ? (
        <div className="cast">
          {onStage.map((li) => {
            const image = spriteOf(li)
            return (
              image && (
                <img
                  key={li.id}
                  className={speaker && speaker.id !== li.id && !line?.action ? 'listening' : undefined}
                  src={`content://pack/${image}`}
                  alt={li.name}
                  style={standing(li)}
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
          loop={animation.loop}
          muted
          playsInline
          onEnded={props.onAnimationEnd}
          onError={() => setMissing(animation.video)}
        />
      ) : sprite && missing !== sprite ? (
        <img
          className="sprite-art"
          src={`content://pack/${sprite}`}
          alt={partner.name}
          style={standing(partner, 'translateX(-50%) ')}
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

          <div className="textbox-wrap">
            {/* Whoever is speaking, on a tab that stands on the box's top edge. Narration has no speaker, and no tab. */}
            {talking && (
              <div className="speaker-tab">
                <span
                  className="speaker-face"
                  role="img"
                  aria-label={talking.name}
                  style={
                    spriteOf(talking)
                      ? { backgroundImage: `url("content://pack/${spriteOf(talking)}")`, backgroundPosition: `50% ${talking.faceY}%` }
                      : undefined
                  }
                />
                <span className="speaker-name">{talking.name.split(' ')[0]}</span>
              </div>
            )}
          {/* While there is more of a reply to read, a click anywhere in the box, or Enter or Space, turns to the next beat. */}
          <div
            className={more ? 'textbox glass framed turning' : 'textbox glass framed'}
            {...(more
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': 'Next',
                  autoFocus: true,
                  ref: (box: HTMLDivElement | null) => box?.focus(),
                  onClick: () => setShown(shown + 1),
                  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setShown(shown + 1)
                  }
                }
              : {})}
          >
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
                <p>…</p>
              </div>
            ) : line?.action ? (
              <p className="narration action">{line.text}</p>
            ) : line ? (
              <div className="speech">
                <p>{emphasise(line.text)}</p>
              </div>
            ) : (
              <p className="narration">{narration || `You and ${together} have a moment together.`}</p>
            )}
            {!waiting && props.rolls.map((roll, i) => (
              <p key={i} className="roll">
                Dice · {roll}
              </p>
            ))}
            {!waiting && !more && props.learned.map((line) => (
              <p key={line} className="agreed">
                Learned: {line}
              </p>
            ))}
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
              <span className="turn-mark" aria-hidden="true">
                {shown + 1} / {lines.length}
                <ChevronIcon size={14} />
              </span>
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
            <button className="util glass" disabled={busy || ended || scene.npc} onClick={() => onOpen({ kind: 'gifts' })}>
              <ItemIcon name="gift" size={18} />
              Gift
            </button>
          </div>

          <div className="scene-tiles">
            <button
              className="tile glass"
              aria-label="Phone"
              onClick={() => onOpen({ kind: 'courier', id: scene.npc ? undefined : partner.id })}
            >
              <ChatIcon size={28} />
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
