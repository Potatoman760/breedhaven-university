import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptBond,
  acceptProposal,
  attendees,
  addMemory,
  addNote,
  courierRound,
  courierRoundDue,
  applyLook,
  describeBond,
  describeWhen,
  growTies,
  keepAppointment,
  attend,
  buy,
  classmates,
  canTravel,
  carried,
  giveGift,
  isOpen,
  loveInterestsAt,
  perform,
  reconcileState,
  sceneBaseline,
  sceneCast,
  firstNames,
  sceneOutcome,
  startOuting,
  type Outing,
  toDate,
  travel
} from '../../shared/game'
import type { Activity, ContentPack, Course, GameState, Scene } from '../../shared/model'
import { AUTO_SLOT_ID, type SaveData } from '../../shared/saves'
import { errorMessage } from './errors'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { TitleScreen } from './TitleScreen'
import { CalendarPanel } from './ui/CalendarPanel'
import { CharPanel } from './ui/CharPanel'
import { CourierPanel } from './ui/CourierPanel'
import { CoursesView } from './ui/CoursesView'
import { DayView } from './ui/DayView'
import { Dialog, ToBeImplemented } from './ui/Dialog'
import { ItemIcon } from './ui/icons'
import { MapPanel } from './ui/MapPanel'
import { OutingDialog } from './ui/OutingDialog'
import { MarketView } from './ui/MarketView'
import type { Panel } from './ui/panels'
import { SceneView } from './ui/SceneView'
import { SummaryView, type SceneSummary } from './ui/SummaryView'

export function App() {
  const [content, setContent] = useState<ContentPack | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getContent().then(setContent, (e) => setError(String(e)))
  }, [])

  // Each started or loaded game gets a new id so the Game component starts afresh.
  const [session, setSession] = useState<{ id: number; data: SaveData } | null>(null)
  const nextId = useRef(1)

  if (error) return <main className="title">Failed to load content: {error}</main>
  if (!content) return <main className="title">Loading...</main>

  const start = ({ state, scene }: SaveData) =>
    setSession({
      id: nextId.current++,
      data: {
        state: reconcileState(state, content),
        // A scene with a love interest who no longer exists can't be resumed.
        scene:
          scene && sceneCast(scene).every((id) => content.loveInterests.some((li) => li.id === id))
            ? scene
            : null
      }
    })

  if (!session) return <TitleScreen content={content} onStart={start} />
  return (
    <Game
      key={session.id}
      content={content}
      initial={session.data}
      onLoad={start}
      onExit={() => setSession(null)}
    />
  )
}

/** What gets written to a save: a line still waiting for its reply is left out. */
function savable(state: GameState, scene: Scene | null): SaveData {
  const unanswered = scene?.messages.at(-1)?.role === 'user'
  return {
    state,
    scene: scene && unanswered ? { ...scene, messages: scene.messages.slice(0, -1) } : scene
  }
}

interface GameProps {
  content: ContentPack
  initial: SaveData
  onLoad: (data: SaveData) => void
  onExit: () => void
}

