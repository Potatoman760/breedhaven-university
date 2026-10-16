import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptBond,
  ambienceAt,
  leaveTable,
  settlePokerHand,
  soundCues,
  acceptProposal,
  applyFeelings,
  leaveScene,
  sceneWitnesses,
  attendees,
  addMemory,
  amendMemory,
  addNote,
  attendBirth,
  useItem,
  useAbility,
  newSkills,
  tellSkills,
  hasSkill,
  intuitTaste,
  lessonTopic,
  spendOnFocus,
  focusName,
  setFocus,
  attendViewing,
  scheduleViewing,
  renameNewborn,
  scheduleBirths,
  settleBirths,
  withHousing,
  homeViewId,
  housingOfferDue,
  scheduleDescent,
  attendDescent,
  startRun,
  sendHousingOffer,
  settleHousehold,
  conceive,
  attendOrientation,
  courierRound,
  courierRoundDue,
  MAX_TURNS_KEPT,
  packTurns,
  rewound,
  unpackTurns,
  type Turn,
  applySpending,
  playerGains,
  type Growth,
  personalise,
  answerInvite,
  courierThread,
  planFor,
  arriveFor,
  type Upcoming,
  orientationStep,
  summons,
  isGameOver,
  dayMisses,
  isSleepTime,
  sleep,
  describeGrade,
  settleExams,
  sitExam,
  canSitExam,
  examNow,
  viewFor,
  payShift,
  settleShifts,
  shiftPay,
  onBirthControl,
  stopBirthControl,
  payBonus,
  jobOf,
  startShift,
  feedRound,
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
  addIntimacy,
  addEventGoers,
  sleepOver,
  settleAppointments,
  sharedUpcoming,
  sceneEndWriter,
  planKey,
  postMade,
  applyLook,
  applyComfort,
  applyLooks,
  describeBond,
  describeLearned,
  factsFromGift,
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
  classmates,
  giveGift,
  approachableAt,
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
import type { Activity, ContentPack, ExamKind, GameState, PostPlan, Scene } from '../../shared/model'
import { CHAT_CANCELLED } from '../../shared/ipc'
import { AUTO_SLOT_ID, type SaveData } from '../../shared/saves'
import { errorMessage } from './errors'
import { play, setAmbience, useSounds } from './sound'
import { EpilogueView } from './ui/EpilogueView'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { TitleScreen } from './TitleScreen'
import { CalendarPanel } from './ui/CalendarPanel'
import { AgeGate } from './ui/AgeGate'
import { PhonePanel } from './ui/PhonePanel'
import { HelpPanel } from './ui/HelpPanel'
import { Bag } from './ui/Bag'
import { HousePanel } from './ui/HousePanel'
import { ContentEditor } from './ui/editor/ContentEditor'
import { CoursesView } from './ui/CoursesView'
import { DayView } from './ui/DayView'
import { Dialog, ToBeImplemented } from './ui/Dialog'
import { MapPanel } from './ui/MapPanel'
import { OutingDialog } from './ui/OutingDialog'
import { ExamDialog } from './ui/ExamDialog'
import { ExpeditionView } from './ui/ExpeditionView'
import { IntroView } from './ui/IntroView'
import { PokerView } from './ui/PokerView'
import { PartyDialog } from './ui/PartyDialog'
import type { Panel } from './ui/panels'
import { SceneView } from './ui/SceneView'
import { SummaryView, type SceneSummary } from './ui/SummaryView'

// Where it is kept that the player has said he is an adult.
const OF_AGE_KEY = 'breedhaven.ofAge'

/** Whether he has already said so on this computer. */
function wasConfirmedOfAge(): boolean {
  try {
    return window.localStorage.getItem(OF_AGE_KEY) === 'yes'
  } catch {
    return false
  }
}

export function App() {
  const [content, setContent] = useState<ContentPack | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getContent().then(setContent, (e) => setError(String(e)))
  }, [])
  useSounds(content?.sounds)

  // Each started or loaded game gets a new id so the Game component starts afresh.
  const [session, setSession] = useState<{ id: number; data: SaveData } | null>(null)
  const nextId = useRef(1)
  const [editing, setEditing] = useState(false)
  // Asked once, before anything of the game is shown: the answer is kept on this computer, and the question is not put again.
  const [ofAge, setOfAge] = useState(wasConfirmedOfAge)
  const confirmOfAge = () => {
    try {
      window.localStorage.setItem(OF_AGE_KEY, 'yes')
    } catch {
      // Without somewhere to keep it, it is simply asked again next time.
    }
    setOfAge(true)
  }

  if (!ofAge) return <AgeGate onConfirm={confirmOfAge} />
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
function savable(state: GameState, scene: Scene | null, turns: Turn[]): SaveData {
  const unanswered = scene?.messages.at(-1)?.role === 'user'
  const kept = scene && unanswered ? { ...scene, messages: scene.messages.slice(0, -1) } : scene
  return {
    state,
    scene: kept,
    // The turns that can be taken back go with the scene; one whose line was left out goes with its line.
    turns: kept ? packTurns(unanswered ? turns.slice(0, -1) : turns, state, kept) : undefined
  }
}

interface GameProps {
  content: ContentPack
  initial: SaveData
  onLoad: (data: SaveData) => void
  onExit: () => void
}

// Kept in the save once he has been shown round the course planner, and once he has been welcomed, so that each is shown once a game.
const COURSES_TOURED = 'toured-courses'
const WELCOMED = 'welcomed'

