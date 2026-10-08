import { useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { attendees, describeBond, describeWhen, statusOf, dialogueLines, firstNames, sceneCast, formatTime, toDate, weatherOn, wornOutfit, lookOf, spriteFor, npcAsCharacter, playerRoom, roomOwner, sceneExtras, unreadNotes } from '../../../shared/game'
import { type ContentPack, type GameState, type LoveInterest, type Scene } from '../../../shared/model'
import logo from '../../../assets/logo.png'
import { Backdrop } from './Backdrop'
import {
  CalendarIcon,
  ChevronIcon,
  HideIcon,
  ItemIcon,
  LogIcon,
  PhoneIcon,
  MenuIcon,
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
  /** How many of his turns in this scene can be redone, counting back from the last. */
  turnsKept: number
  /** Says something else in place of what he said that many turns back: everything from that turn on is undone, and the scene goes on from the new line. */
  onRedo: (turnsBack: number, text: string) => void
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
  // line is hers, and she is gone when the player next speaks. Not so someone left behind when the
  // scene moved on: the picture is already of the new place, and she is not in it.
  const goingNow = scene.departed.filter((d) => d.at === scene.messages.length && !d.behind).map((d) => d.id)
  const cast = [...sceneCast(scene), ...goingNow]
    .map((id) => content.loveInterests.find((li) => li.id === id))
    .filter((li): li is LoveInterest => li !== undefined)
  const group = cast.length > 1
  // Those left behind in the reply on screen, by first name: they have a last line in it, and no place in the picture.
  const leftBehind = scene.departed
    .filter((d) => d.at === scene.messages.length && d.behind)
    .flatMap((d) => content.loveInterests.find((li) => li.id === d.id)?.name.split(' ')[0] ?? [])
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
  // An NSFW pose is shown over the background and the sprites while it is up.
  // It is one character's: the lead's, or in a group whoever it was named for. It covers everyone either way.
  const poser = cast.find((li) => li.id === scene.animationOf) ?? partner
  const animation = poser.animations.find((a) => a.id === scene.animationId)
  // What of it is shown: its clip when it has one that will play, and its picture otherwise.
  const media = animation && (animation.clip !== undefined && missing !== animation.clip ? animation.clip : animation.image)
  const playing = animation !== undefined && media !== undefined && missing !== media
  const beat = scene.beats[scene.beats.length - 1]

  // What the text box shows: the latest exchange, or the activity's description as
  // narration before anyone has spoken.
  const lastIndex = scene.messages.length - 1
  const last = scene.messages[lastIndex]
  // A reply is awaited after the player's line, and before anything has been said, while the scene is being opened.
  const waiting = busy && last?.role !== 'assistant'
  const reply = last?.role === 'assistant' ? last : undefined
  // What the player has just said, shown only until it is answered: once her reply is up, the box is hers.
  const playerLine = waiting ? last : undefined
  const narration =
    beat?.description ?? content.activities.find((a) => a.name === beat?.activityName)?.description

  // A reply is shown one beat at a time. `shown` is how far through it the player has
  // clicked, and `back` how many of his own turns back he is looking: none, for the latest
  // reply. Both start over whenever a new message arrives. Looking back changes nothing.
  const [progress, setProgress] = useState({ message: lastIndex, back: 0, shown: 0 })
  const current = progress.message === lastIndex
  // As far back as there are turns of his that can be redone.
  const maxBack = busy || !reply ? 0 : Math.min(props.turnsKept, scene.messages.filter((m) => m.role === 'user').length)
  const back = current ? Math.min(progress.back, maxBack) : 0
  // The reply being looked at: the latest, or the one that stood before the turn he has gone back to.
  const viewIndex = lastIndex - 2 * back
  const viewed = back === 0 ? reply : scene.messages[viewIndex]?.role === 'assistant' ? scene.messages[viewIndex] : undefined
  // Whoever speaks in a reply without being on stage: the teacher of a class, and for the latest reply anyone left behind in it, whose parting line is still hers.
  const voices = [...(scene.lesson ? [scene.lesson.speaker] : []), ...(back === 0 ? leftBehind : [])]
  const lines = viewed ? dialogueLines(viewed.content, group || extras.length > 0 || voices.length > 0 ? [...cast, ...extras] : [], voices) : []
  const shown = current ? Math.min(progress.shown, Math.max(0, lines.length - 1)) : 0
  const setShown = (next: number) => setProgress({ message: lastIndex, back, shown: next })
  // When the wheel last turned a beat, so that one turn of it is one beat.
  const turned = useRef(0)
  /** What he said after the reply that stands the given number of his turns back. */
  const saidAfter = (turnsBack: number): string => (turnsBack > 0 ? (scene.messages[lastIndex - 2 * turnsBack + 1]?.content ?? '') : '')
  const line = lines[shown]
  const more = shown < lines.length - 1
  /**
   * A beat back. Back past the first beat of a reply is the end of the reply before it,
   * where his turn was: his line is in the box again, to say differently. Nothing is
   * undone by looking. False when there is nowhere further back to go.
   */
  const stepBack = (): boolean => {
    if (shown > 0) setShown(shown - 1)
    else if (back < maxBack) {
      setProgress({ message: lastIndex, back: back + 1, shown: Number.MAX_SAFE_INTEGER })
      setInput(saidAfter(back + 1))
    } else return false
    return true
  }
  /** A beat on: through the reply, and from the end of one he has gone back to, on to the reply his line then got. */
  const stepOn = (): boolean => {
    if (more) setShown(shown + 1)
    else if (back > 0) {
      setProgress({ message: lastIndex, back: back - 1, shown: 0 })
      setInput(saidAfter(back - 1))
    } else return false
    return true
  }
  const speaker = [...cast, ...extras].find((li) => li.id === line?.speakerId)
  // An NPC who is about is seen only while a line of theirs is on screen: they step into view to say it, and out again.
  const extraSpeaking = extras.find((extra) => extra.id === speaker?.id)
  const onStage = extraSpeaking ? [...cast, extraSpeaking] : cast
  // Whose name is on the text box: whoever says the line on screen, or while a reply is awaited the one the
  // scene is with. Nobody, for narration, an action, or a group that has yet to answer.
  // A line said by someone with a voice and no place in the cast, such as the professor of a class: a name on the tab, and no face.
  const voice = waiting ? undefined : line?.speakerName
  const talking = waiting ? (group ? undefined : partner) : line && !line.action && !voice ? (speaker ?? partner) : undefined
  const weather = weatherOn(content, state)
  const owner = roomOwner(content, scene)
  // Or the player's own room.
  const his = playerRoom(content, scene)
  // Where the scene is, in a word or two: someone's room is hers and no more, without the building it is in.
  const placeName = his ? 'Your room' : owner ? `${owner.name.split(' ')[0]}'s room` : (beat?.locationName ?? location?.name)

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    // Said from a turn he has gone back to, it takes the place of what he said then, and of all that came of it.
    if (back > 0) {
      // He is no longer looking back: what comes next is the reply to the new line, from its first beat. (The
      // conversation is as long after a turn is redone as it was before, so nothing else would say so.)
      setProgress({ message: lastIndex, back: 0, shown: 0 })
      props.onRedo(back, text)
    } else onSend(text)
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
        room={his ? { image: his.background, key: 'room-of-player' } : owner && { image: owner.room?.background, key: `room-of-${owner.id}` }}
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

      {/*
        An NSFW pose is a layer of its own, over the background and everyone standing in it: she goes on
        wearing what she wears and looking as she looks underneath, and is there again when it is taken down.
      */}
      {playing &&
        (media !== animation.clip ? (
          // A picture stays up until the LLM takes it down.
          <img key={media} className="scene-video" src={`content://pack/${media}`} alt={animation.name} onError={() => setMissing(media)} />
        ) : (
          <video
            key={media}
            className="scene-video"
            src={`content://pack/${media}`}
            aria-label={animation.name}
            autoPlay
            loop={animation.loop}
            muted
            playsInline
            onEnded={props.onAnimationEnd}
            onError={() => setMissing(media)}
          />
        ))}

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
              {formatTime(date)}
              <WeatherIcon kind={weather?.icon} size={20} />
            </div>
            {/* Where the scene is, and the class it is when it is one. */}
            {placeName && (
              <>
                <hr />
                <div className="badge-place">{placeName}</div>
              </>
            )}
            {/* Only while the scene is still in the classroom it began in. */}
            {scene.lesson && scene.beats.length === 1 && <div className="caps badge-class">{scene.lesson.course}</div>}
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
            {voice && (
              <div className="speaker-tab faceless">
                <span className="speaker-name">{voice}</span>
              </div>
            )}
          {/*
            A reply is read a beat at a time. Over the box, a click, the wheel turned down, Space, Enter or the right
            arrow turns to the next beat; the wheel turned up or the left arrow turns back to the one before, and on
            back to the turns before this one. Looking back undoes nothing: only saying something new there does.
          */}
          <div
            className={more ? 'textbox glass framed turning' : 'textbox glass framed'}
            onWheel={(event) => {
              // One beat for each turn of the wheel, however many events a turn sends.
              if (event.timeStamp - turned.current < 180) return
              if (event.deltaY === 0 || !(event.deltaY < 0 ? stepBack() : stepOn())) return
              turned.current = event.timeStamp
            }}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              // In the line he is typing, the keys are his: only an empty one gives the left arrow up.
              const typing = event.target instanceof HTMLInputElement && event.target.value !== ''
              if (event.key === 'ArrowLeft' && !typing) {
                if (stepBack()) event.preventDefault()
              } else if (more && ['Enter', ' ', 'ArrowRight'].includes(event.key)) {
                event.preventDefault()
                setShown(shown + 1)
              } else if (event.key === 'ArrowRight' && back > 0 && !typing) {
                if (stepOn()) event.preventDefault()
              }
            }}
            {...(more
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': 'Next',
                  autoFocus: true,
                  ref: (box: HTMLDivElement | null) => box?.focus(),
                  onClick: () => setShown(shown + 1)
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
              <div className="speech" role="status">
                <p className="thinking">Thinking</p>
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
            {!waiting && back === 0 && props.rolls.map((roll, i) => (
              <p key={i} className="roll">
                Dice · {roll}
              </p>
            ))}
            {!waiting && !more && back === 0 && props.learned.map((line) => (
              <p key={line} className="agreed">
                Learned: {line}
              </p>
            ))}
            {props.agreed && <p className="agreed">{props.agreed}</p>}
            {!more && !waiting && back === 0 && scene.bondProposal && (
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
            {!more && !waiting && back === 0 && scene.proposal && (
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
            ) : ended && back === 0 ? (
              <button className="continue-scene" disabled={busy} onClick={onContinue} autoFocus>
                {busy ? 'Remembering...' : 'Continue'}
                <ChevronIcon size={16} />
              </button>
            ) : (
              <form onSubmit={submit} className={back > 0 ? 'looking-back' : undefined}>
                {back > 0 && (
                  <span className="hint look-back">
                    {back === 1 ? 'Your last turn' : `${back} turns back`}. Send a line to redo the scene from here, or scroll down to return.
                  </span>
                )}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Your reply"
                  placeholder={back > 0 ? 'Say something else here to redo the scene from this point' : `Say something to ${together}, or say goodbye to end the scene`}
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
              <PhoneIcon size={28} />
              {unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
            </button>
            <button className="tile glass" aria-label="Calendar" onClick={() => onOpen({ kind: 'calendar' })}>
              <CalendarIcon size={28} />
            </button>
            <button className="tile glass" aria-label="Menu" title="Menu (Esc)" onClick={() => onOpen({ kind: 'menu' })}>
              <MenuIcon size={26} />
            </button>
          </div>
        </>
      )}
      {/* While the scene's opening is being written there is nothing to read yet: the logo stands over it, and goes when the first line is in. */}
      {busy && scene.messages.length === 0 && (
        <div className="scene-loading" role="status" aria-label="Loading">
          <img src={logo} alt="" />
          <p>Loading</p>
        </div>
      )}
    </main>
  )
}