/** Owns the running game: its state, the open scene, and whichever dialog is showing. */
function Game({ content, initial, onLoad, onExit }: GameProps) {
  const [state, setState] = useState<GameState>(initial.state)
  const [scene, setScene] = useState<Scene | null>(initial.scene)
  // The character has closed the scene and the player hasn't moved on yet.
  const [ended, setEnded] = useState(false)
  // Set once a scene is over, until the player dismisses its summary screen.
  const [summary, setSummary] = useState<SceneSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastPrompt, setLastPrompt] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  // Confirmation of the plan just accepted, shown until the next line is said.
  const [agreed, setAgreed] = useState('')
  // Something the player typed to do, worked out and waiting for a yes.
  const [outing, setOuting] = useState<Outing | null>(null)
  // Browsing the market stalls.
  const [shopping, setShopping] = useState(false)
  // The view of a location the player picked; forgotten once they go somewhere else.
  const [view, setView] = useState<{ locationId: string; backgroundId: string } | null>(null)
  const backgroundId = view?.locationId === state.locationId ? view.backgroundId : undefined
  const location = content.locations.find((l) => l.id === state.locationId)

  // Autosave on every change, but not for the state the game was opened with.
  const untouched = useRef(true)
  useEffect(() => {
    if (untouched.current) {
      untouched.current = false
      return
    }
    window.api
      .saveGame({ slotId: AUTO_SLOT_ID, ...savable(state, scene) })
      .catch((error) => setNotice(`Autosave failed: ${errorMessage(error)}`))
  }, [state, scene])

  // Shared activities are done with whoever is picked among the people at the player's location.
  const present = loveInterestsAt(content, state, state.locationId)
  const partnerId = scene?.loveInterestId ?? present[0]?.id

  // Once a day, when nothing else is going on, someone may write to the player unprompted.
  const idle = !scene && !summary && (state.enrolment !== null || !content.coursework)
  const roundMade = useRef(-1)
  useEffect(() => {
    if (!idle || !courierRoundDue(content, state)) return
    const round = courierRound(content, state)
    // The ref keeps a repeated effect from making the same day's round twice.
    if (roundMade.current === round.state.courierDay) return
    roundMade.current = round.state.courierDay
    setState(round.state)
    const id = round.writerId
    if (!id) return
    window.api
      .courier({ state: round.state, loveInterestId: id, invite: true })
      .then((note) => {
        if (!note.text) return
        setState((current) => addNote(current, id, { from: 'them', text: note.text, proposal: note.proposal, read: false }))
      })
      .catch(() => undefined)
  }, [idle, state, content])
  const partner = content.loveInterests.find((li) => li.id === partnerId)

  /** Does the activity. One shared with a love interest opens a scene with them and whoever else is in the company. */
  function doActivity(activity: Activity) {
    const withId = activity.withLoveInterest === 'none' ? undefined : partnerId
    setState(perform(activity, state, content, withId))
    setNotice('')
    if (!withId) return
    const companionIds: string[] = []
    setScene({
      loveInterestId: withId,
      companionIds,
      nsfw: activity.nsfw,
      beats: [{ activityName: activity.name, locationName: location?.name }],
      messages: [],
      gifts: [],
      // Taken from before the activity's effects, so the summary counts them.
      baseline: sceneBaseline(state, withId, companionIds)
    })
  }

  /** Says a line in the scene. `from` and `at` let a caller pass a scene and state it has just changed. */
  async function send(text: string, from: Scene | null = scene, at: GameState = state) {
    if (!from) return
    const asked: Scene = { ...from, messages: [...from.messages, { role: 'user', content: text }] }
    setScene(asked)
    setNotice('')
    setAgreed('')
    setBusy(true)
    try {
      const response = await window.api.chat({ state: at, scene: asked })
      setScene(
        applyLook(
          {
            ...asked,
            messages: [...asked.messages, response.message],
            // Once the NSFW LLM has had to take over, it keeps the scene.
            nsfw: asked.nsfw || response.profileId === 'nsfw',
            // A suggestion left unanswered lapses when the conversation moves on.
            proposal: response.proposal,
            bondProposal: response.bondProposal
          },
          response.look
        )
      )
      setLastPrompt(response.systemPrompt)
      setEnded(response.sceneEnded)
    } catch (error) {
      // Drop the unanswered line so the conversation stays in step.
      setScene(from)
      setNotice(`${errorMessage(error)} Your line was: "${text}"`)
    } finally {
      setBusy(false)
    }
  }

  /** Turns up for a plan made earlier, which opens a scene with everyone it was made with. */
  function keep(appointmentId: string) {
    const { state: after, appointment } = keepAppointment(content, state, appointmentId)
    setState(after)
    setNotice('')
    setScene({
      loveInterestId: appointment.loveInterestId,
      companionIds: appointment.companionIds,
      nsfw: false,
      beats: [{ activityName: appointment.title, locationName: location?.name }],
      messages: [],
      gifts: [],
      baseline: sceneBaseline(state, appointment.loveInterestId, appointment.companionIds)
    })
  }

  /** Works out what the player means by something they typed, and asks before doing it. */
  async function propose(text: string) {
    setBusy(true)
    setNotice('')
    try {
      const response = await window.api.planOuting({ state, text })
      setOuting(response.outing)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Goes on the outing, after waiting if some of the company weren't free yet. */
  function go(plan: Outing, waitHours: number) {
    const result = startOuting(content, state, plan, waitHours)
    setState(result.state)
    setScene(result.scene)
    setOuting(null)
    setNotice(result.scene ? '' : `You spent ${plan.hours} hour${plan.hours === 1 ? '' : 's'}: ${plan.title}.`)
  }

  /** Sits a class. With love interests in it, the class is a scene with the ones the player sits by. */
  function attendClass(courseId: string) {
    const course = state.courses.find((c) => c.id === courseId)
    setState(attend(content, state, courseId))
    setNotice('')
    const [leadId, ...companionIds] = course ? classmates(state, course) : []
    if (!course || !leadId) return
    setScene({
      loveInterestId: leadId,
      companionIds,
      nsfw: false,
      beats: [
        {
          activityName: `${course.title} (${course.number}), a class taught by ${course.professor}`,
          locationName: location?.name,
          description: `${course.professor} begins ${course.title}. ${course.description}`.trim()
        }
      ],
      messages: [],
      gifts: [],
      baseline: sceneBaseline(state, leadId, companionIds)
    })
  }

  /** Hands a carried gift to someone in the scene, who then reacts to it. */
  function give(itemId: string, toId: string) {
    if (!scene || busy) return
    const { state: after, gift } = giveGift(content, state, toId, itemId)
    setState(after)
    setPanel(null)
    const line =
      scene.companionIds.length > 0
        ? `*hands ${firstNames(content, [toId])} a gift: ${gift.name}*`
        : `*hands over a gift: ${gift.name}*`
    send(line, { ...scene, gifts: [...scene.gifts, gift] }, after)
  }

  /** Opens the market, walking there first if the player is somewhere else. */
  function visitMarket() {
    const marketId = content.stalls[0]?.locationId
    const market = content.locations.find((l) => l.id === marketId)
    if (!market) {
      setPanel({ kind: 'tbi', feature: 'Market', note: 'This content pack has no market stalls.' })
      return
    }
    if (state.locationId !== market.id) {
      const check = canTravel(content, state, market.id)
      if (!check.ok) {
        setNotice(`You can't go to the market now: ${check.reasons.join('; ')}.`)
        return
      }
      setState(travel(content, state, market.id))
    } else if (!isOpen(market, toDate(content.calendar, state.time).hour)) {
      setNotice(`${market.name} is closed.`)
      return
    }
    setNotice('')
    setShopping(true)
  }

  /** Turns the finished scene into a memory and shows what came of it. */
  async function finishScene() {
    if (!scene || busy) return
    setBusy(true)
    try {
      const result = await window.api.summarize({ state, scene })
      setSummary({
        scene,
        outcome:
          scene.baseline && sceneOutcome(content, scene.baseline, state, scene.loveInterestId),
        companions: scene.companionIds.map((id) => ({
          id,
          outcome: scene.baseline && sceneOutcome(content, scene.baseline, state, id, true)
        })),
        memories: result.memories,
        memoryError: result.error
      })
      // Everyone who was there keeps their own memory of it.
      // Sharing a scene also brings the love interests in it closer to each other.
      setState(
        sceneCast(scene).reduce(
          (current, id) => (result.memories[id] ? addMemory(current, id, result.memories[id]) : current),
          growTies(content, state, sceneCast(scene))
        )
      )
      setScene(null)
      setEnded(false)
      setLastPrompt('')
      setNotice('')
      setPanel(null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setPanel(null)
  // Stable, so the courier panel's effects don't re-run on every render.
  const applyUpdate = useCallback((update: (current: GameState) => GameState) => setState(update), [])
  // Stable, so the course screen's one-off request isn't repeated on every render.
  const setCatalogue = useCallback(
    (courses: Course[]) => setState((current) => ({ ...current, courses })),
    []
  )

  return (
    <>
      {content.coursework && state.enrolment === null ? (
        <CoursesView
          content={content}
          state={state}
          onCatalogue={setCatalogue}
          onEnrol={(enrolment) => setState({ ...state, enrolment })}
        />
      ) : summary ? (
        <SummaryView
          content={content}
          state={state}
          summary={summary}
          backgroundId={backgroundId}
          onContinue={() => setSummary(null)}
        />
      ) : scene ? (
        <SceneView
          content={content}
          state={state}
          scene={scene}
          backgroundId={backgroundId}
          busy={busy}
          notice={notice}
          ended={ended}
          onSend={send}
          onContinue={finishScene}
          onAcceptProposal={() => {
            if (!scene.proposal) return
            setState(acceptProposal(state, scene.proposal))
            setScene({ ...scene, proposal: undefined })
            setNotice('')
            setAgreed(
              `${scene.proposal.title} with ${firstNames(content, attendees(scene.proposal))}: ` +
                `${describeWhen(content, scene.proposal.time)}. Added to your calendar.`
            )
          }}
          onDeclineProposal={() => setScene({ ...scene, proposal: undefined })}
          onAnswerBond={(accept) => {
            const asked = scene.bondProposal
            if (!asked) return
            setScene({ ...scene, bondProposal: undefined })
            if (!accept) return
            setState(acceptBond(content, state, asked))
            setAgreed(`${describeBond(content, asked)}: agreed.`)
          }}
          agreed={agreed}
          onOpen={setPanel}
        />
      ) : shopping ? (
        <MarketView
          content={content}
          state={state}
          onBuy={(itemId) => setState(buy(content, state, itemId))}
          onLeave={() => setShopping(false)}
        />
      ) : (
        <DayView
          content={content}
          state={state}
          partnerId={partnerId}
          backgroundId={backgroundId}
          notice={notice}
          onActivity={doActivity}
          onAttend={attendClass}
          busy={busy}
          onPropose={propose}
          onKeep={keep}
          onMarket={visitMarket}
          onOpen={setPanel}
          onExit={onExit}
        />
      )}

      {panel?.kind === 'gifts' && scene && partner && (
        <Dialog title={scene.companionIds.length > 0 ? 'Give a gift' : `Give ${partner.name.split(' ')[0]} a gift`} onClose={close} narrow>
          {carried(content, state).length === 0 && (
            <p className="hint">You aren't carrying any gifts. The market sells them.</p>
          )}
          {carried(content, state).map(({ item, count }) => (
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
              </div>
              {/* In a group, one button per person: the gift goes to whoever is picked. */}
              <div className="give-to">
                {sceneCast(scene).map((id) => (
                  <button key={id} disabled={busy} onClick={() => give(item.id, id)}>
                    {scene.companionIds.length > 0 ? firstNames(content, [id]) : 'Give'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Dialog>
      )}

      {outing && !scene && (
        <OutingDialog content={content} state={state} outing={outing} onGo={go} onClose={() => setOuting(null)} />
      )}

      {panel?.kind === 'courier' && (
        <CourierPanel content={content} state={state} onChange={applyUpdate} onClose={close} />
      )}
      {panel?.kind === 'settings' && <SettingsPanel onClose={close} />}
      {(panel?.kind === 'save' || panel?.kind === 'load') && (
        <SavesPanel
          content={content}
          mode={panel.kind}
          current={savable(state, scene)}
          onLoad={onLoad}
          onClose={close}
        />
      )}
      {panel?.kind === 'calendar' && (
        <CalendarPanel content={content} state={state} onChange={setState} onClose={close} />
      )}
      {panel?.kind === 'map' && (
        <MapPanel
          content={content}
          state={state}
          onTravel={(locationId) => {
            setState(travel(content, state, locationId))
            setNotice('')
            close()
          }}
          onClose={close}
        />
      )}
      {panel?.kind === 'backgrounds' && location && (
        <Dialog title={`Views of ${location.name}`} onClose={close}>
          {location.backgrounds.length === 0 && (
            <p className="hint">This location has no backgrounds yet.</p>
          )}
          <div className="views">
            {location.backgrounds.map((b) => (
              <button
                key={b.id}
                className="secondary view"
                onClick={() => {
                  setView({ locationId: location.id, backgroundId: b.id })
                  close()
                }}
              >
                <img src={`content://pack/${b.image}`} alt="" />
                {b.name}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {panel?.kind === 'char' && (
        <CharPanel content={content} state={state} loveInterestId={panel.id} onClose={close} />
      )}
      {panel?.kind === 'tbi' && (
        <Dialog title={panel.feature} onClose={close} narrow>
          <ToBeImplemented note={panel.note} />
        </Dialog>
      )}
      {panel?.kind === 'log' && scene && partner && (
        <Dialog title="Log" onClose={close}>
          <ol className="log">
            {scene.messages.map((m, i) => (
              <li key={i} className={m.role}>
                {/* In a group each line of the reply already names its speaker. */}
                {(m.role === 'user' || scene.companionIds.length === 0) && (
                  <strong>{m.role === 'user' ? state.player.name : partner.name}</strong>
                )}
                {m.content}
              </li>
            ))}
          </ol>
          {scene.messages.length === 0 && <p className="hint">Nothing has been said yet.</p>}
          {lastPrompt && (
            <details>
              <summary>System prompt sent for the last message</summary>
              <pre>{lastPrompt}</pre>
            </details>
          )}
        </Dialog>
      )}
    </>
  )
}