// How long a toast stays up, and a notice shown as one.
const TOAST_MS = 6000
const NOTICE_MS = 9000

/** Owns the running game: its state, the open scene, and whichever dialog is showing. */
function Game({ content: written, initial, onLoad, onExit }: GameProps) {
  const [state, setState] = useState<GameState>(initial.state)
  // The content as this game reads it: the player's name wherever the content wrote the token, and the house he has been let in it or out of it.
  const content = useMemo(() => withHousing(personalise(written, state.player.name), state), [written, state.player.name, state.housing])
  const [scene, setScene] = useState<Scene | null>(initial.scene)
  // The character has closed the scene and the player hasn't moved on yet.
  const [ended, setEnded] = useState(false)
  // Where the scene is on its way to, while the reply that takes it there is still being written.
  const [movingTo, setMovingTo] = useState<string | null>(null)
  useEffect(() => window.api.onSceneMoving(setMovingTo), [])
  // Those he set off with for the next thing on his timetable as the scene ended: once the scene is settled, that is where he goes.
  const [walkingWith, setWalkingWith] = useState<string[] | null>(null)
  // The scene ended with them going to sleep where they were: once it is settled, he wakes there in the morning.
  const [sleepingOver, setSleepingOver] = useState(false)
  // Set once a scene is over, until the player dismisses its summary screen.
  const [summary, setSummary] = useState<SceneSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  // Something to tell him that happened in the background, the feed's posts: never a reason to end a scene, so it is only ever put away.
  const [aside, setAside] = useState('')
  // The game and the scene as they stood before each line he has said in this scene, newest last, so that a turn can be taken back.
  const [turns, setTurns] = useState<Turn[]>(() => (initial.scene ? unpackTurns(initial.turns ?? [], initial.state, initial.scene) : []))
  useEffect(() => {
    if (!scene) setTurns([])
  }, [scene])
  // What something done alone came to, shown for a few seconds over the day.
  const [toast, setToast] = useState<{ title: string; gains: Growth[] } | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])
  // What the game sounds like as it goes: a cue for what has just happened, the weightiest of them, and then any notice that came with it.
  const heard = useRef(state)
  useEffect(() => {
    const [cue] = soundCues(content, heard.current, state)
    heard.current = state
    if (cue) play(cue)
  }, [state])
  useEffect(() => {
    if (notice || aside || toast) play('notice')
  }, [notice, aside, toast])
  // The loop behind where he is, which changes with the place and the dark, and stops when the game is left.
  const ambience = ambienceAt(content, state)
  useEffect(() => setAmbience(ambience), [ambience])
  useEffect(() => () => setAmbience(undefined), [])
  // Outside a scene, a notice is a toast too, since nothing else on the screen would be read: up for a while, and gone at a click.
  useEffect(() => {
    if (!notice || scene) return
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, scene])
  const [lastPrompt, setLastPrompt] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  // Confirmation of the plan just accepted, shown until the next line is said.
  const [agreed, setAgreed] = useState('')
  // Something the player typed to do, worked out and waiting for a yes.
  const [outing, setOuting] = useState<Outing | null>(null)
  // The examination whose paper is in front of him, until he puts it down: to answer, and then marked.
  const [exam, setExam] = useState<{ courseId: string; kind: ExamKind } | null>(null)
  // What the reply on screen let the player find out, shown under it.
  const [learned, setLearned] = useState<string[]>([])
  // Dice rolled for the reply on screen, shown under it.
  const [rolls, setRolls] = useState<string[]>([])
  // Browsing the market stalls.
  const location = content.locations.find((l) => l.id === state.locationId)
  // The view of where he is: one named for today's event or holiday if the place has one, else its default.
  // At home, that is the room of the house he is in.
  const backgroundId = viewFor(content, state, location, homeViewId(content, state))?.id

  // Autosave on every change, but not for the state the game was opened with.
  const untouched = useRef(true)
  useEffect(() => {
    if (untouched.current) {
      untouched.current = false
      return
    }
    window.api
      .saveGame({ slotId: AUTO_SLOT_ID, ...savable(state, scene, turns) })
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

  // As time goes by, a plan whose hours have passed without his turning up is held against him by whoever was waiting.
  useEffect(() => {
    const { missed } = settleAppointments(content, state)
    if (missed.length === 0) return
    setState((current) => settleAppointments(content, current).state)
    setNotice(missed.map((plan) => `You missed ${plan.title} with ${firstNames(content, attendees(plan))}, and sent no word. It will be remembered.`).join(' '))
  }, [content, state.time, state.appointments])

  // The small hours are for sleep and nothing else: whenever the clock stands in them and he is not in the middle of something, he sleeps till morning.
  useEffect(() => {
    if (scene || summary || !isSleepTime(content, state) || isGameOver(content.calendar, state.time)) return
    setState((current) => (isSleepTime(content, current) ? sleep(content, current) : current))
  }, [content, scene, summary, state])

  /** Asks whether to end the day early: everything still to come today would be let go, and he would wake in the morning. */
  function endDay() {
    // Orientation has to be sat through first, and so does anything he has been summoned to.
    if (orientationStep(content, state) || summons(content, state)) return
    setPanel({ kind: 'endDay' })
  }

  // An examination he did not turn up for is failed when its hour is over, and he is told.
  useEffect(() => {
    const marked = settleExams(content, state)
    if (marked.graded.length === 0) return
    setState((current) => settleExams(content, current).state)
    setNotice(marked.graded.map(describeGrade).join(' · '))
  }, [content, state])

  // Shared activities are done with whoever is picked among the people at the player's location.
  const present = approachableAt(content, state, state.locationId)
  const partnerId = scene?.loveInterestId ?? present[0]?.id

  // Once a day, when nothing else is going on, someone may write to the player unprompted.
  // Once the calendar has run out nothing more is set going: nobody writes, nothing is posted. Births still come, for the telling.
  const over = isGameOver(content.calendar, state.time)
  const idle = !scene && !summary && !state.expedition.run && (state.enrolment !== null || !content.coursework)
  const roundMade = useRef(-1)
  useEffect(() => {
    if (!idle || over || !courierRoundDue(content, state)) return
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
  // At the start of each day, the day's Bloomr posts are planned. The plans are kept in the game until each is made.
  useEffect(() => {
    if (!idle || over || !feedRoundDue(content, state)) return
    setState((current) => (feedRoundDue(content, current) ? feedRound(content, current).state : current))
  }, [idle, over, state, content])
  // Whatever is planned and not yet made is written and drawn in the background, one lot at a time. Each post is filed as its selfie
  // arrives, and goes up at its own hour. A plan is tried once each time the game is run: one that fails is said, and waits for the next.
  const drawing = useRef(false)
  const triedPlans = useRef(new Set<string>())
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    if (drawing.current || over) return
    const { weatherSeed } = state
    const tryKey = (plan: PostPlan) => `${weatherSeed}:${planKey(plan)}`
    const plans = state.feedPlans.filter((plan) => !triedPlans.current.has(tryKey(plan)))
    if (plans.length === 0) return
    drawing.current = true
    for (const plan of plans) triedPlans.current.add(tryKey(plan))
    void (async () => {
      const { drafts, error, shortfall } = await window.api.feed({ state, plans })
      let failed = error ?? shortfall ?? (drafts.length < plans.length ? `${plans.length - drafts.length} of ${plans.length} posts could not be written.` : undefined)
      for (const draft of drafts) {
        const date = toDate(content.calendar, draft.time)
        const made = await window.api.feedPicture({ authorId: draft.authorId, name: `bloomr-day-${date.dayIndex + 1}-${date.hour}`, prompt: draft.prompt })
        // A post is its picture: one that could not be drawn is not made. Nor is one whose game has been left since.
        if (made.image) setState((current) => (current.weatherSeed === weatherSeed ? postMade(current, { ...draft, image: made.image ?? undefined }) : current))
        else failed ??= `A picture could not be drawn: ${made.error ?? 'ComfyUI gave nothing back'}.`
      }
      if (failed) setAside(`Bloomr: some of today's posts could not be made. ${failed}`)
    })()
      .catch((error: unknown) => setAside(`Bloomr: today's posts could not be made. ${(error as Error).message}`))
      .finally(() => {
        drawing.current = false
        setDrawn((count) => count + 1)
      })
  }, [state.feedPlans, state.weatherSeed, over, drawn])
  // In a scene with an NPC, the NPC stands among the characters for every screen that shows the scene.
  const cast = scene?.npc ? withNpc(content, scene.loveInterestId) : content
  const partner = cast.loveInterests.find((li) => li.id === partnerId)
  const examCourse = exam ? state.courses.find((course) => course.id === exam.courseId) : undefined

  // A few days before a child is due, the hour of its birth is set and goes on his calendar. Only while nothing else is going on:
  // a turn taken back keeps what was written to him, and would have her write twice.
  useEffect(() => {
    if (!idle || over || scheduleBirths(content, state).state === state) return
    setState((current) => scheduleBirths(content, current).state)
  }, [idle, over, state, content])

  // Getting far enough in a course teaches him something: he is told once, when it happens.
  useEffect(() => {
    if (!idle) return
    const earned = newSkills(content, state)
    if (earned.length === 0) return
    setState((current) => tellSkills(current, earned.map((skill) => skill.id)))
    setNotice(earned.map((skill) => `New skill: ${skill.name}. ${skill.description}`).join(' '))
  }, [idle, state, content])

  // Once he has said yes to the house, the officer sets an hour to show him round it, and sets another if he does not come.
  useEffect(() => {
    if (!idle || over || scheduleViewing(content, state) === state) return
    setState((current) => scheduleViewing(content, current))
  }, [idle, over, state, content])

  // A birth whose hour has gone by without him has happened without him, and she does not forget it.
  useEffect(() => {
    if (!idle) return
    const { missed } = settleBirths(content, state)
    if (missed.length === 0) return
    setState((current) => settleBirths(content, current).state)
    setNotice(missed.map(({ motherId, child }) => `${firstNames(content, [motherId])} gave birth to your ${child.daughter ? 'daughter' : 'son'}, ${child.name}, and you were not there. She will not forget it.`).join(' '))
  }, [idle, state, content])

  // Once the way down is open, whoever knows of it sets an hour to show him, and sets it again when he does not come.
  useEffect(() => {
    if (!idle || over || scheduleDescent(content, state) === state) return
    setState((current) => scheduleDescent(content, current))
  }, [idle, over, state, content])

  // Once someone he is with is carrying his child, the Sire Relations Office writes to him about a house.
  useEffect(() => {
    if (!idle || over || !housingOfferDue(content, state)) return
    setState((current) => sendHousingOffer(content, current))
  }, [idle, over, state, content])

  // As the days go by the house is reckoned up: rent on the first of the month, the children's keep each week.
  useEffect(() => {
    if (!idle) return
    const settled = settleHousehold(content, state)
    if (settled.state === state) return
    setState((current) => settleHousehold(content, current).state)
    if (settled.notices.length > 0) setNotice(settled.notices.join(' '))
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

  /**
   * Says a line in the scene, or with no line has the character open it. `from` and `at`
   * let a caller pass a scene and state it has just changed.
   */
  async function send(text?: string, said: Scene | null = scene, when: GameState = state) {
    if (!said) return
    // Kept so that the line, and whatever it leads to, can be taken back.
    if (text !== undefined) setTurns((kept) => [...kept, { state: when, scene: said, text }].slice(-MAX_TURNS_KEPT))
    // If someone was on her way, this is when she arrives: before the line is answered, so the answer is hers.
    const arrival = dramaDue(content, when, said) ? fireDrama(content, when, said) : undefined
    const from = arrival?.scene ?? said
    const at = arrival?.state ?? when
    if (arrival) setState((current) => ({ ...current, dramaDay: arrival.state.dramaDay }))
    // The view the player has picked goes along, so the character knows exactly where they are.
    const asked: Scene = { ...from, backgroundId: from.viewId ?? backgroundId ?? from.backgroundId, messages: text === undefined ? from.messages : [...from.messages, { role: 'user', content: text }] }
    setScene(asked)
    setNotice('')
    setAgreed(arrival?.notice ?? '')
    setRolls([])
    setLearned([])
    setBusy(true)
    try {
      const response = await window.api.chat({ state: at, scene: asked })
      // The game, not the LLM, decides whether she conceives.
      // She may have chosen, in this reply, to stop what she takes against it: that counts from this reply on.
      const stopped = response.offControlIds.filter((id) => onBirthControl(content, at, id))
      const unguarded = stopped.reduce((next, id) => stopBirthControl(content, next, id), at)
      const conceived = response.seededIds.filter((id) => conceive(content, unguarded, id) !== unguarded)
      if (stopped.length > 0 || conceived.length > 0) {
        setState((current) => conceived.reduce((next, id) => conceive(content, next, id), stopped.reduce((next, id) => stopBirthControl(content, next, id), current)))
      }
      if (stopped.length > 0) setAgreed(`${firstNames(content, stopped)} ${stopped.length === 1 ? 'has' : 'have'} stopped taking birth control.`)
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
      // He agreed in words to what she had suggested: it goes in his calendar as if he had pressed Accept.
      const agreedTo = response.proposalAccepted ? asked.proposal : undefined
      if (agreedTo) {
        setState((current) => acceptProposal(current, agreedTo))
        setAgreed(`${agreedTo.title} with ${firstNames(content, attendees(agreedTo))}: ${describeWhen(content, agreedTo.time)}. Added to your calendar.`)
      }
      // Whoever said she would be at an event is put down for it: she is there when he goes.
      const { attending } = response
      if (attending) setState((current) => attending.reduce((next, said) => addEventGoers(next, said.eventId, said.ids), current))
      const placed = destination ? movedScene(asked, destination) : asked
      // What walking out cost him is hers to decide with the rest, when the scene is over.
      const { left } = response
      // She hears the reply she leaves in, and nothing after it.
      // If the scene moved on in the same reply, she was left where it had been, and is not seen where it now is.
      const replied = (next: Scene): Scene => {
        if (!left) return next
        const gone = leaveScene(next, left.ids, left.feeling, left.reason)
        return destination ? { ...gone, departed: gone.departed.map((d) => (left.ids.includes(d.id) && d.at === next.messages.length ? { ...d, behind: true } : d)) } : gone
      }
      setScene(
        replied(applyComfort(applyLooks(applyLook(
          {
            ...placed,
            messages: [...asked.messages, response.message],
            // Once the NSFW LLM has had to take over, it keeps the scene.
            nsfw: asked.nsfw || response.profileId === 'nsfw',
            // A suggestion stays on offer while the conversation moves on, until it is answered, replaced by another, or its time has gone by.
            proposal: response.proposal ?? (response.proposalAccepted || (asked.proposal && asked.proposal.time <= at.time) ? undefined : asked.proposal),
            bondProposal: response.bondProposal,
            conceived: [...new Set([...asked.conceived, ...conceived])]
          },
          response.look
        ), response.looks), response.comfort))
      )
      setRolls(response.rolls)
      // Whoever gave him her Bloomr can be messaged from now on.
      const given = response.contacts.filter((id) => !hasContact(at, id))
      if (given.length > 0) setState((current) => given.reduce(giveContact, current))
      // What he found out about her, and what changed between the love interests themselves, is settled when the scene is over.
      setLearned([
        ...given.flatMap((id) => {
          const li = content.loveInterests.find((c) => c.id === id)
          return li ? [`${li.name.split(' ')[0]} gave you her Bloomr: ${handleOf(li)}`] : []
        })
      ])
      setLastPrompt(response.systemPrompt)
      setEnded(response.sceneEnded)
      setWalkingWith(response.walkTo?.withIds ?? null)
      setSleepingOver(response.sleptOver === true)
    } catch (error) {
      // Drop the unanswered line so the conversation stays in step.
      if (text !== undefined) setTurns((kept) => kept.slice(0, -1))
      setScene(from)
      // Stopped by the player, it is no failure: his line goes back in the box to say again or differently.
      if (!errorMessage(error).includes(CHAT_CANCELLED)) setNotice(text === undefined ? errorMessage(error) : `${errorMessage(error)} Your line was: "${text}"`)
    } finally {
      setBusy(false)
      setMovingTo(null)
    }
  }

  // A scene opens with the character speaking first: a little narration, then her line. Asked for once a scene;
  // if it cannot be had, the player may simply speak first.
  const openedFor = useRef<Scene['beats'] | null>(null)
  useEffect(() => {
    if (!scene || busy || scene.messages.length > 0 || openedFor.current === scene.beats) return
    openedFor.current = scene.beats
    void send(undefined, scene, state)
  }, [scene, busy])

  /**
   * Says something else in place of what he said some turns back. The game and the scene go
   * back to how they stood before that line, with everything since undone (time that passed,
   * where the scene went, who left, what was learned or given), and the scene goes on from
   * the new line. Nothing is undone until this is called: looking back is only looking.
   */
  function redoFrom(turnsBack: number, text: string) {
    const turn = turns[turns.length - turnsBack]
    if (!turn || busy) return
    const then = rewound(turn, state)
    setTurns(turns.slice(0, turns.length - turnsBack))
    setState(then)
    setEnded(false)
    void send(text, turn.scene, then)
  }

  /** Turns up for a plan made earlier, which opens a scene with everyone it was made with. */
  function keep(appointmentId: string, at: GameState = state) {
    // A birth is its own scene, set by the game and not opened like any other: nobody walks in on it.
    if (at.appointments.find((plan) => plan.id === appointmentId)?.kind === 'birth') {
      const born = attendBirth(content, at, appointmentId)
      setNotice('')
      setState(born.state)
      setScene(born.scene)
      return
    }
    // So is being shown the house: it is his as the scene opens, with the nanny in it and the officer who brought him.
    if (at.appointments.find((plan) => plan.id === appointmentId)?.kind === 'viewing') {
      const shown = attendViewing(content, at, appointmentId)
      setNotice('')
      setState(shown.state)
      setScene(shown.scene)
      return
    }
    // And being shown the way down: it is his to take from the scene on.
    if (at.appointments.find((plan) => plan.id === appointmentId)?.kind === 'below') {
      const shown = attendDescent(content, at, appointmentId)
      setNotice('')
      setState(shown.state)
      setScene(shown.scene)
      return
    }
    const { state: after, appointment } = keepAppointment(content, at, appointmentId)
    setNotice('')
    begin({
      loveInterestId: appointment.loveInterestId,
      companionIds: appointment.companionIds,
      nsfw: false,
      beats: [{ activityName: appointment.title, locationName: placeName(at) }],
      messages: [],
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(at, appointment.loveInterestId, appointment.companionIds)
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
    setNotice('')
    // Done alone, there is no scene to tell him what it did: a toast does. With company, the scene's summary does.
    if (!result.scene) {
      const gains = playerGains({ stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: state.training, coursePoints: state.coursePoints }, result.state)
      setToast({ title: `${plan.title} · ${plan.hours} hour${plan.hours === 1 ? '' : 's'}`, gains })
    }
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

  /** The name of the place a state has him at. */
  const placeName = (at: GameState) => content.locations.find((l) => l.id === at.locationId)?.name

  /** Takes up the next thing on his timetable: the hours until it starts go by, he is taken there, and it begins. */
  function goTo(next: Upcoming, arrivedWith: string[] = []) {
    // The hours skipped on the way are not lost: they go on his focus, and a toast says what came of them as the next thing begins.
    const hours = next.time - state.time
    const worked = spendOnFocus(content, state, hours)
    if (worked !== state) {
      const gains = playerGains({ stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: state.training, coursePoints: state.coursePoints }, worked)
      setToast({ title: `Focus: ${focusName(state)} · ${hours} hour${hours === 1 ? '' : 's'}`, gains })
    }
    const there = arriveFor(worked, next)
    if (next.kind === 'class') attendClass(next.id, there, arrivedWith)
    else if (next.kind === 'exam') sit(next.id, there)
    else if (next.kind === 'work') work(there)
    else keep(next.id, there)
  }

  /** Goes straight to what an invitation in his DMs is for: it is accepted if it has not been, the hours until it starts go by, and it begins. */
  function goToInvite(loveInterestId: string, noteIndex: number) {
    const proposal = courierThread(state, loveInterestId)[noteIndex]?.proposal
    if (!proposal) return
    const accepted = answerInvite(content, state, loveInterestId, noteIndex, true)
    const plan = planFor(accepted, proposal)
    if (!plan) return
    setPanel(null)
    // Already under way, he walks in on it as it is; still to come, the wait is skipped.
    keep(plan.id, { ...accepted, time: Math.max(accepted.time, plan.time), locationId: plan.locationId, inOwnRoom: false })
  }

  /** Turns up for an examination: he is at the hall with its paper in front of him. There is no scene to it. */
  function sit(courseId: string, at: GameState = state) {
    const course = at.courses.find((c) => c.id === courseId)
    const kind = course && canSitExam(content, at, courseId).ok ? examNow(content, at, course)?.kind : undefined
    if (!course || !kind) return
    setState({ ...at, locationId: course.locationId, inOwnRoom: false })
    setScene(null)
    setNotice('')
    setExam({ courseId, kind })
  }

  /** Hands the paper in: the rest of the examination's time goes by, and the paper he is looking at comes back marked. */
  function handIn(courseId: string, answers: number[]) {
    setState(sitExam(content, state, courseId, answers).state)
  }

  /** Sits a class. With love interests in it, the class is a scene with the ones the player sits by. */
  function attendClass(courseId: string, at: GameState = state, arrivedWith: string[] = []) {
    const course = at.courses.find((c) => c.id === courseId)
    setState(attend(content, at, courseId))
    setNotice('')
    const [leadId, ...companionIds] = course ? classmates(at, course, undefined, arrivedWith) : []
    if (!course || !leadId) return
    const teacher = content.loveInterests.find((li) => li.id === course.teacherId)
    setScene({
      loveInterestId: leadId,
      companionIds,
      nsfw: false,
      beats: [
        {
          activityName: `${course.title} (${course.number}), a class taught by ${course.professor}`,
          locationName: placeName(at),
          description: `${course.professor} begins ${course.title}. ${course.description}`.trim(),
          direction:
            `You are in class together. The lecture runs its course as you talk and is over by the time on the ` +
            `clock, so by the end of this scene everyone is free to leave: to walk back to a room, or go on somewhere.`
        }
      ],
      messages: [],
      // The lecture is given by whoever teaches the course: under her own name if she is sitting in the scene, the professor's otherwise.
      lesson: {
        speaker: (teacher && [leadId, ...companionIds].includes(teacher.id) ? teacher.name.split(' ')[0] : undefined) ?? course.professor,
        course: `${course.title} (${course.number})`,
        about: course.description,
        // What today's class is on, from before it was counted as one he has sat.
        topic: lessonTopic(content, at, course)
      },
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(at, leadId, companionIds)
    })
  }

  /** Clocks in for the shift that is under way: a scene at work, paid when it ends. */
  function work(at: GameState = state) {
    const result = startShift(content, at)
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

  /**
   * Something of his is used in a scene: on himself, or on someone in it. Nothing is said aloud for it. What it
   * changes, the game works out again from the state with her next reply.
   */
  function useInScene(name: string, after: GameState, onId?: string) {
    if (after === state) return
    setState(after)
    setPanel(null)
    setAgreed(onId ? `${name}: used on ${firstNames(content, [onId])}.` : `${name}: used.`)
  }

  /** Turns the finished scene into a memory and shows what came of it. */
  async function finishScene() {
    if (!scene || busy) return
    setBusy(true)
    try {
      const result = await window.api.summarize({ state, scene })
      // Someone taken with him who never got round to it gives him her Bloomr as they part.
      const parting = scene.npc ? [] : sceneWitnesses(scene).filter((id) => offersContact(content, state, id))
      if (parting.length > 0) {
        setState((current) => parting.reduce(giveContact, current))
        setNotice(`${firstNames(content, parting)} gave you ${parting.length > 1 ? 'their' : 'her'} Bloomr before you parted.`)
      }
      // How each of them feels about him now is what she made of the scene, and nothing else moves it.
      // A scene in which they had sex is counted for each of them, once.
      const moved = addIntimacy(Object.entries(result.feelings).reduce((current, [id, feelings]) => applyFeelings(content, current, id, feelings), state), result.intimate)
      // What he paid for along the way comes out of his pocket now.
      const felt = applySpending(moved, result.spending)
      // With an eye for taste, time with her tells him one more thing she likes or does not, besides what came out in the talk.
      const noticed =
        !scene.npc && hasSkill(content, state, 'tastes')
          ? sceneWitnesses(scene).flatMap((id) => {
              const factId = intuitTaste(content, state, id, result.revealed.filter((r) => r.loveInterestId === id).map((r) => r.factId))
              return factId ? [{ loveInterestId: id, factId }] : []
            })
          : []
      const revealed = [...result.revealed, ...noticed]
      setSummary({
        scene,
        outcome:
          sceneOutcome(content, scene.baseline, felt, scene.loveInterestId),
        companions: sceneWitnesses(scene).filter((id) => id !== scene.loveInterestId).map((id) => ({
          id,
          outcome: sceneOutcome(content, scene.baseline, felt, id, true)
        })),
        memories: result.memories,
        levels: result.levels,
        spending: result.spending,
        // What came out about each of them over the scene, and what changed between them.
        learned: [
          ...result.rapport.map((c) => {
            const pair = firstNames(content, [c.a, c.b])
            return c.relation === 'neither' ? `${pair} are no longer ${relationBetween(state, c.a, c.b)}` : `${pair} are now ${c.relation}`
          }),
          ...revealed.map((r) => describeLearned(content, r.loveInterestId, r.factId)).filter((line): line is string => line !== undefined)
        ],
        reasons: Object.fromEntries(Object.entries(result.feelings).map(([id, feelings]) => [id, feelings.reason])),
        memoryError: result.error
      })
      // Everyone who was there keeps their own memory of it.
      // Sharing a scene also brings the love interests in it closer to each other.
      const after = sceneWitnesses(scene).reduce(
        (current, id) => (result.memories[id] ? addMemory(current, id, result.memories[id], result.levels[id]) : current),
        // A shift is paid for when it is over.
        payShift(content, growTies(content, felt, sceneCast(scene)), scene)
      )
      // What she let out goes into what the player knows of her, and what changed between the love interests is kept.
      const known = revealed.reduce((next, r) => revealFacts(content, next, r.loveInterestId, [r.factId]), after)
      const awake = result.rapport.reduce((next, c) => setRelation(next, c.a, c.b, c.relation), known)
      // They fell asleep where they were: the night goes by, and he wakes there in the morning, rested.
      const settled = sleepingOver ? sleepOver(content, awake) : awake
      setSleepingOver(false)
      setState(settled)
      // As a scene ends, one of those whose Bloomr he has may write to him. It is written in the background, and turns up on his phone when it is.
      const writerId = sceneEndWriter(content, settled, sceneWitnesses(scene))
      if (writerId) {
        const { weatherSeed } = settled
        window.api
          .courier({ state: settled, loveInterestId: writerId, note: true })
          .then((sent) => {
            if (sent.text)
              setState((current) =>
                current.weatherSeed === weatherSeed
                  ? (sent.attending ?? []).reduce((next, said) => addEventGoers(next, said.eventId, said.ids), addNote(current, writerId, { from: 'them', text: sent.text, proposal: sent.proposal, read: false }))
                  : current
              )
          })
          .catch(() => undefined)
      }
      const pay = shiftPay(content, state, scene)
      const shiftJob = jobOf(content, scene.shift?.jobId)
      const bonus = shiftJob ? Math.round(payBonus(content, state, shiftJob) * 100) : 0
      setScene(null)
      setEnded(false)
      setLastPrompt('')
      setNotice(pay > 0 ? `You were paid $${pay} for your shift${bonus > 0 ? `, ${bonus}% of it over the rate for your stats` : ''}.` : '')
      setPanel(null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setPanel(null)
  // Escape opens the menu from anywhere in the game. With a dialog up it closes that dialog and no more. At the card
  // table it does nothing, since leaving mid-hand would take back what he had put in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || document.querySelector('.overlay, .lightbox, .poker')) return
      setPanel({ kind: 'menu' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Stable, so the courier panel's effects don't re-run on every render.
  const applyUpdate = useCallback((update: (current: GameState) => GameState) => setState(update), [])

  return (
    <>
      {content.coursework && state.enrolment === null ? (
        <CoursesView
          content={content}
          state={state}
          onEnrol={(enrolment) => setState({ ...state, enrolment })}
          toured={state.flags[COURSES_TOURED] === true}
          onToured={() => setState((current) => ({ ...current, flags: { ...current.flags, [COURSES_TOURED]: true } }))}
        />
      ) : content.orientation?.intro && state.orientationStep === 0 && !state.flags[WELCOMED] ? (
        <IntroView
          content={content}
          state={state}
          intro={content.orientation.intro}
          onDone={() => setState((current) => ({ ...current, flags: { ...current.flags, [WELCOMED]: true } }))}
        />
      ) : state.expedition.run ? (
        <ExpeditionView content={content} state={state} onChange={setState} />
      ) : summary ? (
        <SummaryView
          content={summary.scene.npc ? withNpc(content, summary.scene.loveInterestId) : content}
          state={state}
          summary={summary}
          backgroundId={summary.scene.viewId ?? backgroundId}
          onContinue={(edited, levels) => {
            // The memories were kept as written when the scene ended, so that nothing is lost
            // if the game is closed here. What the player has reworded, or made more or less important, takes their place now.
            setState((current) =>
              sceneWitnesses(summary.scene).reduce(
                (next, id) => amendMemory(next, id, summary.memories[id] ?? '', edited[id] ?? '', levels[id]),
                current
              )
            )
            setSummary(null)
            // They left together for his class or his plan: with the scene settled, that is what comes next.
            const shared = walkingWith ? sharedUpcoming(content, state, walkingWith) : undefined
            setWalkingWith(null)
            if (shared) goTo(shared.next, shared.sharedBy)
          }}
        />
      ) : scene ? (
        <SceneView
          content={cast}
          state={state}
          scene={scene}
          backgroundId={scene.viewId ?? backgroundId}
          busy={busy}
          movingTo={movingTo}
          notice={notice}
          aside={aside}
          onDismissAside={() => setAside('')}
          ended={ended}
          onSend={send}
          onNameChild={(name) => {
            // With no name given he keeps hers. Either way it is settled, and he is not asked again.
            const named = renameNewborn(content, state, scene, name)
            setState(named.state)
            setScene({ ...named.scene, nameSettled: true })
          }}
          turnsKept={turns.length}
          onRedo={redoFrom}
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
          onAnimationEnd={() => setScene((current) => current && { ...current, animationId: undefined, animationOf: undefined })}
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
      ) : isGameOver(content.calendar, state.time) ? (
        // The last day of the calendar is over: what became of him.
        <EpilogueView content={content} state={state} onExit={onExit} />
      ) : panel?.kind === 'poker' && content.poker ? (
        <PokerView
          content={content}
          state={state}
          onSettle={(hand) => setState((current) => settlePokerHand(current, hand))}
          onLeave={(hands) => {
            setState((current) => leaveTable(content, current, hands))
            setPanel(null)
          }}
        />
      ) : (
        <DayView
          content={content}
          state={state}
          partnerId={partnerId}
          backgroundId={backgroundId}
          onActivity={doActivity}
          onGoTo={goTo}
          onEndDay={endDay}
          onOrientation={attendNext}
          onTalkNpc={talkNpc}
          busy={busy}
          onPropose={propose}
          onOuting={setOuting}
          onFocus={(focus) => applyUpdate((current) => setFocus(current, focus))}
          onOpen={setPanel}
        />
      )}

      {panel?.kind === 'gifts' && scene && partner && (
        <Dialog title="Your bag" onClose={close} sounds={['bagOpen', 'bagClose']}>
          <Bag
            content={content}
            state={state}
            busy={busy}
            company={sceneCast(scene).flatMap((id) => {
              const who = content.loveInterests.find((li) => li.id === id)
              return who ? [{ id, name: who.name.split(' ')[0] }] : []
            })}
            onGive={give}
            onUseItem={(itemId, onId) => useInScene(content.items.find((item) => item.id === itemId)?.name ?? itemId, useItem(content, state, itemId, onId), onId)}
            onAbility={(skillId, onId) => useInScene(content.skills.find((skill) => skill.id === skillId)?.name ?? skillId, useAbility(content, state, skillId, onId), onId)}
          />
        </Dialog>
      )}

      {/* Out of a scene, a thing is used on himself: what is for a woman waits until he is with her. */}
      {panel?.kind === 'bag' && !scene && (
        <Dialog title="Your bag" onClose={close} sounds={['bagOpen', 'bagClose']}>
          <Bag content={content} state={state} onUseItem={(itemId) => setState((current) => useItem(content, current, itemId))} onAbility={(skillId) => setState((current) => useAbility(content, current, skillId))} />
        </Dialog>
      )}

      {exam && examCourse && !scene && (
        <ExamDialog key={`${exam.courseId}:${exam.kind}`} content={content} state={state} course={examCourse} kind={exam.kind} onHandIn={(answers) => handIn(examCourse.id, answers)} onClose={() => setExam(null)} />
      )}

      {outing && !scene && (
        <OutingDialog content={content} state={state} outing={outing} onGo={go} onClose={() => setOuting(null)} />
      )}

      {panel?.kind === 'courier' && (
        <PhonePanel content={content} state={state} onChange={applyUpdate} onClose={close} initialId={panel.id} onGoToInvite={scene || summary ? undefined : goToInvite} canAct={!scene && !summary} />
      )}
      <div className="toasts">
      {!scene && notice && (
        <div className="toast plain" role="status" onClick={() => setNotice('')}>
          <span>{notice}</span>
        </div>
      )}
      {!scene && aside && (
        <div className="toast plain" role="status" onClick={() => setAside('')}>
          <span>{aside}</span>
        </div>
      )}
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          <strong>{toast.title}</strong>
          {toast.gains.length === 0 && <span>Nothing came of it.</span>}
          {toast.gains.map((g) => (
            <span key={g.label} className={g.to > g.from ? 'up' : 'down'}>
              <span className="caps">{g.label}</span> {g.to > g.from ? '+' : '−'}
              {Math.abs(Math.round((g.to - g.from) * 10) / 10)}
              <i>
                {Math.round(g.from * 10) / 10} → {Math.round(g.to * 10) / 10}
              </i>
            </span>
          ))}
        </div>
      )}
      </div>
      {panel?.kind === 'endDay' && (
        <Dialog title="End the day" onClose={close} narrow noClose>
          <p>You turn in and sleep until 06:00 tomorrow. Anything still to come today is let go.</p>
          {dayMisses(content, state).length > 0 && (
            <div className="notice">
              <strong>You would miss:</strong>
              <ul className="blockers">
                {dayMisses(content, state).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="outing-options">
            <button
              onClick={() => {
                setState(sleep(content, state))
                close()
              }}
            >
              {dayMisses(content, state).length > 0 ? 'Sleep anyway' : 'Sleep'}
            </button>
            <button className="secondary" onClick={close}>
              Stay up
            </button>
          </div>
        </Dialog>
      )}
      {panel?.kind === 'help' && <HelpPanel content={content} state={state} onClose={close} />}
      {panel?.kind === 'menu' && (
        <Dialog title="Menu" onClose={close} narrow noClose>
          <div className="pause-menu">
            <button onClick={close}>Continue</button>
            <button className="secondary" onClick={() => setPanel({ kind: 'save' })}>
              Save
            </button>
            <button className="secondary" onClick={() => setPanel({ kind: 'load' })}>
              Load
            </button>
            <button className="secondary" onClick={() => setPanel({ kind: 'settings' })}>
              Settings
            </button>
            <button className="secondary" onClick={onExit}>
              Exit to title
            </button>
            <button className="secondary" onClick={() => window.close()}>
              Quit to desktop
            </button>
          </div>
        </Dialog>
      )}
      {panel?.kind === 'settings' && <SettingsPanel onClose={close} />}
      {(panel?.kind === 'save' || panel?.kind === 'load') && (
        <SavesPanel
          content={content}
          mode={panel.kind}
          current={savable(state, scene, turns)}
          onLoad={onLoad}
          onClose={close}
        />
      )}
      {panel?.kind === 'calendar' && (
        <CalendarPanel content={content} state={state} onChange={setState} onClose={close} />
      )}
      {panel?.kind === 'below' && (
        <PartyDialog
          content={content}
          state={state}
          onGo={(partyIds, depth) => {
            setState(startRun(content, state, partyIds, depth))
            setPanel(null)
            setNotice('')
          }}
          onClose={close}
        />
      )}
      {panel?.kind === 'house' && <HousePanel content={content} state={state} onChange={applyUpdate} onClose={close} />}
      {panel?.kind === 'map' && (
        <MapPanel
          content={content}
          state={state}
          // In a scene, or while one is being summed up, the map is only to be looked at.
          onTravel={
            scene || summary
              ? undefined
              : (locationId) => {
                  setState(travel(content, state, locationId))
                  setNotice('')
                  close()
                }
          }
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
