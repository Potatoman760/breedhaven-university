/**
 * Writes a game well into the term to a save slot, for trying the late game without playing to it: several women at
 * different stages, one of them carrying his child and in a relationship with him, so that the Sire Relations Office
 * writes with the offer of the house as soon as the save is loaded. Not part of the app:
 *
 *   npx jiti scripts/make-test-save.ts            writes slot 8, unless there is a save there
 *   npx jiti scripts/make-test-save.ts 12 --force another slot, and over whatever is in it
 *   npx jiti scripts/make-test-save.ts 10 --midterm   the same game an hour before his first midterm, to try sitting one
 *   npx jiti scripts/make-test-save.ts 11 --below     the same game at the way down into the Undercroft, before his first time below, with things for a fight in his bag
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadContentPack } from '../src/main/content/loader'
import { SaveStore } from '../src/main/saves/store'
import {
  addMemory,
  applyForJob,
  canEnrol,
  createInitialState,
  examSlot,
  factsOf,
  formBond,
  giveContact,
  housingOfferDue,
  meet,
  revealFacts,
  skillsOf,
  tellSkills,
  timeOn,
  withHousing
} from '../src/shared/game'
import { GameStateSchema, type GameState } from '../src/shared/model'

const args = process.argv.slice(2)
const force = args.includes('--force')
const midterm = args.includes('--midterm')
const goBelow = args.includes('--below')
const slot = `slot${args.find((arg) => /^\d+$/.test(arg)) ?? '8'}`

const appData = process.platform === 'win32' ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')) : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
const dir = join(appData, 'breedhaven-dating-sim', 'saves')
if (existsSync(join(dir, `${slot}.json`)) && !force) throw new Error(`There is already a save in ${slot}. Pass --force to write over it, or name another slot.`)

const written = loadContentPack(resolve('content', 'default'))
const begun = createInitialState(written)
const content = withHousing(written, begun)
const hours = content.calendar.hoursPerDay

// The morning of a free day in the eighth week: Marketday, with nothing on his timetable.
const DAY = 54
let state: GameState = { ...begun, time: timeOn(content, DAY, 9), orientationStep: content.orientation?.steps.length ?? 0 }

// He has put the work in: good at everything, with money saved.
state = { ...state, player: { ...state.player, money: 1500, energy: state.player.maxEnergy, stats: { strength: 16, dexterity: 16, endurance: 16, intelligence: 17, charisma: 18, wisdom: 15 } } }

// Five courses that teach something, far enough along that he has what they teach.
// Two that let him make things, so the bag has something in it to try, and three that show him things.
const wanted = ['WTC', 'BLM', 'BPS', 'RBI', 'RHE', 'HHS', 'CSC', 'HIS']
let enrolment: string[] = []
for (const code of wanted) {
  const course = state.courses.find((one) => one.code === code)
  if (course && enrolment.length < (content.coursework?.maxCourses ?? 5) && canEnrol(content, state, enrolment, course.id).ok) enrolment = [...enrolment, course.id]
}
state = {
  ...state,
  enrolment,
  coursePoints: Object.fromEntries(enrolment.map((id) => [id, 46])),
  attendance: Object.fromEntries(enrolment.map((id) => [id, { sat: Array.from({ length: 14 }, (_, index) => `${index}:0`) }]))
}
state = tellSkills(state, skillsOf(content, state).map((skill) => skill.id))

// The women he knows, and how far each has come.
const women: { id: string; affection: number; trust: number; desire: number; intimate?: number; memories: [string, 'core' | 'normal'][] }[] = [
  { id: 'tamsin', affection: 90, trust: 85, desire: 80, intimate: 7, memories: [['You and he stopped pretending to be only old friends: he kissed you behind the Tiltyard after five-a-side and you kissed him back.', 'core'], ['The Bloom locked in the night you stayed in his room. You told him the next morning, and he held you.', 'core'], ['He came to every one of your matches this month.', 'normal']] },
  { id: 'faye', affection: 66, trust: 55, desire: 85, intimate: 5, memories: [['You took him home from the Mana Bar the second time you met, and neither of you has pretended it meant more than it does.', 'core'], ['He remembered what you drink.', 'normal']] },
  { id: 'seraphine', affection: 63, trust: 60, desire: 30, memories: [['He treated you as a first-year and not as the Queen, in the library, and you have thought about it since.', 'core'], ['You walked the Great Court together after the Societies Fair.', 'normal']] },
  { id: 'lira', affection: 42, trust: 40, desire: 60, intimate: 2, memories: [['He was not afraid to touch you, and asked what it felt like for you.', 'core']] },
  { id: 'dinah', affection: 36, trust: 45, desire: 20, memories: [['He argued theology with you for two hours and conceded a point honestly.', 'normal']] },
  { id: 'caelwen', affection: 45, trust: 50, desire: 35, memories: [['He stayed after your lecture to ask a question nobody else had thought of.', 'normal']] },
  { id: 'yelena', affection: 22, trust: 20, desire: 15, memories: [['You met him at orientation and have nodded to him since.', 'normal']] },
  { id: 'grushka', affection: 16, trust: 25, desire: 10, memories: [['He kept up through a whole session, which most do not.', 'normal']] }
]
for (const woman of women.filter((one) => content.loveInterests.some((li) => li.id === one.id))) {
  state = { ...state, relationships: { ...state.relationships, [woman.id]: { affection: woman.affection, trust: woman.trust, desire: woman.desire } } }
  state = giveContact(meet(content, state, [woman.id]), woman.id)
  woman.memories.forEach(([text, level], i) => {
    state = addMemory({ ...state, time: timeOn(content, 6 + i * 9, 15) }, woman.id, text, level)
  })
  state = { ...state, time: timeOn(content, DAY, 9) }
  if (woman.intimate) state = { ...state, timesIntimate: { ...state.timesIntimate, [woman.id]: woman.intimate } }
  // He knows a good half of what there is to know about anyone he is close to.
  const li = content.loveInterests.find((one) => one.id === woman.id)!
  const facts = factsOf(content, li).filter((fact) => fact.group !== 'secrets').map((fact) => fact.id)
  state = revealFacts(content, state, woman.id, facts.slice(0, Math.ceil((facts.length * woman.affection) / 100)))
}

// What they have agreed to be: Tamsin and he are a couple who see others; Faye and Lira are lovers without promises.
state = formBond(content, { ...state, time: timeOn(content, 24, 20) }, { statusId: 'open', memberIds: ['tamsin'] })
state = formBond(content, { ...state, time: timeOn(content, 12, 22) }, { statusId: 'casual', memberIds: ['faye'] })
state = formBond(content, { ...state, time: timeOn(content, 40, 21) }, { statusId: 'casual', memberIds: ['lira'] })
state = { ...state, time: timeOn(content, DAY, 9) }

// Tamsin is carrying his child and is due in five days, so the birth is close enough to try; she has stopped taking anything against it.
const DUE_IN_DAYS = 5
const conceivedAt = state.time + DUE_IN_DAYS * hours - (content.pregnancy?.lengthDays ?? 48) * hours
state = {
  ...state,
  offBirthControl: ['tamsin'],
  pregnancies: { tamsin: { conceivedAt, dueAt: conceivedAt + (content.pregnancy?.lengthDays ?? 48) * hours } }
}

// And he has a job to pay for what is coming.
state = applyForJob(content, state, 'bar-staff')
state = { ...state, job: state.job && { ...state.job, hiredAt: timeOn(content, 10, 9), settledTo: state.time } }

// For trying an examination: the clock goes on to an hour before the first of his midterms, and the child's date with it, so that the birth does not fall on the same days.
if (midterm) {
  const first = Math.min(...enrolment.flatMap((id) => examSlot(content, state.courses.find((course) => course.id === id)!, 'midterm')?.begins ?? []))
  const on = first - 1 - state.time
  state = {
    ...state,
    time: state.time + on,
    pregnancies: { tamsin: { conceivedAt: conceivedAt + on, dueAt: conceivedAt + on + (content.pregnancy?.lengthDays ?? 48) * hours } },
    job: state.job && { ...state.job, settledTo: state.time + on }
  }
}

// For trying the Undercroft: he stands at the way down on a free morning, has been told of it, and has yet to go.
if (goBelow && content.expedition) {
  state = {
    ...state,
    locationId: content.expedition.entryLocationId,
    inOwnRoom: false,
    inventory: { ...state.inventory, stillwater: 2, 'grounding-salt': 2 },
    expedition: { ...state.expedition, invited: true }
  }
}

const checked = GameStateSchema.parse(state)
if (!housingOfferDue(content, checked)) throw new Error('The save does not meet what the offer of a house asks: a woman carrying his child whom he has an arrangement with.')
const saved = new SaveStore(dir).save(slot, { state: checked, scene: null }, new Date(), midterm ? 'Before a midterm' : goBelow ? 'At the way down' : 'Late game test')
console.log(`Written to ${join(dir, `${slot}.json`)}: ${saved.unreadable ? 'unreadable' : `${saved.playerName}, day ${Math.floor(checked.time / hours) + 1}`}.`)
console.log(`Courses: ${enrolment.map((id) => checked.courses.find((course) => course.id === id)?.number).join(', ')}. Skills: ${skillsOf(content, checked).map((skill) => skill.name).join(', ')}.`)
console.log('The offer of the house arrives as a DM from the housing officer as soon as the save is loaded.')
