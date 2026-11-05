import {
  STATS,
  kindOf,
  type BondProposal,
  type ContentPack,
  type GameState,
} from "../model";
import { END_BOND, bondOf } from "./bonds";
import { enrolledCourses } from "./courses";
import { babiesAtHome, houseTotals } from "./housing";
import { eventsOn } from "./events";
import { trustOf } from "./modifiers";
import { meetingsAttended } from "./societies";
import { LEGENDARY, statOf } from "./stats";
import { t } from "../i18n";

/**
 * The achievements, kept for the install and not for a game: once earned, earned in every save. Each id stays as it
 * is, since it is how one is known on disk, and will be how it is known to Steam. Most are read off a game as it
 * stands (`earnedInState`), so a save that already meets one earns it the moment it is loaded; the rest are of
 * something a save does not keep, and are earned as it happens.
 */
export const ACHIEVEMENTS = [
  "perfection",
  "aced",
  "legendary",
  "heartbreaker",
  "conqueror",
  "light-of-my-life",
  "we-live-in-a-society",
  "obligatory-onsen-scene",
  "wheres-the-landlady",
  "oil-and-water",
  "xxxmas",
  "forbidden",
  "teach-me",
  "maid-my-day",
  "diplomacy",
  "bffs",
  "full-house",
  "true-sire",
  "family-matters",
  "genius",
  "have-a-ball",
  "slime-ball",
  "i-can-do-magic-too",
  "society-secrets",
  "good-listener",
  "im-outta-here",
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

/** Those kept secret until they are earned, as Steam's hidden ones are: neither named nor described before. */
export const HIDDEN_ACHIEVEMENTS: readonly AchievementId[] = [
  "oil-and-water",
  "xxxmas",
  "forbidden",
  "teach-me",
  "maid-my-day",
  "diplomacy",
  "bffs",
  "full-house",
  "true-sire",
  "family-matters",
  "slime-ball",
  "good-listener",
];

export const isHidden = (id: AchievementId): boolean =>
  HIDDEN_ACHIEVEMENTS.includes(id);

// How deep the Undercroft goes: Conqueror is clearing the last of it.
const UNDERCROFT_DEPTHS = 8;
// Who Slime Ball is for: the only one in a mask at the ball.
const SLIME = "lira";

/**
 * The flags the opening tutorials leave in a save: each seen through, and any of them skipped. Good Listener is all three
 * seen through and none skipped.
 */
export const TOUR_FLAGS = {
  interface: "toured-interface",
  day: "toured-day",
  courses: "toured-courses",
  skipped: "skipped-tour",
} as const;

/** What an achievement is called, and what earns it. */
export function describeAchievement(id: AchievementId): {
  name: string;
  description: string;
} {
  return {
    name: t(`game.achievements.${id}.name` as const),
    description: t(`game.achievements.${id}.description` as const),
  };
}

/** Those a game earns as it stands. */
export function earnedInState(
  content: ContentPack,
  state: GameState,
): AchievementId[] {
  const earned: AchievementId[] = [];
  // Perfection: every meter full with any one of them, trust as he sees it.
  const max = content.relationships.meterMax;
  if (
    content.loveInterests.some((li) => {
      const rel = state.relationships[li.id];
      return (
        rel !== undefined &&
        rel.affection >= max &&
        rel.desire >= max &&
        trustOf(content, state, li.id) >= max
      );
    })
  )
    earned.push("perfection");
  // Aced!: a midterm in every course he takes, and every one an A.
  const courses = enrolledCourses(state);
  if (
    courses.length > 0 &&
    courses.every((course) => state.grades[course.id]?.midterm?.letter === "A")
  )
    earned.push("aced");
  // Genius: every course's midterm and final an A, so only once the finals are sat.
  if (
    courses.length > 0 &&
    courses.every(
      (course) =>
        state.grades[course.id]?.midterm?.letter === "A" &&
        state.grades[course.id]?.final?.letter === "A",
    )
  )
    earned.push("genius");
  // Legendary: every stat legendary at once.
  if (STATS.every((stat) => statOf(state, stat) >= LEGENDARY))
    earned.push("legendary");
  // Conqueror: the Undercroft cleared to its last depth.
  if (state.expedition.cleared >= UNDERCROFT_DEPTHS) earned.push("conqueror");
  // We live in a society: in any of them.
  if (state.societies.length > 0) earned.push("we-live-in-a-society");
  // Obligatory onsen scene: any part of the Mistmoon Break, the trip to Saltmere's springs.
  if (state.partsAttended.some((part) => part.startsWith("mistmoon-break:")))
    earned.push("obligatory-onsen-scene");
  // Slime Ball: at the ball, Lira the only one of them in a mask.
  const masked = (state.masquerade?.dancers ?? []).filter(
    (dancer) => dancer.maskId !== undefined,
  );
  if (masked.length === 1 && masked[0].id === SLIME) earned.push("slime-ball");
  // Society Secrets: the second of any society's special meetings been to.
  if (
    (content.societies?.societies ?? []).some((society) => {
      const second = [...society.adultEvents].sort(
        (a, b) => a.meeting - b.meeting,
      )[1];
      return (
        second !== undefined &&
        meetingsAttended(state, society.id) >= second.meeting
      );
    })
  )
    earned.push("society-secrets");
  // Good Listener: the opening tutorials all seen through, none skipped.
  if (
    state.flags[TOUR_FLAGS.interface] === true &&
    state.flags[TOUR_FLAGS.day] === true &&
    state.flags[TOUR_FLAGS.courses] === true &&
    state.flags[TOUR_FLAGS.skipped] !== true
  )
    earned.push("good-listener");
  // Where's the landlady?: Haven House is his, once he has moved in; it stays earned if he is put out.
  if (
    state.housing.movedInAt !== undefined ||
    state.housing.status === "resident"
  )
    earned.push("wheres-the-landlady");
  // BFFs: Tamsin carrying his child, and with him in any arrangement.
  if (
    state.pregnancies["tamsin"] !== undefined &&
    bondOf(state, "tamsin") !== undefined
  )
    earned.push("bffs");
  // Full house: every cot the house has filled.
  if (content.housing && state.housing.status === "resident") {
    const cots = houseTotals(content.housing, state).cots;
    if (cots > 0 && babiesAtHome(state).length >= cots)
      earned.push("full-house");
  }
  // True Sire: every love interest has carried his child, or is carrying it.
  const carried = (id: string) =>
    state.pregnancies[id] !== undefined ||
    state.children.some((child) => child.motherId === id);
  if (
    content.loveInterests.length > 0 &&
    content.loveInterests.every((li) => carried(li.id))
  )
    earned.push("true-sire");
  // Family matters: one of them has carried his child twice: a child born and another coming, or two born.
  if (
    content.loveInterests.some(
      (li) =>
        state.children.filter((child) => child.motherId === li.id).length +
          (state.pregnancies[li.id] ? 1 : 0) >=
        2,
    )
  )
    earned.push("family-matters");
  return earned;
}

/** Those a scene earns as it ends: who he had sex with in it, by id, and the game as it was. */
export function earnedInScene(
  content: ContentPack,
  state: GameState,
  intimateIds: readonly string[],
): AchievementId[] {
  const with_ = (...ids: string[]) =>
    ids.every((id) => intimateIds.includes(id));
  const earned: AchievementId[] = [];
  // Oil and Water: Dinah and Morwenna, in the one scene.
  if (with_("dinah", "morwenna")) earned.push("oil-and-water");
  // Forbidden: the 'bffs', together.
  if (with_("anwen", "elowen")) earned.push("forbidden");
  // Teach me!: any three of his teachers at once.
  const teachers = content.loveInterests.filter(
    (li) => kindOf(li) === "teacher" && intimateIds.includes(li.id),
  );
  if (teachers.length >= 3) earned.push("teach-me");
  // Diplomacy: Yelena and Seraphine, in the one scene.
  if (with_("yelena", "seraphine")) earned.push("diplomacy");
  // Maid my Day: Zélie.
  if (with_("zelie")) earned.push("maid-my-day");
  // XXXmas: anyone at all, on the Feast of First Frost.
  if (
    intimateIds.length > 0 &&
    eventsOn(content, state).some((event) => event.id === "first-frost")
  )
    earned.push("xxxmas");
  return earned;
}

/** Those a part of an event earns as he goes to it, with those he took. */
export function earnedAtEvent(
  eventId: string,
  withIds: readonly string[],
): AchievementId[] {
  // Light of my life: the lanterns let go, with a date.
  return eventId === "lantern-festival" && withIds.length > 0
    ? ["light-of-my-life"]
    : [];
}

/** Have a Ball: a masked dancer named right. */
export function earnedByGuess(correct: boolean): AchievementId[] {
  return correct ? ["have-a-ball"] : [];
}

/** I Can Do Magic Too!: a relic used in a scene, which only one that is not passive can be. */
export function earnedByRelic(): AchievementId[] {
  return ["i-can-do-magic-too"];
}

/** I'm Outta Here: a love interest walked out of the scene, by id, of those who left it. */
export function earnedByLeaving(
  content: ContentPack,
  leftIds: readonly string[],
): AchievementId[] {
  return leftIds.some((id) =>
    content.loveInterests.some((li) => li.id === id),
  )
    ? ["im-outta-here"]
    : [];
}

/** Those a change to what he and they are to each other earns, once it is agreed. */
export function earnedByBond(proposal: BondProposal): AchievementId[] {
  // Heartbreaker: what they had is ended.
  return proposal.statusId === END_BOND ? ["heartbreaker"] : [];
}
