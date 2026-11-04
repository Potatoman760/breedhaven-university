import { THRIVING_BEAT, THRIVING_WEEKS, type Appointment, type Child, type ContentPack, type GameState, type Intro, type Scene, type StoryBeat } from '../model'
import { allFree, keepAppointment } from './appointments'
import { isGameOver, toDate } from './calendar'
import { applyEffects } from './conditions'
import { addNote, hasContact } from './courier'
import { stopBirthControl } from './intimacy'
import { stageFor } from './relationships'
import { sceneBaseline } from './scene'
import { t } from '../i18n'

// Not before anyone is up: she writes from the hour the day's messages begin.
const ASKS_FROM_HOUR = 9
// How far ahead she looks for an hour they are both free, in days.
const LOOKS_AHEAD_DAYS = 14

/** The flag that a beat has been asked for: once asked, it is never asked again, kept or not. */
export const storyFlag = (loveInterestId: string, stage: string): string => `story:${loveInterestId}:${stage}`

/** Her beat for a stage, if she has one. */
export function storyBeat(content: ContentPack, loveInterestId: string, stage: string): StoryBeat | undefined {
  return content.story[loveInterestId]?.find((beat) => beat.stage === stage)
}

/**
 * Her next beat to ask him to: the first of hers not yet asked whose stage she has reached. Beats come in her order,
 * one at a time, so that one passed over by a leap of affection is still had before the next.
 */
function beatDue(content: ContentPack, state: GameState, loveInterestId: string): StoryBeat | undefined {
  const rel = state.relationships[loveInterestId]
  if (!rel) return undefined
  const order = [...content.relationships.stages].sort((a, b) => a.minAffection - b.minAffection).map((stage) => stage.id)
  const reached = order.indexOf(stageFor(content.relationships, rel.affection).id)
  const unasked = (content.story[loveInterestId] ?? []).filter((beat) => !state.flags[storyFlag(loveInterestId, beat.stage)])
  // Her thanks for their child kept well comes whenever it is earned, ahead of whatever stage she is at.
  const thanks = unasked.find((beat) => beat.stage === THRIVING_BEAT)
  if (thanks && thrivingChildOf(state, loveInterestId)) return thanks
  const next = unasked.find((beat) => beat.stage !== THRIVING_BEAT)
  return next && order.indexOf(next.stage) <= reached ? next : undefined
}

/** A child of hers in his house that has been kept thriving for the weeks that earn her thanks, if there is one. */
export function thrivingChildOf(state: GameState, motherId: string): Child | undefined {
  return state.children.find((child) => child.motherId === motherId && child.health !== undefined && child.thrivingWeeks >= THRIVING_WEEKS)
}

/** A cutscene with the child's name and pronouns put in: `{child}`, `{they}`, `{them}`, `{their}`. */
export function aboutChild(intro: Intro, child: Child): Intro {
  const words: Record<string, string> = { child: child.name, they: child.daughter ? 'she' : 'he', them: child.daughter ? 'her' : 'him', their: child.daughter ? 'her' : 'his' }
  const fill = (line: string) => line.replace(/\{(child|they|them|their)\}/g, (_, key: string) => words[key])
  return { ...intro, scenes: intro.scenes.map((scene) => ({ ...scene, lines: scene.lines.map(fill) })) }
}

/** The first time from now that the beat can be had: its hour, on its weekday if it has one, with them both free. */
function beatTime(content: ContentPack, state: GameState, loveInterestId: string, beat: StoryBeat): number | undefined {
  const cal = content.calendar
  const today = toDate(cal, state.time).dayIndex
  for (let day = today; day <= today + LOOKS_AHEAD_DAYS; day++) {
    const time = day * cal.hoursPerDay + beat.startHour - cal.start.hour
    // An hour of grace, so that an invitation is never for a time already upon him.
    if (time <= state.time + 1 || isGameOver(cal, time)) continue
    if (beat.weekday !== undefined && toDate(cal, time).weekday !== beat.weekday) continue
    if (allFree(content, state, [loveInterestId], time, beat.hours)) return time
  }
  return undefined
}

/** Whether an invitation of hers to a beat is still out: unanswered and ahead, or accepted and on his calendar. */
function storyPending(state: GameState): boolean {
  if (state.appointments.some((plan) => plan.story !== undefined)) return true
  return Object.values(state.courier).some((thread) => thread.some((note) => note.proposal?.story !== undefined && !note.answer && note.proposal.time > state.time))
}

