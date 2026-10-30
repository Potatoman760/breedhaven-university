import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptBond,
  ambienceAt,
  songAt,
  attendEventPart,
  leaveTable,
  settlePokerHand,
  soundCues,
  acceptProposal,
  schedulePlan,
  type ScheduleRequest,
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
  toldOf,
  skillLevel,
  devotedMothers,
  settleMissedDates,
  bookTrip,
  comeHome,
  nextTripPart,
  tripChatId,
  addGroupNote,
  type BanterLine,
  spriteFor,
  wornOutfit,
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
  practiceRun,
  nextMeeting,
  eventGate,
  toggleRelic,
  useRelic,
  relicsHeld,
  canUseRelic,
  cutsceneBeats,
  movingInScene,
  startRun,
  sendHousingOffer,
  settleHousehold,
  conceive,
  attendOrientation,
  courierRound,
  courierRoundDue,
  dressForDay,
  keepDayOutfits,
  MAX_TURNS_KEPT,
  packTurns,
  rewound,
  unpackTurns,
  type Turn,
  applySpending,
  playerGains,
  finishDrill,
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
  noteTogether,
  arrivalCue,
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
  addPlayerPost,
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
  bringPresents,
  sceneCast,
  firstNames,
  sceneOutcome,
  talkToNpc,
  withNpc,
  inMasks,
  newStrangers,
  withStrangers,
  nextDance,
  guessable,
  guessDancer,
  endMasquerade,
  startOuting,
  type Outing,
  toDate,
  travel,
  attendSociety,
  locationOf,
  societyOf,
  fairNow,
  fairOpensLater,
  visitFair,
  helloIntro,
  sayHelloAll,
  canTalkAtFair,
  stopAtTable,
  rivalryDue,
  sawRivalry,
  joinSociety,
  societyPeople
} from '../../shared/game'
import { MAX_SCENE_CAST, type Activity, type ContentPack, type EventPart, type ExamKind, type GameState, type Intro, type PostPlan, type Proposal, type Relic, type RelicUse, type Scene } from '../../shared/model'
import { CHAT_CANCELLED } from '../../shared/ipc'
import { AUTO_SLOT_ID, type SaveData } from '../../shared/saves'
import { errorMessage } from './errors'
import { play, playSong, setAmbience, useSounds } from './sound'
import { onLanguageContent } from './language'
import { t } from '../../shared/i18n'
import { EpilogueView } from './ui/EpilogueView'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { TitleScreen } from './TitleScreen'
import { CalendarPanel } from './ui/CalendarPanel'
import { AgeGate } from './ui/AgeGate'
import { PhonePanel } from './ui/PhonePanel'
import { HelpPanel } from './ui/HelpPanel'
import { BelowTour } from './ui/BelowTour'
import { Bag } from './ui/Bag'
import { HouseView } from './ui/house/HouseView'
import { CoursesView } from './ui/CoursesView'
import { DayView } from './ui/DayView'
import { GrandButton } from './ui/GrandButton'
import { isMouseBack } from './mouseBack'
import { GearIcon, JobIcon, LoadIcon, PowerIcon, SaveIcon } from './ui/icons'
import { Dialog } from './ui/Dialog'
import { FairView } from './ui/FairView'
import { InterfaceTour } from './ui/InterfaceTour'
import { MapPanel } from './ui/MapPanel'
import { OutingDialog } from './ui/OutingDialog'
import { ExamDialog } from './ui/ExamDialog'
import { ExpeditionView } from './ui/ExpeditionView'
import { IntroView } from './ui/IntroView'
import { PokerView } from './ui/PokerView'
import { MiniGameView } from './ui/MiniGameView'
import { PartyDialog } from './ui/PartyDialog'
import type { Panel } from './ui/panels'
import { SceneView } from './ui/SceneView'
import { RelicMoment } from './ui/RelicMoment'
import { DawnTransition } from './ui/DawnTransition'
import { DateDialog } from './ui/DateDialog'
import { LanternRelease, type LanternDate } from './ui/LanternRelease'
import { TripMoment, type TripCompanion, type TripMomentKind } from './ui/TripMoment'
import { MasqueradeGuess } from './ui/MasqueradeGuess'
import { TripBooking } from './ui/TripBooking'
import { SummaryView, type SceneSummary } from './ui/SummaryView'

// The content editor, where a player makes characters and subjects of his own: loaded only when it is opened.
const ContentEditor = lazy(() => import('./ui/editor/ContentEditor').then((module) => ({ default: module.ContentEditor })))

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
  // A change of language brings the content again, translated.
  useEffect(() => onLanguageContent(setContent), [])
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
  if (error) return <main className="title">{t('shell.app.loadFailed', { error })}</main>
  if (!content) return <main className="title">{t('shell.app.loading')}</main>

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

  if (editing)
    return (
      <Suspense fallback={null}>
        <ContentEditor content={content} onContent={setContent} onClose={() => setEditing(false)} />
      </Suspense>
    )
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

