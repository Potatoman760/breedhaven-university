import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptBond,
  acceptProposal,
  applyFeelings,
  leaveScene,
  sceneWitnesses,
  attendees,
  addMemory,
  amendMemory,
  addNote,
  birthNote,
  birthsDue,
  conceive,
  deliver,
  attendOrientation,
  courierRound,
  courierRoundDue,
  describeGrade,
  settleExams,
  viewFor,
  payShift,
  settleShifts,
  shiftPay,
  startShift,
  feedRound,
  stallsAt,
  dramaDue,
  fireDrama,
  giveContact,
  planDrama,
  relationBetween,
  setRelation,
  handleOf,
  hasContact,
  offersContact,
  feedRoundDue,
  addPosts,
  applyLook,
  applyComfort,
  applyLooks,
  describeBond,
  describeLearned,
  factsFromGift,
  revealedIds,
  revealFacts,
  describeWhen,
  growTies,
  keepAppointment,
  findDestination,
  movedScene,
  moveState,
  passSceneTime,
  sceneDestinations,
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
  meet,
  sceneCast,
  firstNames,
  sceneOutcome,
  talkToNpc,
  withNpc,
  startOuting,
  type Outing,
  toDate,
  travel
} from '../../shared/game'
import type { Activity, ContentPack, GameState, Scene } from '../../shared/model'
import { AUTO_SLOT_ID, type SaveData } from '../../shared/saves'
import { errorMessage } from './errors'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { TitleScreen } from './TitleScreen'
import { CalendarPanel } from './ui/CalendarPanel'
import { PhonePanel } from './ui/PhonePanel'
import { ContentEditor } from './ui/editor/ContentEditor'
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
  const [editing, setEditing] = useState(false)

  if (error) return <main className="title">Failed to load content: {error}</main>
  if (!content) return <main className="title">Loading...</main>

  const start = ({ state, scene }: SaveData) =>
    setSession({
      id: nextId.current++,
      data: {
        state: reconcileState(state, content),
        // A scene with a love interest who no longer exists can't be resumed.
        scene:
          scene && sceneCast(scene).every((id) => withNpc(content, id).loveInterests.some((li) => li.id === id))
            ? scene
            : null
      }
    })

  if (editing) return <ContentEditor content={content} onContent={setContent} onClose={() => setEditing(false)} />
  if (!session) return <TitleScreen content={content} onStart={start} onEdit={() => setEditing(true)} />
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
  // What the reply on screen let the player find out, shown under it.
  const [learned, setLearned] = useState<string[]>([])
  // Dice rolled for the reply on screen, shown under it.
  const [rolls, setRolls] = useState<string[]>([])
  // Browsing the market stalls.
  const [shopping, setShopping] = useState(false)
  const location = content.locations.find((l) => l.id === state.locationId)
  // The view of where he is: one named for today's event or holiday if the place has one, else its default.
  const backgroundId = viewFor(content, state, location)?.id

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

  // Whoever is in a scene has been met, from the moment it begins or she walks into it.
  useEffect(() => {
    if (scene) setState((current) => meet(content, current, sceneCast(scene)))
  }, [content, scene])

  // As time goes by, the shifts that have ended are counted: worked, or missed and held against him.
  useEffect(() => {
    setState((current) => settleShifts(content, current))
  }, [content, state.time])

  // An examination takes the place of a class and asks nothing of him at the time: when its hour is over he is told his grade.
  useEffect(() => {
    const marked = settleExams(content, state)
    if (marked.graded.length === 0) return
    setState((current) => settleExams(content, current).state)
    setNotice(marked.graded.map(describeGrade).join(' · '))
  }, [content, state])

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
  // Once a day, a few of them post on Bloomr.
  const postsMade = useRef(-1)
  useEffect(() => {
    if (!idle || !feedRoundDue(content, state)) return
    const round = feedRound(content, state)
    if (postsMade.current === round.state.feedDay) return
    postsMade.current = round.state.feedDay
    setState(round.state)
    window.api
      .feed({ state: round.state, authorIds: round.authorIds })
      .then(({ posts }) => setState((current) => addPosts(current, posts)))
      .catch(() => undefined)
  }, [idle, state, content])
  // In a scene with an NPC, the NPC stands among the characters for every screen that shows the scene.
  const cast = scene?.npc ? withNpc(content, scene.loveInterestId) : content
  const partner = cast.loveInterests.find((li) => li.id === partnerId)

  // A child whose time has come is born as soon as nothing else is going on, and its mother sends word.
  useEffect(() => {
    if (!idle || !birthsDue(state)) return
    const { state: after, born } = deliver(content, state)
    setState(after)
    setNotice(
      born
        .map((child) => `${firstNames(content, [child.motherId])} has given birth: you have ${child.daughter ? 'a daughter' : 'a son'}.`)
        .join(' ')
    )
    for (const child of born) {
      const plain = birthNote(content, after, child)
      const news =
        `You gave birth today to ${after.player.name}'s child, ${child.daughter ? 'a daughter' : 'a son'}, and you are both well. ` +
        `Tell him in your own way, and say what you want of him now.`
      window.api
        .courier({ state: after, loveInterestId: child.motherId, invite: false, news })
        .then((note) => note.text || plain, () => plain)
        .then((text) => setState((current) => addNote(giveContact(current, child.motherId), child.motherId, { from: 'them', text, read: false })))
    }
  }, [idle, state, content])

  /**
   * Opens a scene the player has started, after the drama engine has had its say: someone
   * may be on her way, and a friend who was brought along is there from the first moment.
   */
  function begin(opening: Scene, at: GameState, tags: string[] = []) {
    const planned = planDrama(content, at, opening, { tags })
    const along = fireDrama(content, at, planned)
    setState(along.state)
    setScene(along.scene)
    setAgreed(along.notice)
  }

  /** Does the activity. One shared with a love interest opens a scene with them and whoever else is in the company. */
  function doActivity(activity: Activity) {
    const withId = activity.withLoveInterest === 'none' ? undefined : partnerId
    const done = perform(activity, state, content, withId)
    setState(done)
    setNotice('')
    if (!withId) return
    const companionIds: string[] = []
    begin({
      loveInterestId: withId,
      companionIds,
      nsfw: activity.nsfw,
      beats: [{ activityName: activity.name, locationName: location?.name }],
      messages: [],
      gifts: [], conceived: [], departed: [], npc: false,
      // Taken from before the activity's effects, so the summary counts them.
      baseline: sceneBaseline(state, withId, companionIds)
    }, done, [...activity.tags, ...(activity.nsfw ? ['nsfw'] : [])])
  }

  /** Says a line in the scene. `from` and `at` let a caller pass a scene and state it has just changed. */
  async function send(text: string, said: Scene | null = scene, when: GameState = state) {
    if (!said) return
    // If someone was on her way, this is when she arrives: before the line is answered, so the answer is hers.
    const arrival = dramaDue(content, when, said) ? fireDrama(content, when, said) : undefined
    const from = arrival?.scene ?? said
    const at = arrival?.state ?? when
    if (arrival) setState((current) => ({ ...current, dramaDay: arrival.state.dramaDay }))
    // The view the player has picked goes along, so the character knows exactly where they are.
    const asked: Scene = { ...from, backgroundId: backgroundId ?? from.backgroundId, messages: [...from.messages, { role: 'user', content: text }] }
    setScene(asked)
    setNotice('')
    setAgreed(arrival?.notice ?? '')
    setRolls([])
    setLearned([])
    setBusy(true)
    try {
      const response = await window.api.chat({ state: at, scene: asked })
      // The game, not the LLM, decides whether she conceives.
      const conceived = response.seededIds.filter((id) => conceive(content, at, id) !== at)
      if (conceived.length > 0) {
        setState((current) => conceived.reduce((next, id) => conceive(content, next, id), current))
      }
      // The story may have run on, or gone somewhere else: the clock and the place follow it.
      const { hours } = response
      // Where the character took the scene, checked again here against where it can go.
      const destination = response.moveTo
        ? findDestination(sceneDestinations(content, at, asked), response.moveTo)
        : undefined
      if (hours || destination) {
        setState((current) => {
          const moved = destination ? moveState(current, destination) : current
          return hours ? passSceneTime(content, moved, hours) : moved
        })
      }
      const placed = destination ? movedScene(asked, destination) : asked
      // What walking out cost him is hers to decide with the rest, when the scene is over.
      const { left } = response
      // She hears the reply she leaves in, and nothing after it.
      const replied = (next: Scene): Scene => (left ? leaveScene(next, left.ids, left.feeling, left.reason) : next)
      setScene(
        replied(applyComfort(applyLooks(applyLook(
          {
            ...placed,
            messages: [...asked.messages, response.message],
            // Once the NSFW LLM has had to take over, it keeps the scene.
            nsfw: asked.nsfw || response.profileId === 'nsfw',
            // A suggestion left unanswered lapses when the conversation moves on.
            proposal: response.proposal,
            bondProposal: response.bondProposal,
            conceived: [...new Set([...asked.conceived, ...conceived])]
          },
          response.look
        ), response.looks), response.comfort))
      )
      setRolls(response.rolls)
      // What she let out goes into what the player knows of her.
      const fresh = response.revealed.filter((r) => !revealedIds(at, r.loveInterestId).includes(r.factId))
      if (fresh.length > 0) {
        setState((current) => fresh.reduce((next, r) => revealFacts(content, next, r.loveInterestId, [r.factId]), current))
      }
      // Whoever gave him her Chats can be messaged from now on.
      const given = response.contacts.filter((id) => !hasContact(at, id))
      if (given.length > 0) setState((current) => given.reduce(giveContact, current))
      // What changed between the love interests themselves.
      if (response.rapport.length > 0) setState((current) => response.rapport.reduce((next, c) => setRelation(next, c.a, c.b, c.relation), current))
      setLearned([
        ...response.rapport.map((c) => {
          const pair = firstNames(content, [c.a, c.b])
          return c.relation === 'neither' ? `${pair} are no longer ${relationBetween(at, c.a, c.b)}` : `${pair} are now ${c.relation}`
        }),
        ...fresh.map((r) => describeLearned(content, r.loveInterestId, r.factId)).filter((line): line is string => line !== undefined),
        ...given.flatMap((id) => {
          const li = content.loveInterests.find((c) => c.id === id)
          return li ? [`${li.name.split(' ')[0]} gave you her Chats: ${handleOf(li)}`] : []
        })
      ])
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
    setNotice('')
    begin({
      loveInterestId: appointment.loveInterestId,
      companionIds: appointment.companionIds,
      nsfw: false,
      beats: [{ activityName: appointment.title, locationName: location?.name }],
      messages: [],
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(state, appointment.loveInterestId, appointment.companionIds)
    }, after)
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
    if (result.scene) begin(result.scene, result.state)
    else {
      setState(result.state)
      setScene(null)
    }
    setOuting(null)
    setNotice(result.scene ? '' : `You spent ${plan.hours} hour${plan.hours === 1 ? '' : 's'}: ${plan.title}.`)
  }

  /** Goes to the next part of orientation, which is a scene with whoever the player is put with. */
  function attendNext() {
    const result = attendOrientation(content, state)
    setState(result.state)
    setScene(result.scene)
    setNotice('')
  }

  /** Has a word with someone who is here and is not a love interest. */
  function talkNpc(npcId: string) {
    const result = talkToNpc(content, state, npcId)
    setState(result.state)
    setScene(result.scene)
    setNotice('')
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
          description: `${course.professor} begins ${course.title}. ${course.description}`.trim(),
          direction:
            `You are in class together. The lecture runs its course as you talk and is over by the time on the ` +
            `clock, so by the end of this scene everyone is free to leave: to walk back to a room, or go on somewhere.`
        }
      ],
      messages: [],
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(state, leadId, companionIds)
    })
  }

  /** Clocks in for the shift that is under way: a scene at work, paid when it ends. */
  function work() {
    const result = startShift(content, state)
    setState(result.state)
    setScene(result.scene)
    setNotice('')
  }

  /** Hands a carried gift to someone in the scene, who then reacts to it. */
  function give(itemId: string, toId: string) {
    if (!scene || busy) return
    const { state: given, gift } = giveGift(content, state, toId, itemId)
    // How a gift lands says something about her taste.
    const item = content.items.find((i) => i.id === itemId)
    const taker = content.loveInterests.find((li) => li.id === toId)
    const after = item && taker ? revealFacts(content, given, toId, factsFromGift(taker, item)) : given
    setState(after)
    setPanel(null)
    const line =
      scene.companionIds.length > 0
        ? `*hands ${firstNames(content, [toId])} a gift: ${gift.name}*`
        : `*hands over a gift: ${gift.name}*`
    send(line, { ...scene, gifts: [...scene.gifts, gift] }, after)
  }

  /** Opens the shops where the player is, or failing any there, walks to the market first. */
  function visitMarket() {
    const marketId = stallsAt(content, state.locationId)[0]?.locationId ?? content.stalls[0]?.locationId
    const market = content.locations.find((l) => l.id === marketId)
    if (!market) {
      setPanel({ kind: 'tbi', feature: 'Market', note: 'This content pack has no market stalls.' })
      return
    }
    if (state.locationId !== market.id) {
      const check = canTravel(content, state, market.id)
      if (!check.ok) {
        setNotice(`You can't go to ${market.name} now: ${check.reasons.join('; ')}.`)
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
      // Someone taken with him who never got round to it gives him her Chats as they part.
      const parting = scene.npc ? [] : sceneWitnesses(scene).filter((id) => offersContact(content, state, id))
      if (parting.length > 0) {
        setState((current) => parting.reduce(giveContact, current))
        setNotice(`${firstNames(content, parting)} gave you ${parting.length > 1 ? 'their' : 'her'} Chats before you parted.`)
      }
      // How each of them feels about him now is what she made of the scene, and nothing else moves it.
      const felt = Object.entries(result.feelings).reduce((current, [id, feelings]) => applyFeelings(content, current, id, feelings), state)
      setSummary({
        scene,
        outcome:
          sceneOutcome(content, scene.baseline, felt, scene.loveInterestId),
        companions: sceneWitnesses(scene).filter((id) => id !== scene.loveInterestId).map((id) => ({
          id,
          outcome: sceneOutcome(content, scene.baseline, felt, id, true)
        })),
        memories: result.memories,
        reasons: Object.fromEntries(Object.entries(result.feelings).map(([id, feelings]) => [id, feelings.reason])),
        memoryError: result.error
      })
      // Everyone who was there keeps their own memory of it.
      // Sharing a scene also brings the love interests in it closer to each other.
      setState(
        sceneWitnesses(scene).reduce(
          (current, id) => (result.memories[id] ? addMemory(current, id, result.memories[id]) : current),
          // A shift is paid for when it is over.
          payShift(content, growTies(content, felt, sceneCast(scene)), scene)
        )
      )
      const pay = shiftPay(content, scene)
      setScene(null)
      setEnded(false)
      setLastPrompt('')
      setNotice(pay > 0 ? `You were paid ${pay} for your shift.` : '')
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

  return (
    <>
      {content.coursework && state.enrolment === null ? (
        <CoursesView
          content={content}
          state={state}
          onEnrol={(enrolment) => setState({ ...state, enrolment })}
        />
      ) : summary ? (
        <SummaryView
          content={summary.scene.npc ? withNpc(content, summary.scene.loveInterestId) : content}
          state={state}
          summary={summary}
          backgroundId={backgroundId}
          onContinue={(edited) => {
            // The memories were kept as written when the scene ended, so that nothing is lost
            // if the game is closed here. What the player has reworded takes their place now.
            setState((current) =>
              sceneWitnesses(summary.scene).reduce(
                (next, id) => amendMemory(next, id, summary.memories[id] ?? '', edited[id] ?? ''),
                current
              )
            )
            setSummary(null)
          }}
        />
      ) : scene ? (
        <SceneView
          content={cast}
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
          onAnimationEnd={() => setScene((current) => current && { ...current, animationId: undefined })}
          onAnswerBond={(accept) => {
            const asked = scene.bondProposal
            if (!asked) return
            setScene({ ...scene, bondProposal: undefined })
            if (!accept) return
            setState(acceptBond(content, state, asked))
            setAgreed(`${describeBond(content, asked)}: agreed.`)
          }}
          agreed={agreed}
          rolls={rolls}
          learned={learned}
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
          onWork={work}
          onOrientation={attendNext}
          onTalkNpc={talkNpc}
          busy={busy}
          onPropose={propose}
          onOuting={setOuting}
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
        <PhonePanel content={content} state={state} onChange={applyUpdate} onClose={close} initialId={panel.id} />
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