/**
 * Sends the next story invitation there is to send, from the first love interest whose next beat is due and who can
 * write to him: a note from her, with the beat as the plan it asks him to. The beat is marked asked at once, so that
 * whatever he does with it, it is not asked again. Only one invitation is out at a time. Unchanged when there is none
 * to send, or no hour they are both free.
 */
export function sendStoryInvitation(content: ContentPack, state: GameState): GameState | undefined {
  if (isGameOver(content.calendar, state.time) || toDate(content.calendar, state.time).hour < ASKS_FROM_HOUR || storyPending(state)) return undefined
  for (const li of content.loveInterests) {
    if (!hasContact(state, li.id)) continue
    const beat = beatDue(content, state, li.id)
    if (!beat) continue
    const time = beatTime(content, state, li.id, beat)
    if (time === undefined) continue
    const asked = { ...state, flags: { ...state.flags, [storyFlag(li.id, beat.stage)]: true } }
    return addNote(asked, li.id, {
      from: 'them',
      text: beat.invitation,
      read: false,
      proposal: { loveInterestId: li.id, companionIds: [], title: t('game.story.title'), time, hours: beat.hours, locationId: beat.locationId, story: beat.stage }
    })
  }
  return undefined
}

/** Whether a plan is a story beat. */
export const isStoryPlan = (plan: Pick<Appointment, 'story'>): boolean => plan.story !== undefined

/**
 * Which telling of a beat is read: for a woman who has stopped taking anything against the Bloom, or is carrying his
 * child, the one that says nothing of either; for one he has already been to bed with, that one; else the beat's own.
 */
function tellingOf(state: GameState, loveInterestId: string, beat: StoryBeat): { cutscene: Intro; direction: string } {
  const unprotected = state.offBirthControl.includes(loveInterestId) || state.pregnancies[loveInterestId] !== undefined
  if (unprotected && beat.ifUnprotected) return beat.ifUnprotected
  if ((state.timesIntimate[loveInterestId] ?? 0) > 0 && beat.ifIntimate) return beat.ifIntimate
  return beat
}

/**
 * Turns up for her beat: the plan comes off the calendar, what it does is done (her meters, and her stopping anything
 * against the Bloom, when this telling is the one in which she says so), and what comes back is the cutscene to read
 * and the scene with her alone after it, run on the beat's direction, in her room where the beat is.
 */
export function attendStory(content: ContentPack, state: GameState, appointmentId: string): { state: GameState; cutscene: Intro; scene: Scene; written?: Intro } {
  const plan = state.appointments.find((a) => a.id === appointmentId)
  const beat = plan?.story !== undefined ? storyBeat(content, plan.loveInterestId, plan.story) : undefined
  if (!plan || !beat) throw new Error(`"${appointmentId}" is not a story beat`)
  const id = plan.loveInterestId
  const child = beat.stage === THRIVING_BEAT ? thrivingChildOf(state, id) : undefined
  const told = tellingOf(state, id, beat)
  const telling = child ? { cutscene: aboutChild(told.cutscene, child), direction: aboutChild({ speakerId: id, scenes: [{ locationId: '', lines: [told.direction] }] }, child).scenes[0].lines[0] } : told
  // As any plan kept: it comes off the calendar and its hours are spent.
  let after: GameState = { ...keepAppointment(content, state, appointmentId).state, inOwnRoom: false }
  after = applyEffects(after, beat.effects, { content, loveInterestId: id, source: t('game.story.title') })
  if (beat.stopsBirthControl && telling !== beat.ifUnprotected) after = stopBirthControl(content, after, id)
  const place = content.locations.find((l) => l.id === beat.locationId)
  const scene: Scene = {
    loveInterestId: id,
    companionIds: [],
    nsfw: false,
    beats: [{ activityName: t('game.story.title'), locationName: place?.name, direction: telling.direction }],
    ...(beat.viewId && { viewId: beat.viewId }),
    ...(beat.inHerRoom && { roomOf: id }),
    ...(beat.outfitId && { outfitId: beat.outfitId }),
    messages: [],
    planned: true,
    gifts: [],
    conceived: [],
    departed: [],
    npc: false,
    baseline: sceneBaseline(after, id, [])
  }
  // As written as well, where the child was filled in: its recorded lines are found by the words as written.
  return { state: after, cutscene: telling.cutscene, scene, ...(child && { written: told.cutscene }) }
}