// Kept in the save once he has been shown round the course planner, once he has been welcomed, and once he has been shown round his day, so that each is shown once a game.
const COURSES_TOURED = 'toured-courses'
const WELCOMED = 'welcomed'
const INTERFACE_TOURED = 'toured-interface'

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
  // A picture he is taking in a scene, being written and drawn.
  const [photoBusy, setPhotoBusy] = useState(false)
  // Where the scene is on its way to, while the reply that takes it there is still being written.
  const [movingTo, setMovingTo] = useState<string | null>(null)
  useEffect(() => window.api.onSceneMoving(setMovingTo), [])
  // Those he set off with for the next thing on his timetable as the scene ended: once the scene is settled, that is where he goes.
  const [walkingWith, setWalkingWith] = useState<string[] | null>(null)
  // The scene ended with them going to sleep where they were: once it is settled, he wakes there in the morning.
  const [sleepingOver, setSleepingOver] = useState(false)
  // The night going by, played once he has slept: whichever way he came to.
  const [dawn, setDawn] = useState(false)
  const endDawn = useCallback(() => setDawn(false), [])
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
  // Coming to a place dressed for a festival with a song of its own, the song plays once through: each time he arrives.
  const arrival = `${state.locationId}:${toDate(content.calendar, state.time).dayIndex}`
  useEffect(() => {
    const tune = songAt(content, state, content.locations.find((l) => l.id === state.locationId))
    if (tune) playSong(tune)
  }, [arrival])
  useEffect(() => () => setAmbience(undefined), [])
  // Outside a scene, a notice is a toast too, since nothing else on the screen would be read: up for a while, and gone at a click.
  useEffect(() => {
    if (!notice || scene) return
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, scene])
  const [lastPrompt, setLastPrompt] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  // A relic just used in the scene, shown rising over it before the scene goes on.
  const [relicMoment, setRelicMoment] = useState<(Relic & { use: RelicUse }) | null>(null)
  const endRelicMoment = useCallback(() => setRelicMoment(null), [])
  // Confirmation of the plan just accepted, shown until the next line is said.
  const [agreed, setAgreed] = useState('')
  // The line that could not be answered, to send again as it was. Offered only beside the notice that said so.
  const [failed, setFailed] = useState<{ notice: string; text?: string; said: Scene; when: GameState; ask?: string; offered?: Proposal } | null>(null)
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
      .catch((error) => setNotice(t('shell.app.autosaveFailed', { error: errorMessage(error) })))
  }, [state, scene])

  // Whoever is in a scene has been met, from the moment it begins or she walks into it. One he had never met is a stranger
  // in it until her name is said.
  useEffect(() => {
    if (!scene) return
    const fresh = newStrangers(content, state, scene)
    if (fresh.length > 0) setScene((current) => current && { ...current, strangers: [...new Set([...(current.strangers ?? []), ...fresh])] })
    setState((current) => meet(content, current, sceneCast(scene)))
  }, [content, scene])

  // On a day of presents, each woman brings him one the first time they meet: it is in his bag, and she hands it over in the scene.
  useEffect(() => {
    if (!scene || scene.npc) return
    const brought = bringPresents(content, state, sceneCast(scene))
    if (brought.state === state) return
    setState((current) => bringPresents(content, current, sceneCast(scene)).state)
    if (brought.presents.length === 0) return
    setScene((current) => current && { ...current, presents: [...(current.presents ?? []), ...brought.presents] })
    setNotice(brought.presents.map((present) => t('shell.app.gavePresent', { who: firstNames(content, [present.fromId]), item: content.items.find((item) => item.id === present.itemId)?.name ?? t('shell.app.aPresent') })).join(' '))
  }, [content, scene, state])

  // As time goes by, the shifts that have ended are counted: worked, or missed and held against him.
  useEffect(() => {
    setState((current) => settleShifts(content, current))
  }, [content, state.time])

  // As time goes by, a plan whose hours have passed without his turning up is held against him by whoever was waiting.
  useEffect(() => {
    const { missed } = settleAppointments(content, state)
    if (missed.length === 0) return
    setState((current) => settleAppointments(content, current).state)
    setNotice(missed.map((plan) => t('shell.app.missedPlan', { plan: plan.title, who: firstNames(content, attendees(plan)) })).join(' '))
  }, [content, state.time, state.appointments])

  // The small hours are for sleep and nothing else: whenever the clock stands in them and he is not in the middle of something, he sleeps till morning.
  useEffect(() => {
    if (scene || summary || !isSleepTime(content, state) || isGameOver(content.calendar, state.time)) return
    setState((current) => (isSleepTime(content, current) ? sleep(content, current) : current))
    setDawn(true)
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
  // As a day begins everyone is dressed for it, and keeps it on until the next.
  useEffect(() => {
    if (!idle) return
    const dressed = dressForDay(content, state)
    if (dressed !== state) setState(dressed)
  }, [idle, content, state])
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
  // arrives, and goes up at its own hour. A plan is tried once each time the game is run: one that fails waits for the next. Why it
  // failed is said at the top of the feed and nowhere else, since many players never set up ComfyUI, and only for the game and day it
  // was. Without a ComfyUI that answers, nothing is written, so no LLM call is spent on a post that cannot be.
  const [feedError, setFeedError] = useState<{ seed: number; day: number; message: string } | null>(null)
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
    const day = toDate(content.calendar, state.time).dayIndex
    const said = (message: string | undefined) => setFeedError(message ? { seed: weatherSeed, day, message } : null)
    void (async () => {
      const comfy = await window.api.comfy.getSettings()
      const reached = await window.api.comfy.test(comfy.baseUrl)
      if (!reached.ok) return said(t('shell.app.feedNoComfy', { message: reached.message }))
      const { drafts, error, shortfall } = await window.api.feed({ state, plans })
      let failed = error ?? shortfall ?? (drafts.length < plans.length ? t('shell.app.feedUnwritten', { missing: plans.length - drafts.length, total: plans.length }) : undefined)
      for (const draft of drafts) {
        const date = toDate(content.calendar, draft.time)
        const made = await window.api.feedPicture({ authorId: draft.authorId, name: `bloomr-day-${date.dayIndex + 1}-${date.hour}`, prompt: draft.prompt })
        // A post is its picture: one that could not be drawn is not made. Nor is one whose game has been left since.
        if (made.image) setState((current) => (current.weatherSeed === weatherSeed ? postMade(current, { ...draft, image: made.image ?? undefined }) : current))
        else failed ??= t('shell.app.feedUndrawn', { error: made.error ?? t('shell.app.feedNothingBack') })
      }
      said(failed && t('shell.app.feedSome', { failed }))
    })()
      .catch((error: unknown) => said(t('shell.app.feedFailed', { message: (error as Error).message })))
      .finally(() => {
        drawing.current = false
        setDrawn((count) => count + 1)
      })
  }, [state.feedPlans, state.weatherSeed, over, drawn])
  // In a scene with an NPC, the NPC stands among the characters for every screen that shows the scene.
  // At a masked ball the lead is in her mask, and goes by its name until he has named her. Whoever he is meeting for the
  // first time is "???" on screen until her name is said: `cast` keeps her name, for telling who speaks a line.
  const cast = scene?.npc ? withNpc(content, scene.loveInterestId) : scene ? inMasks(content, scene, true) : content
  const shownCast = withStrangers(cast, scene)
  const partner = cast.loveInterests.find((li) => li.id === partnerId)
  const examCourse = exam ? state.courses.find((course) => course.id === exam.courseId) : undefined

  // A few days before a child is due, the hour of its birth is set and goes on his calendar. Only while nothing else is going on:
  // a turn taken back keeps what was written to him, and would have her write twice.
  useEffect(() => {
    if (!idle || over || scheduleBirths(content, state).state === state) return
    setState((current) => scheduleBirths(content, current).state)
  }, [idle, over, state, content])

  // Home from a trip once the last of it is done: the drive back, and he is home.
  useEffect(() => {
    if (!idle) return
    const home = comeHome(content, state)
    if (home.state === state) return
    setState(home.state)
    if (home.companions.length > 0) {
      const ids = home.companions
      setTripMoment({ kind: 'drive-home', companions: gladOf(ids, state), lines: () => window.api.momentLines({ state, ids, moment: 'drive-home' }).then((got) => got.lines), then: () => undefined })
    }
  }, [idle, state, content])

  // A date he let go by: once its hour is past, every woman with a claim on him minds that he took nobody.
  useEffect(() => {
    if (!idle) return
    const missed = settleMissedDates(content, state)
    if (missed.state === state) return
    setState(missed.state)
    if (missed.hurt.length > 0) setNotice(t('shell.app.tookNobody', { event: missed.eventName, who: firstNames(content, missed.hurt), count: missed.hurt.length }))
  }, [idle, state, content])

  // Where he has learnt it, the mothers of his children want him as much as a woman can: kept so between scenes.
  useEffect(() => {
    if (!idle || devotedMothers(content, state) === state) return
    setState((current) => devotedMothers(content, current))
  }, [idle, state, content])

  // Getting far enough in a course teaches him something: he is told once, when it happens.
  useEffect(() => {
    if (!idle) return
    const earned = newSkills(content, state)
    if (earned.length === 0) return
    setState((current) => tellSkills(current, earned.flatMap(toldOf)))
    // One he already had and has taken further is improved, not new.
    setNotice(earned.map((skill) => t('shell.app.skillEarned', { improved: skill.level === 2 && state.skillsTold.includes(skill.id), name: skill.level === 2 ? t('shell.common.skillTwo', { name: skill.name }) : skill.name, description: skill.description })).join(' '))
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
    setNotice(missed.map(({ motherId, child }) => t('shell.app.birthMissed', { mother: firstNames(content, [motherId]), daughter: child.daughter === true, child: child.name })).join(' '))
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

  // Two of them in a scene together, however they came to be (brought along, walking in, a class): from then on he
  // knows what they are to each other.
  useEffect(() => {
    if (!scene || scene.npc) return
    const ids = sceneCast(scene)
    if (ids.length > 1) setState((current) => noteTogether(current, ids))
  }, [scene?.loveInterestId, scene?.companionIds.join(',')])

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
   * let a caller pass a scene and state it has just changed. A plan `offered` by the game is put to him with the reply,
   * whatever the reply makes of it.
   */
  async function send(text?: string, said: Scene | null = scene, when: GameState = state, ask?: string, offered?: Proposal) {
    if (!said) return
    // Kept so that the line, and whatever it leads to, can be taken back.
    if (text !== undefined) setTurns((kept) => [...kept, { state: when, scene: said, text }].slice(-MAX_TURNS_KEPT))
    // If someone was on her way, this is when she arrives: before the line is answered, so the answer is hers.
    const arrival = dramaDue(content, when, said) ? fireDrama(content, when, said) : undefined
    const from = arrival?.scene ?? said
    const at = arrival?.state ?? when
    if (arrival) setState((current) => ({ ...current, dramaDay: arrival.state.dramaDay }))
    // The view the player has picked goes along, so the character knows exactly where they are.
    // Someone walking in as he speaks is told to the model beside his line, where it is not lost among the rest.
    // And what he is asking, when the line was one of the text box's suggestions.
    // And what a relic he has just used has done.
    const cue = [arrival && from.drama ? arrivalCue(content, from.drama) : undefined, ask].filter(Boolean).join(' ') || undefined
    // Whoever he is meeting for the first time is marked before her first reply is asked for, so that she is told to say her name in it.
    const strangers = newStrangers(content, at, from)
    const asked: Scene = {
      ...from,
      ...(strangers.length > 0 && { strangers: [...(from.strangers ?? []), ...strangers] }),
      backgroundId: from.viewId ?? backgroundId ?? from.backgroundId,
      messages: text === undefined ? from.messages : [...from.messages, { role: 'user', content: text, ...(cue && { cue }) }]
    }
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
      if (stopped.length > 0) setAgreed(t('shell.app.stoppedControl', { who: firstNames(content, stopped), count: stopped.length }))
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
        setAgreed(t('shell.app.planAdded', { plan: agreedTo.title, who: firstNames(content, attendees(agreedTo)), when: describeWhen(content, agreedTo.time) }))
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
            // One the game found for what he asked is put to him whatever she made of it.
            proposal: offered ?? response.proposal ?? (response.proposalAccepted || (asked.proposal && asked.proposal.time <= at.time) ? undefined : asked.proposal),
            bondProposal: response.bondProposal,
            conceived: [...new Set([...asked.conceived, ...conceived])]
          },
          response.look
        ), response.looks), response.comfort, skillLevel(content, at, 'comfort') === 2 ? 2 : 1))
      )
      setRolls(response.rolls)
      // Whoever gave him her Bloomr can be messaged from now on.
      const given = response.contacts.filter((id) => !hasContact(at, id))
      if (given.length > 0) setState((current) => given.reduce(giveContact, current))
      // What he found out about her, and what changed between the love interests themselves, is settled when the scene is over.
      setLearned([
        ...given.flatMap((id) => {
          const li = content.loveInterests.find((c) => c.id === id)
          return li ? [t('shell.app.gaveBloomr', { who: li.name.split(' ')[0], handle: handleOf(li) })] : []
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
      if (!errorMessage(error).includes(CHAT_CANCELLED)) {
        const told = text === undefined ? errorMessage(error) : t('shell.app.lineWas', { error: errorMessage(error), text })
        setNotice(told)
        // Sent again, it goes with whatever was told beside it, someone arriving included: she has arrived by now.
        setFailed({ notice: told, text, said: from, when: at, ask: cue, offered })
      }
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
    // A present due today is put on the scene first, for her to open with: the scene comes back here once it is.
    if (!scene.npc && bringPresents(content, state, sceneCast(scene)).presents.length > 0) return
    openedFor.current = scene.beats
    void send(undefined, scene, state)
  }, [scene, busy])

  /**
   * Says something else in place of what he said some turns back. The game and the scene go
   * back to how they stood before that line, with everything since undone (time that passed,
   * where the scene went, who left, what was learned or given), and the scene goes on from
   * the new line. Nothing is undone until this is called: looking back is only looking.
   */
  function redoFrom(turnsBack: number, text: string, cue?: string) {
    const turn = turns[turns.length - turnsBack]
    if (!turn || busy) return
    const then = rewound(turn, state)
    setTurns(turns.slice(0, turns.length - turnsBack))
    setState(then)
    setEnded(false)
    void send(text, turn.scene, then, cue)
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
      // The nanny tells him first how a child does in the house, and then he can ask her what he likes.
      if (shown.cutscene) introThenScene(shown.cutscene, shown.scene)
      else setScene(shown.scene)
      return
    }
    // And being shown the way down: what she has to tell him, and then how a way down is gone about.
    if (at.appointments.find((plan) => plan.id === appointmentId)?.kind === 'below') {
      const shown = attendDescent(content, at, appointmentId)
      setNotice('')
      setState(shown.state)
      setCutscene({ intro: shown.cutscene, then: () => setBelowTour(true) })
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
      planned: true,
      outing: true,
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
    // Done alone, there is no scene to tell him what it did: a toast does. With company, the scene's summary does. A drill tells it when its game is over.
    if (!result.scene && !result.state.drill) {
      const gains = playerGains({ stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: state.training, coursePoints: state.coursePoints }, result.state)
      setToast({ title: t('shell.app.outingToast', { plan: plan.title, hours: plan.hours }), gains })
    }
  }

  /** A drill's game is over, played or skipped: the stat is worked on by how it went, and a toast says what that did. */
  function finishMiniGame(score: number) {
    const drill = state.drill
    if (!drill) return
    const done = finishDrill(content, state, score)
    setState(done)
    const gains = playerGains({ stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: state.training, coursePoints: state.coursePoints }, done)
    setToast({ title: t('shell.app.outingToast', { plan: drill.title, hours: drill.hours }), gains })
  }

  /** Goes to the next part of orientation, which is a scene with whoever the player is put with, after its cutscene if it has one. */
  function attendNext() {
    const result = attendOrientation(content, state)
    setState(result.state)
    setNotice('')
    const begin = () => setScene(result.scene)
    if (result.cutscene) introThenScene(result.cutscene, result.scene)
    else begin()
  }

  // The cutscene a part of an event opens with, read before its scene begins.
  const [cutscene, setCutscene] = useState<{ intro: Intro; then: () => void } | null>(null)
  /**
   * Written lines, and then the scene they lead into. The scene is set at once, under the lines, so that her opening
   * is asked for while he reads them and is there, or nearly, when he is done: no loading screen between the two.
   */
  function introThenScene(intro: Intro, next: Scene | null) {
    setScene(next)
    setCutscene({ intro, then: () => undefined })
  }
  // The guide's walk through going below, once she has shown him the way down, and the practice fight she puts him in.
  const [belowTour, setBelowTour] = useState(false)
  // The first look round's second half, round the day's choices: only ever straight after the first half, never kept.
  const [dayTour, setDayTour] = useState(false)
  // Someone who has just moved in, waiting on the house to be put away for the hour with her in her new room.
  const [welcome, setWelcome] = useState<{ id: string; key: string } | null>(null)
  useEffect(() => {
    if (!welcome) return
    setWelcome(null)
    const shown = movingInScene(content, state, welcome.id, welcome.key)
    if (!shown) return
    setPanel(null)
    setNotice('')
    setState(shown.state)
    setScene(shown.scene)
  }, [welcome])
  const [practice, setPractice] = useState<GameState | null>(null)
  // The lanterns let go as the festival date begins, and what comes after them.
  const [lanterns, setLanterns] = useState<{ dates: LanternDate[]; lines: () => Promise<BanterLine[]>; then: () => void } | null>(null)
  const endLanterns = useCallback(() => {
    const after = lanterns?.then
    setLanterns(null)
    after?.()
  }, [lanterns])
  // A moment of a trip away, playing, and what comes after it.
  const [tripMoment, setTripMoment] = useState<{ kind: TripMomentKind; companions: TripCompanion[]; title?: string; lines?: () => Promise<BanterLine[]>; then: () => void } | null>(null)
  const endTripMoment = useCallback(() => {
    const after = tripMoment?.then
    setTripMoment(null)
    after?.()
  }, [tripMoment])
  // A trip being booked, once its lines are read.
  const [booking, setBooking] = useState<NonNullable<EventPart['booking']> | null>(null)
  // A date at an event, waiting on who he takes.
  const [dating, setDating] = useState<{ eventId: string; partId: string; title: string; most: number } | null>(null)

  // Away on a trip, it is one scene after another with nothing between: the next of it today is gone to at once, and
  // one tomorrow comes after a night slept where he is. Whatever is playing or open is let finish first.
  useEffect(() => {
    if (!idle || over || dawn || tripMoment || lanterns || booking || dating || cutscene || panel) return
    const next = nextTripPart(content, state)
    if (!next) return
    if (next.today) attendPart(next.event.id, next.part.id)
    else {
      setState((current) => sleep(content, current))
      setDawn(true)
    }
  }, [idle, over, dawn, tripMoment, lanterns, booking, dating, cutscene, panel, state, content])

  /**
   * Goes to a part of an event: he is taken there, reads its cutscene if it has one, and its scene begins. A date asks
   * first who he takes.
   */
  function attendPart(eventId: string, partId: string, dateIds?: string[]) {
    const event = content.calendar.events.find((one) => one.id === eventId)
    const part = event?.program.find((one) => one.id === partId)
    if (event && part?.date && !dateIds) {
      setDating({ eventId, partId, title: event.name, most: part.date.most })
      return
    }
    setDating(null)
    const result = attendEventPart(content, state, eventId, partId, dateIds)
    setState(result.state)
    setNotice(result.hurt.length > 0 ? t('shell.app.notAsked', { who: firstNames(content, result.hurt), count: result.hurt.length }) : '')
    // A booking part ends on the booking screen, not a scene.
    const begin = () => (result.booking ? setBooking(result.booking) : setScene(result.scene))
    // Whatever the part plays as it begins comes first, in turn, with those in it; then its lines, then the scene.
    const cast = result.scene ? sceneCast(result.scene) : []
    const dates = gladOf(cast, result.state)
    // A part that books a trip goes on to its booking screen once its lines are read; any other, under its lines, to its scene.
    const read = () => (!result.cutscene ? begin() : result.booking ? setCutscene({ intro: result.cutscene, then: begin }) : introThenScene(result.cutscene, result.scene))
    const lines = () => window.api.momentLines({ state: result.state, ids: cast, moment: 'lanterns' }).then((got) => got.lines)
    const played = result.animations.reduceRight<() => void>((then, kind) => {
      if (!result.scene) return then
      if (kind === 'lanterns') return () => setLanterns({ dates, lines, then })
      const drive = kind === 'drive-there'
      return () =>
        setTripMoment({
          kind,
          companions: dates,
          title: drive ? undefined : part?.name,
          lines: drive ? () => window.api.momentLines({ state: result.state, ids: cast, moment: 'drive-there' }).then((got) => got.lines) : undefined,
          then
        })
    }, read)
    played()
  }

  /** Those named, each in her glad sprite as she is dressed: for the moments played before a scene. */
  function gladOf(ids: string[], at: GameState) {
    return ids.flatMap((id) => {
      const li = content.loveInterests.find((one) => one.id === id)
      const image = li && spriteFor(li, wornOutfit(content, at, li), 'happy')
      return li && image ? [{ id, image, walk: li.walkSprite, stageHeight: li.stageHeight }] : []
    })
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
      setToast({ title: t('shell.app.focusToast', { focus: focusName(state), hours }), gains })
    }
    const there = arriveFor(worked, next)
    if (next.kind === 'class') attendClass(next.id, there, arrivedWith)
    else if (next.kind === 'society') attendMeeting(next.id, there, arrivedWith)
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
          activityName: t('shell.app.classActivity', { title: course.title, number: course.number, professor: course.professor }),
          locationName: placeName(at),
          description: t('shell.app.classDescription', { professor: course.professor, title: course.title, description: course.description }).trim(),
          direction: t('shell.app.classDirection')
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

  /** Goes to a meeting of a society of his: with members of it there, the meeting is a scene with them. */
  function attendMeeting(societyId: string, at: GameState = state, arrivedWith: string[] = []) {
    const society = societyOf(content, societyId)
    // Which of his meetings this is, read before it counts: what it is about, and whether it is one of the nights.
    const plan = nextMeeting(content, at, societyId)
    const after = attendSociety(content, at, societyId)
    setState(after)
    setNotice('')
    if (!society) return
    // Those of it who are there, and whoever came with him; the rest of the cast is left out, as in a class.
    const there = societyPeople(society).filter((id) => locationOf(content, at, content.loveInterests.find((li) => li.id === id)!) === society.locationId)
    const present = [...new Set([...there, ...arrivedWith])].slice(0, MAX_SCENE_CAST)
    if (present.length === 0) {
      setNotice(t('shell.app.nobodyCame', { society: society.name }))
      return
    }
    const { event, topic } = plan
    // One of its nights: how it goes for those who are there. Whoever it holds back leaves once it is set up, so that the
    // scene after is only those nothing holds back in it.
    const gate = event && eventGate(at, event, present)
    const [leadId, ...companionIds] = gate ? gate.free : present
    if (!leadId) {
      if (gate) setCutscene({ intro: gate.intro, then: () => undefined })
      return
    }
    // Everyone goes on from the setup as it left them: stripped, and with the face it gave her.
    const left = gate ? (cutsceneBeats(gate.intro, content.loveInterests).at(-1)?.looks ?? {}) : {}
    const meeting: Scene = {
      loveInterestId: leadId,
      companionIds,
      nsfw: event !== undefined,
      uninhibited: gate?.free,
      outfitId: left[leadId]?.outfitId,
      expression: left[leadId]?.expression,
      looks: Object.fromEntries(companionIds.filter((id) => left[id]).map((id) => [id, left[id]])),
      beats: [
        {
          activityName: event ? `${society.name}: ${event.name}` : t('shell.app.meetingActivity', { society: society.name }),
          locationName: placeName(at),
          description: society.description,
          direction: event && gate
            ? t('shell.app.nightDirection', { event: event.name, society: society.name, player: at.player.name, direction: gate.direction })
            : t('shell.app.meetingDirection', { society: society.name, player: at.player.name, tonight: Boolean(topic), topic: topic ?? '' })
        }
      ],
      messages: [],
      societyId,
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(at, leadId, companionIds)
    }
    // A night of its own is set up in writing first, and then it is his to play.
    if (gate) introThenScene(gate.intro, meeting)
    else setScene(meeting)
  }

  /** Goes to the societies' fair: he is taken to it, and it counts as been to. */
  function goToFair() {
    // Before it opens, the hours until it does go by first.
    const later = fairOpensLater(content, state)
    const event = fairNow(content, state) ?? later?.event
    if (!event?.locationId) return
    setState((current) => visitFair({ ...current, time: later?.at ?? current.time, locationId: event.locationId!, inOwnRoom: false }))
    setNotice('')
    setPanel({ kind: 'fair' })
  }

  /** Says hello to someone at the fair: her few lines, read as a cutscene, and back to the fair. It takes no time. */
  function sayHelloAtFair(ids: string[], societyId?: string) {
    const intro = helloIntro(content, state, ids, societyId ?? ids[0])
    const result = sayHelloAll(content, state, ids, societyId)
    setState(result.state)
    const gift = result.gift ? content.items.find((item) => item.id === result.gift)?.name : undefined
    if (gift) setNotice(t('shell.app.given', { gift }))
    if (intro) setCutscene({ intro, then: () => undefined })
  }

  /** Stops to talk at the fair: an hour's scene with whoever is at the table, or with someone wandering it. */
  function talkAtFair(ids: string[], societyId?: string) {
    // Not while what someone said in hello is still being read.
    if (cutscene) return
    const society = societyOf(content, societyId ?? '')
    const [leadId, ...companionIds] = ids.filter((id) => content.loveInterests.some((li) => li.id === id)).slice(0, MAX_SCENE_CAST)
    if (!leadId || !canTalkAtFair(content, state, ids).ok) return
    const stopped = society ? stopAtTable(content, state, society.id) : { state }
    const at = { ...stopped.state, time: stopped.state.time + 1 }
    setState(at)
    setPanel(null)
    setNotice(stopped.gift ? t('shell.app.given', { gift: String(content.items.find((item) => item.id === stopped.gift)?.name) }) : '')
    setScene({
      loveInterestId: leadId,
      companionIds,
      nsfw: false,
      backgroundId: content.societies?.fairId,
      returnTo: 'fair',
      beats: [
        {
          activityName: society ? t('shell.app.fairTableActivity', { society: society.name.replace(/^the /, '') }) : t('shell.app.fairActivity'),
          locationName: placeName(at),
          description: society?.description,
          direction: society
            ? t('shell.app.fairTableDirection', { who: firstNames(content, [leadId, ...companionIds]), count: companionIds.length + 1, society: society.name.replace(/^the /, ''), player: at.player.name })
            : t('shell.app.fairDirection', { player: at.player.name })
        }
      ],
      messages: [],
      gifts: [], conceived: [], departed: [], npc: false,
      baseline: sceneBaseline(state, leadId, companionIds)
    })
  }

  // Once he has stopped at both of the rival tables, they come to him: their scene is read, once, at the fair.
  useEffect(() => {
    if (panel?.kind !== 'fair' || cutscene || scene) return
    const intro = rivalryDue(content, state)
    if (!intro) return
    setState((current) => sawRivalry(current))
    setCutscene({ intro, then: () => undefined })
  }, [panel, cutscene, scene, state.flags])

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
        ? t('shell.app.handsGiftTo', { who: firstNames(content, [toId]), gift: gift.name })
        : t('shell.app.handsGift', { gift: gift.name })
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
    setAgreed(onId ? t('shell.app.usedOn', { name, who: firstNames(content, [onId]) }) : t('shell.app.used', { name }))
  }

  /** Turns the finished scene into a memory and shows what came of it. */
  /**
   * Ends a class or a shift at once, with no summary: nobody remembers it and nobody feels differently about him. The
   * class's marks were earned as it began; a shift is paid now, as it would have been.
   */
  /**
   * A dance at a masked ball ends with no summary, which would give her away: the next dance comes at once, and after the
   * last the unmasking, or nothing if nobody was masked. Only the scene that follows a right guess is summed up.
   */
  function endDance() {
    const next = nextDance(content, state)
    setEnded(false)
    setLastPrompt('')
    setScene(next?.scene ?? null)
    if (next) setState((current) => nextDance(content, current)?.state ?? current)
    else if (guessable(content, state).length === 0) setState((current) => endMasquerade(current))
  }

  function skipScene() {
    if (!scene || busy) return
    if (scene.dance) return endDance()
    const pay = shiftPay(content, state, scene)
    setState(payShift(content, state, scene))
    setSleepingOver(false)
    setScene(null)
    setEnded(false)
    setLastPrompt('')
    setNotice(pay > 0 ? t('shell.app.paid', { pay, bonus: 0, extra: false }) : '')
    // Walking away from a table at the fair is back out onto it, as the end of a talk there is.
    setPanel(scene.returnTo === 'fair' && fairNow(content, state) ? { kind: 'fair' } : null)
  }

  /**
   * He puts a plan to those with him. When everyone is free it is on offer at once, as if they had suggested it, with
   * nothing asked of the LLM. When something is in the way the nearest time that fits is found, and his line goes to them
   * with that time to agree to: whatever they say, it is on offer with their answer.
   */
  function schedule(request: ScheduleRequest) {
    if (!scene || busy) return
    const result = schedulePlan(content, state, request)
    if ('error' in result) return setNotice(result.error)
    const { proposal, clash } = result
    if (!clash) return setScene({ ...scene, proposal })
    const place = content.locations.find((l) => l.id === proposal.locationId)?.name ?? proposal.locationId
    const line = t('shell.app.scheduleLine', { title: proposal.title, place, when: describeWhen(content, request.time) })
    const cue = t('scene.prompt.meeting.moved', {
      player: state.player.name,
      title: proposal.title,
      place,
      asked: describeWhen(content, request.time),
      why: clash.join('; '),
      group: proposal.companionIds.length > 0,
      when: describeWhen(content, proposal.time)
    })
    // What was on offer before is put aside: this takes its place.
    void send(line, { ...scene, proposal: undefined }, state, cue, proposal)
  }

  /** He says his goodbye: the line goes into the scene, and it is summed up at once, with no reply to it. */
  function sayGoodbye() {
    if (!scene || busy) return
    const said: Scene = { ...scene, messages: [...scene.messages, { role: 'user', content: t('shell.app.goodbyeLine') }] }
    setScene(said)
    void finishScene(said)
  }

  /**
   * He takes a picture of whoever is with him and posts it on Bloomr. It is written and drawn in the background while the
   * scene goes on, and goes on the feed when it is done: at the hour he took it, unless the game has been left since.
   */
  async function takePhoto() {
    if (!scene || photoBusy) return
    setPhotoBusy(true)
    setAgreed(t('shell.app.photoTaking'))
    const { weatherSeed, time } = state
    try {
      const taken = await window.api.scenePhoto({ state, scene })
      if (taken.image && taken.text) {
        const { text, image, comments } = taken
        setState((current) => (current.weatherSeed === weatherSeed ? addPlayerPost(current, { time, text, image, comments }) : current))
        setAgreed(t('shell.app.photoPosted', { text }))
      } else setAgreed(t('shell.app.photoFailed', { error: taken.error ?? '' }))
    } catch (error) {
      setAgreed(t('shell.app.photoFailed', { error: errorMessage(error) }))
    } finally {
      setPhotoBusy(false)
    }
  }

  /** Turns the finished scene into a memory: the one on screen, or the one just added to. */
  async function finishScene(said?: Scene) {
    return summarise(said ?? scene)
  }

  async function summarise(scene: Scene | null) {
    if (!scene || busy) return
    if (scene.dance) return endDance()
    setBusy(true)
    try {
      const result = await window.api.summarize({ state, scene })
      // Someone taken with him who never got round to it gives him her Bloomr as they part.
      const parting = scene.npc ? [] : sceneWitnesses(scene).filter((id) => offersContact(content, state, id))
      if (parting.length > 0) {
        setState((current) => parting.reduce(giveContact, current))
        setNotice(t('shell.app.partingBloomr', { who: firstNames(content, parting), count: parting.length }))
      }
      // How each of them feels about him now is what she made of the scene, and nothing else moves it.
      // A scene in which they had sex is counted for each of them, once.
      const moved = addIntimacy(Object.entries(result.feelings).reduce((current, [id, feelings]) => applyFeelings(content, current, id, feelings, false, scene.outing === true), state), result.intimate)
      // What he paid for along the way comes out of his pocket now.
      const felt = applySpending(moved, result.spending)
      // With an eye for taste, time with her tells him one more thing she likes or does not, besides what came out in the talk.
      // Further on, he picks up two.
      const eye = scene.npc ? 0 : skillLevel(content, state, 'tastes')
      const noticed = sceneWitnesses(scene).flatMap((id) => {
        const found: string[] = []
        for (let n = 0; n < eye; n++) {
          const factId = intuitTaste(content, state, id, [...result.revealed.filter((r) => r.loveInterestId === id).map((r) => r.factId), ...found])
          if (factId) found.push(factId)
        }
        return found.map((factId) => ({ loveInterestId: id, factId }))
      })
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
            return c.relation === 'neither' ? t('shell.app.noLonger', { pair, relation: relationBetween(state, c.a, c.b) }) : t('shell.app.nowRelation', { pair, relation: c.relation })
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
      // An outfit that lasts the day, changed into in the scene, she keeps on; one for the scene alone comes off.
      const awake = keepDayOutfits(content, result.rapport.reduce((next, c) => setRelation(next, c.a, c.b, c.relation), known), scene)
      // They fell asleep where they were: the night goes by, and he wakes there in the morning, rested.
      const settled = sleepingOver ? sleepOver(content, awake) : awake
      if (sleepingOver) setDawn(true)
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
      setNotice(pay > 0 ? t('shell.app.paid', { pay, bonus, extra: bonus > 0 }) : '')
      setPanel(null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setPanel(null)
  // Escape opens the menu from anywhere in the game (the mouse's back button does not). With a dialog up it closes that dialog and no more. At the card
  // table it does nothing, since leaving mid-hand would take back what he had put in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || isMouseBack(event) || document.querySelector('.overlay, .lightbox, .poker, .house-screen, .fair-screen, .tour')) return
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
      ) : cutscene ? (
        <IntroView
          content={content}
          state={state}
          intro={cutscene.intro}
          onDone={() => {
            cutscene.then()
            setCutscene(null)
          }}
        />
      ) : practice?.expedition.run ? (
        // The guide's practice fight: played on a state of its own, never saved, and gone once it is over.
        <ExpeditionView content={content} state={practice} onChange={(next) => setPractice(next.expedition.run ? next : null)} practice />
      ) : state.expedition.run ? (
        <ExpeditionView content={content} state={state} onChange={setState} />
      ) : summary ? (
        <SummaryView
          content={withStrangers(summary.scene.npc ? withNpc(content, summary.scene.loveInterestId) : inMasks(content, summary.scene, true), summary.scene)}
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
            // A talk at the fair goes back out to its map, while its tables are still out.
            else if (summary.scene.returnTo === 'fair' && fairNow(content, state)) setPanel({ kind: 'fair' })
          }}
        />
      ) : scene ? (
        <SceneView
          content={shownCast}
          speakers={cast}
          state={state}
          scene={scene}
          backgroundId={scene.viewId ?? backgroundId}
          busy={busy}
          movingTo={movingTo}
          notice={notice}
          onRetry={failed && failed.notice === notice ? () => send(failed.text, failed.said, failed.when, failed.ask, failed.offered) : undefined}
          aside={aside}
          onDismissAside={() => setAside('')}
          ended={ended}
          onSend={(text, cue) => send(text, scene, state, cue)}
          onSkip={skipScene}
          onNameChild={(name) => {
            // With no name given he keeps hers. Either way it is settled, and he is not asked again.
            const named = renameNewborn(content, state, scene, name)
            setState(named.state)
            setScene({ ...named.scene, nameSettled: true })
          }}
          turnsKept={turns.length}
          onRedo={redoFrom}
          onContinue={() => void finishScene()}
          onGoodbye={sayGoodbye}
          onSchedule={schedule}
          onPhoto={() => void takePhoto()}
          photoBusy={photoBusy}
          onAcceptProposal={() => {
            if (!scene.proposal) return
            setState(acceptProposal(state, scene.proposal))
            setScene({ ...scene, proposal: undefined })
            setNotice('')
            setAgreed(t('shell.app.planAdded', { plan: scene.proposal.title, who: firstNames(content, attendees(scene.proposal)), when: describeWhen(content, scene.proposal.time) }))
          }}
          onDeclineProposal={() => setScene({ ...scene, proposal: undefined })}
          onAnimationEnd={() => setScene((current) => current && { ...current, animationId: undefined, animationOf: undefined })}
          onAnswerBond={(accept) => {
            const asked = scene.bondProposal
            if (!asked) return
            setScene({ ...scene, bondProposal: undefined })
            if (!accept) return
            setState(acceptBond(content, state, asked))
            setAgreed(t('shell.app.bondAgreed', { bond: describeBond(content, asked) }))
          }}
          agreed={agreed}
          rolls={rolls}
          learned={learned}
          onOpen={setPanel}
        />
      ) : state.drill ? (
        <MiniGameView key={state.drill.seed} content={content} state={state} drill={state.drill} onFinish={finishMiniGame} />
      ) : isGameOver(content.calendar, state.time) ? (
        // The last day of the calendar is over: what became of him.
        <EpilogueView content={content} state={state} onExit={onExit} />
      ) : panel?.kind === 'fair' ? (
        <FairView content={content} state={state} onHello={sayHelloAtFair} onTalk={talkAtFair} onJoin={(id) => setState((current) => joinSociety(content, current, id))} onLeave={close} />
      ) : panel?.kind === 'house' ? (
        <HouseView content={content} state={state} onChange={applyUpdate} onClose={close} onMovedIn={(id, key) => setWelcome({ id, key })} />
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
        <>
          <DayView
            content={content}
            state={state}
            partnerId={partnerId}
            backgroundId={backgroundId}
            onActivity={doActivity}
            onGoTo={goTo}
            onEndDay={endDay}
            onOrientation={attendNext}
            onEventPart={attendPart}
            onTalkNpc={talkNpc}
            busy={busy}
            onPropose={propose}
            onOuting={setOuting}
            onFocus={(focus) => applyUpdate((current) => setFocus(current, focus))}
            onOpen={setPanel}
          onFair={goToFair}
            touring={dayTour}
            onToured={() => setDayTour(false)}
          />
          {/* The first time he sees his day, on the first day of the game, whoever welcomed him shows him round it. */}
          {state.flags[WELCOMED] && !state.flags[INTERFACE_TOURED] && toDate(content.calendar, state.time).dayIndex === 0 && (
            <InterfaceTour
              content={content}
              state={state}
              panel={panel}
              onOpen={setPanel}
              // Seen through, it goes straight on round the day's choices; skipped, it is over.
              onDone={() => {
                setState((current) => ({ ...current, flags: { ...current.flags, [INTERFACE_TOURED]: true } }))
                setDayTour(true)
              }}
              onSkip={() => setState((current) => ({ ...current, flags: { ...current.flags, [INTERFACE_TOURED]: true } }))}
            />
          )}
        </>
      )}

      {relicMoment && <RelicMoment relic={relicMoment} onDone={endRelicMoment} />}
      {lanterns && <LanternRelease dates={lanterns.dates} lines={lanterns.lines} onDone={endLanterns} />}
      {tripMoment && <TripMoment kind={tripMoment.kind} companions={tripMoment.companions} title={tripMoment.title} lines={tripMoment.lines} onDone={endTripMoment} />}
      {!scene && !summary && guessable(content, state).length > 0 && (
        <MasqueradeGuess
          content={content}
          state={state}
          onGuess={(dancerId, guessedId) => {
            const result = guessDancer(content, state, dancerId, guessedId)
            setState(result.state)
            if (result.scene) {
              setNotice('')
              setScene(result.scene)
            } else setNotice(t('shell.app.wrongGuess', { who: firstNames(content, [dancerId]) }))
          }}
        />
      )}
      {booking && (
        <TripBooking
          content={content}
          state={state}
          booking={booking}
          onBook={(ids) => {
            // Booked, he is taken to the trip's group chat, where he has just told them, and their answers come in.
            const booked = bookTrip(content, state, booking, ids)
            const chatId = tripChatId(booking.eventId)
            setState(booked)
            setBooking(null)
            setPanel({ kind: 'courier', app: 'chats', chat: `group:${chatId}` })
            const history = (booked.groupChats[chatId]?.notes ?? []).map((note) => ({ speaker: booked.player.name, text: note.text }))
            void window.api.momentLines({ state: booked, ids, moment: 'trip-booked', history }).then(({ lines }) =>
              applyUpdate((current) => lines.reduce((next, line) => addGroupNote(next, chatId, { from: 'them', speakerId: line.speakerId, text: line.text, read: false }), current))
            )
          }}
          onSkip={() => setBooking(null)}
        />
      )}
      {dating && <DateDialog content={content} state={state} title={dating.title} most={dating.most} onGo={(ids) => attendPart(dating.eventId, dating.partId, ids)} onClose={() => setDating(null)} />}
      {dawn && <DawnTransition content={content} state={state} onDone={endDawn} />}

      {panel?.kind === 'gifts' && scene && partner && (
        <Dialog title={t('shell.app.bag')} onClose={close} sounds={['bagOpen', 'bagClose']} ornate>
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
            onAbility={(skillId, onId) => {
              const skill = content.skills.find((one) => one.id === skillId)
              // Making a thing only puts it in his bag: the bag stays open, on what he is making, for him to make or use more.
              if (skill?.ability?.effects.some((effect) => effect.type === 'item')) return setState((current) => useAbility(content, current, skillId, onId))
              useInScene(skill?.name ?? skillId, useAbility(content, state, skillId, onId), onId)
            }}
            onToggleRelic={(relicId) => setState((current) => toggleRelic(current, relicId))}
            canUseRelic={(relicId) => canUseRelic(content, state, scene, relicId)}
            onUseRelic={(relicId) => {
              // What it does is done now, and it is usually his turn: her reply is what she makes of it.
              const used = useRelic(content, state, scene, relicId)
              if (used.scene === scene || busy) return
              const relic = relicsHeld(content, state).find((one) => one.id === relicId)
              setState(used.state)
              setPanel(null)
              if (relic?.use) setRelicMoment(relic as Relic & { use: RelicUse })
              if (used.line) void send(used.line, used.scene, used.state, used.cue)
              else setScene(used.scene)
            }}
          />
        </Dialog>
      )}

      {/* Out of a scene, a thing is used on himself: what is for a woman waits until he is with her. */}
      {panel?.kind === 'bag' && !scene && (
        <Dialog title={t('shell.app.bag')} onClose={close} sounds={['bagOpen', 'bagClose']} ornate>
          <Bag
            content={content}
            state={state}
            onUseItem={(itemId) => setState((current) => useItem(content, current, itemId))}
            onAbility={(skillId) => setState((current) => useAbility(content, current, skillId))}
            onToggleRelic={(relicId) => setState((current) => toggleRelic(current, relicId))}
          />
        </Dialog>
      )}

      {exam && examCourse && !scene && (
        <ExamDialog key={`${exam.courseId}:${exam.kind}`} content={content} state={state} course={examCourse} kind={exam.kind} onHandIn={(answers) => handIn(examCourse.id, answers)} onClose={() => setExam(null)} />
      )}

      {outing && !scene && (
        <OutingDialog content={content} state={state} outing={outing} onGo={go} onClose={() => setOuting(null)} />
      )}

      {panel?.kind === 'courier' && (
        <PhonePanel content={withStrangers(content, scene)} state={state} feedError={feedError && feedError.seed === state.weatherSeed && feedError.day === toDate(content.calendar, state.time).dayIndex ? feedError.message : undefined} onChange={applyUpdate} onClose={close} initialId={panel.id} initialChat={panel.chat} app={panel.app} onGoToInvite={scene || summary ? undefined : goToInvite} canAct={!scene && !summary} />
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
          {toast.gains.length === 0 && <span>{t('shell.app.nothingCame')}</span>}
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
        <Dialog title={t('shell.app.endDayTitle')} onClose={close} narrow noClose>
          <p>{t('shell.app.endDayBody')}</p>
          {dayMisses(content, state).length > 0 && (
            <div className="notice">
              <strong>{t('shell.app.wouldMiss')}</strong>
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
                setDawn(true)
                close()
              }}
            >
              {dayMisses(content, state).length > 0 ? t('shell.app.sleepAnyway') : t('shell.app.sleep')}
            </button>
            <button className="secondary" onClick={close}>
              {t('shell.app.stayUp')}
            </button>
          </div>
        </Dialog>
      )}
      {panel?.kind === 'help' && <HelpPanel content={content} state={state} onClose={close} />}
      {belowTour && (
        <BelowTour
          content={content}
          panel={panel}
          onOpen={setPanel}
          practice={practice}
          onPractice={(on) => setPractice(on ? (current) => current ?? practiceRun(content, state, content.expedition?.guideId ? [content.expedition.guideId] : []) : null)}
          onDone={() => setBelowTour(false)}
        />
      )}
      {panel?.kind === 'menu' && (
        // Back to the game is Escape, the mouse's back button, or a press outside it.
        <Dialog title={t('shell.app.menu')} onClose={close} narrow ornate noClose>
          <div className="pause-menu">
            <GrandButton label={t('shell.app.save')} icon={<SaveIcon size={22} />} onClick={() => setPanel({ kind: 'save' })} />
            <GrandButton label={t('shell.app.load')} icon={<LoadIcon size={22} />} onClick={() => setPanel({ kind: 'load' })} />
            <GrandButton label={t('shell.app.settings')} icon={<GearIcon size={22} />} onClick={() => setPanel({ kind: 'settings' })} />
            <GrandButton label={t('shell.app.exitToTitle')} icon={<JobIcon name="door" size={22} />} onClick={onExit} />
            <GrandButton label={t('shell.app.quit')} icon={<PowerIcon size={22} />} onClick={() => window.close()} />
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
      {panel?.kind === 'map' && (
        <MapPanel
          content={content}
          state={state}
          withHim={scene ? sceneCast(scene) : undefined}
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
      {panel?.kind === 'log' && scene && partner && (
        <Dialog title={t('shell.app.log')} onClose={close} wide ornate>
          <ol className="log sheet">
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
          {scene.messages.length === 0 && <p className="hint">{t('shell.app.nothingSaid')}</p>}
          {lastPrompt && (
            <details className="log-prompt">
              <summary>{t('shell.app.lastPrompt')}</summary>
              <pre>{lastPrompt}</pre>
            </details>
          )}
        </Dialog>
      )}
    </>
  )
}
