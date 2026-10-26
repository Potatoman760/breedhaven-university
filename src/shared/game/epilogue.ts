import { pronounWords, type ContentPack, type GameState, type LoveInterest } from '../model'
import { statusOf } from './bonds'
import { gradeFor } from './exams'
import { babiesAtHome, healthName } from './housing'
import { seedOf } from './seed'
import { t, type MessageKey } from '../i18n'

/** How the year went for him as a student. */
export type Standing = 'failing' | 'gettingBy' | 'excelling'

/** One screen of the epilogue: what it is about, what it says, and anything listed under it. */
export interface EpilogueScreen {
  kind: 'academics' | 'legacy' | 'love' | 'child' | 'home' | 'below' | 'end'
  /** A word or two over the text: "Academics", "Love". */
  heading: string
  text: string
  /** Lines shown small beneath it: each course and its grade. */
  details?: string[]
  /** Who the screen is about, for the picture it will one day have. */
  loveInterestIds?: string[]
  /** For the first screen: how he did. */
  standing?: Standing
  /** A picture in the pack the screen is told over, in place of the title screen's. */
  image?: string
}

// What each letter is worth, as a grade point.
const POINTS: Record<string, number> = { A: 4, B: 3, C: 2, F: 0 }
// An average of a B or better, with nothing failed, is excelling; under one point, or most of it failed, is failing.
const EXCELLING = 3
const FAILING = 1
// Without rules of its own, a child is a daughter seven times in eight: there are seven women to every man.
const DAUGHTER_CHANCE = 7 / 8

/** His grade in each course he took: the final he sat, or what his marks and his attendance would earn him, if the year ended first. */
export function finalGrades(content: ContentPack, state: GameState): { number: string; title: string; letter: string; passed: boolean }[] {
  if (!content.coursework) return []
  return state.courses
    .filter((course) => state.enrolment?.includes(course.id))
    .map((course) => {
      const grade = state.grades[course.id]?.final ?? gradeFor(content, state, course, 'final', { topics: [], correct: 0 }, state.time)
      return { number: course.number, title: course.title, letter: grade.letter, passed: grade.passed }
    })
}

/** How he did as a student, from his final grades. Taking nothing is getting by. */
export function standingOf(grades: { letter: string; passed: boolean }[]): Standing {
  if (grades.length === 0) return 'gettingBy'
  const average = grades.reduce((sum, grade) => sum + (POINTS[grade.letter] ?? 0), 0) / grades.length
  const passed = grades.filter((grade) => grade.passed).length
  if (average < FAILING || passed * 2 < grades.length) return 'failing'
  return average >= EXCELLING && passed === grades.length ? 'excelling' : 'gettingBy'
}

const ACADEMICS: Record<Standing, MessageKey> = {
  failing: 'game.epilogue.academics.failing',
  gettingBy: 'game.epilogue.academics.gettingBy',
  excelling: 'game.epilogue.academics.excelling'
}

/** "Faye", "Faye and Bea", "Faye, Bea and Cy". */
function names(people: LoveInterest[]): string {
  const first = people.map((li) => li.name.split(' ')[0])
  return first.length < 2 ? (first[0] ?? '') : t('game.epilogue.names', { rest: first.slice(0, -1).join(', '), last: first.at(-1) })
}

/** Which of her pronouns she goes by, as the messages choose between them: `she`, `he` or `they`. */
function pronounOf(li: LoveInterest): string {
  return pronounWords(li.pronouns).subject
}

/** A repeatable number in [0, 1) for one mother in one game. */
function roll(seed: number, index: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x7f4a7c15) ^ 0x51ed270b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/**
 * Whether things are still good between him and a love interest when the year ends: they
 * are together, or she is at least as fond of him as a friend is. Someone he broke with
 * and has not won back, or never got close to, is not.
 */
export function onGoodTerms(content: ContentPack, state: GameState, loveInterestId: string): boolean {
  if (state.bonds.some((bond) => bond.memberIds.includes(loveInterestId))) return true
  const stages = [...content.relationships.stages].sort((a, b) => a.minAffection - b.minAffection)
  const friend = stages[Math.floor(stages.length / 2)]
  return (state.relationships[loveInterestId]?.affection ?? 0) >= (friend?.minAffection ?? 0)
}

/**
 * The children a love interest has borne him over the year, and the one she is carrying
 * when it ends, which is born in the telling: a daughter or a son by the odds of the world.
 */
export function childrenBy(content: ContentPack, state: GameState, loveInterestId: string): { daughter: boolean }[] {
  const born = state.children.filter((child) => child.motherId === loveInterestId).map(({ daughter }) => ({ daughter }))
  if (!state.pregnancies[loveInterestId]) return born
  return [...born, { daughter: roll(state.weatherSeed, seedOf(loveInterestId)) < (content.pregnancy?.daughterChance ?? DAUGHTER_CHANCE) }]
}

/** "a beautiful baby girl", "two beautiful children, a girl and a boy"; short, "a girl", "two children, a girl and a boy". */
function describeChildren(children: { daughter: boolean }[], short = false): string {
  if (children.length === 1) return t(short ? 'game.epilogue.babyShort' : 'game.epilogue.baby', { daughter: children[0].daughter })
  const girls = children.filter((child) => child.daughter).length
  const boys = children.length - girls
  const few = (n: number) => t('game.epilogue.fewCount', { n })
  const which = [girls > 0 && t('game.epilogue.girls', { n: girls, count: few(girls) }), boys > 0 && t('game.epilogue.boys', { n: boys, count: few(boys) })].filter(Boolean) as string[]
  return t(short ? 'game.epilogue.babiesShort' : 'game.epilogue.babies', { count: few(children.length), which: which.length === 2 ? t('game.epilogue.both', { first: which[0], second: which[1] }) : which[0] })
}

const count = (n: number) => t('game.epilogue.count', { n })

/** What the year left him, the thing a Sire is here for: how many children, by how many women. */
function legacy(content: ContentPack, state: GameState): EpilogueScreen {
  const mothers = content.loveInterests.map((li) => ({ li, children: childrenBy(content, state, li.id) })).filter((one) => one.children.length > 0)
  const total = mothers.reduce((sum, one) => sum + one.children.length, 0)
  const text =
    total === 0
      ? t('game.epilogue.legacyNone')
      : t('game.epilogue.legacy', { total, count: count(total), mothers: mothers.length, motherCount: count(mothers.length), record: mothers.length >= 3 })
  return {
    kind: 'legacy',
    heading: t('game.epilogue.legacyHeading'),
    text,
    details: mothers.map(({ li, children }) => t('game.epilogue.line', { label: li.name.split(' ')[0], value: describeChildren(children, true) })),
    loveInterestIds: mothers.slice(0, 3).map(({ li }) => li.id)
  }
}

/** How the children raised in his house were doing when the year ended, as a line under the house. */
function childrenAtHome(content: ContentPack, state: GameState): { text: string; details: string[] } | undefined {
  const config = content.housing
  const home = babiesAtHome(state)
  if (!config || home.length === 0) return undefined
  const thriving = home.filter((child) => (child.health ?? 0) >= config.babies.thrivingFrom).length
  const text =
    thriving === home.length
      ? t('game.epilogue.homeAllThriving', { n: home.length })
      : thriving === 0
        ? t('game.epilogue.homeNoneThriving', { n: home.length })
        : t('game.epilogue.homeSomeThriving', { count: count(home.length), thriving, thrivingCount: count(thriving) })
  return { text, details: home.map((child) => t('game.epilogue.line', { label: child.name, value: healthName(config, child.health ?? 0) })) }
}

/**
 * The way down, told whatever he made of it: every anchor set, and the University was saved by him and talked of for
 * it; any short of that, and what was loose below came up onto the campus.
 */
function below(content: ContentPack, state: GameState): EpilogueScreen | undefined {
  const config = content.expedition
  if (!config) return undefined
  const set = state.expedition.cleared
  const all = config.depths.length
  const text =
    set >= all
      ? t('game.epilogue.belowSaved')
      : t('game.epilogue.belowOverrun', { anchors: set === 0 ? t('game.epilogue.belowNone') : t('game.epilogue.belowSome', { set: count(set), all: count(all) }) })
  return { kind: 'below', heading: config.name.replace(/^the /, 'The '), text, image: set >= all ? config.endingImages.saved : config.endingImages.overrun }
}

/**
 * The epilogue, worked out from how the game stands when its last day is over. Nothing in
 * it is written by the LLM. First how he did as a student; then what the year left him, the
 * children he fathered and by whom; one screen for each love interest who carried his child;
 * then a screen for each arrangement that is a couple or more; then the house, if he was let
 * one, and how the children raised in it fared; then the way down, whatever he made of it; and the end.
 */
export function buildEpilogue(content: ContentPack, state: GameState): EpilogueScreen[] {
  const screens: EpilogueScreen[] = []
  const person = (id: string) => content.loveInterests.find((li) => li.id === id)

  const grades = finalGrades(content, state)
  const standing = standingOf(grades)
  screens.push({ kind: 'academics', heading: t('game.epilogue.academicsHeading'), text: t(ACADEMICS[standing]), standing, details: grades.map((grade) => t('game.epilogue.line', { label: `${grade.number} ${grade.title}`, value: grade.letter })) })

  // What a Sire is here for, told before anything else that came of the year.
  // Told wherever a child can be had, and wherever one was, though it is nothing to boast of.
  if (content.pregnancy || state.children.length > 0 || Object.keys(state.pregnancies).length > 0) screens.push(legacy(content, state))

  // Each love interest who carried his child: one screen for her, however many she bore.
  for (const li of content.loveInterests) {
    const children = childrenBy(content, state, li.id)
    if (children.length === 0) continue
    const first = li.name.split(' ')[0]
    const pronoun = pronounOf(li)
    // One who lived in his house when the year ended did not raise them alone, whatever else stood between them.
    const together = content.housing !== undefined && state.housing.status === 'resident' && (state.housing.residents[li.id] !== undefined || li.id === content.housing.nannyId)
    const ending = together
      ? t('game.epilogue.childTogether', { n: children.length, home: content.housing?.name })
      : onGoodTerms(content, state, li.id)
        ? t('game.epilogue.childOverjoyed', { pronoun })
        : t('game.epilogue.childAlone', { pronoun, n: children.length })
    screens.push({ kind: 'child', heading: t('game.epilogue.familyHeading'), text: t('game.epilogue.child', { first, pronoun, children: describeChildren(children), ending }), loveInterestIds: [li.id] })
  }

  // Each arrangement that is a couple or more, in the order they were made.
  for (const bond of [...state.bonds].sort((a, b) => a.since - b.since)) {
    const status = statusOf(content, bond)
    const members = bond.memberIds.map(person).filter((li): li is LoveInterest => li !== undefined)
    if (!status?.committed || members.length === 0) continue
    const text =
      members.length === 1
        ? t('game.epilogue.loveOne', { pronoun: pronounOf(members[0]), names: names(members), exclusive: status.exclusive })
        : t('game.epilogue.loveMany', { names: names(members), n: members.length + 1, exclusive: status.exclusive })
    screens.push({ kind: 'love', heading: status.name, text, loveInterestIds: members.map((li) => li.id) })
  }

  // The house, if it came to that: kept, with whoever shared it and how the children in it fared, or lost.
  const housing = content.housing
  if (housing && state.housing.status === 'resident') {
    const household = Object.keys(state.housing.residents).map(person).filter((li): li is LoveInterest => li !== undefined)
    const built = housing.rooms.filter((room) => (state.housing.rooms[room.key] ?? 0) > 0).length
    const kept = t('game.epilogue.kept', { home: housing.name, built: built === housing.rooms.length })
    const kids = childrenAtHome(content, state)
    screens.push({
      kind: 'home',
      heading: t('game.epilogue.homeHeading'),
      text:
        (household.length > 0 ? t('game.epilogue.household', { kept, names: names(household), n: household.length }) : t('game.epilogue.nobodyHome', { kept })) +
        (kids?.text ?? ''),
      details: kids?.details,
      loveInterestIds: household.map((li) => li.id)
    })
  } else if (housing && state.housing.status === 'evicted') {
    screens.push({ kind: 'home', heading: t('game.epilogue.homeHeading'), text: t('game.epilogue.evicted', { home: housing.name }) })
  }

  const way = below(content, state)
  if (way) screens.push(way)

  screens.push({ kind: 'end', heading: t('game.epilogue.endHeading'), text: t('game.epilogue.end', { player: state.player.name }) })
  return screens
}
