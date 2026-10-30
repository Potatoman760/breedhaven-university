import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateContentPack, type ContentPack } from '../../shared/model'
import { readContentTranslation, translated } from './language'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to read ${path}: ${(error as Error).message}`)
  }
}

/** For parts of a pack that may be left out. */
function optionalJson(path: string): unknown {
  return existsSync(path) ? readJson(path) : undefined
}

// The files a pack is made of, and whether it has to have each.
const REQUIRED_FILES = {
  calendar: 'calendar.json',
  relationships: 'relationships.json',
  traits: 'traits.json',
  locations: 'locations.json',
  activities: 'activities.json',
  codex: 'codex.json',
  newGame: 'new-game.json'
}
const OPTIONAL_FILES = {
  map: 'map.json',
  coursework: 'coursework.json',
  orientation: 'orientation.json',
  jobs: 'jobs.json',
  societies: 'societies.json',
  housing: 'housing.json',
  expedition: 'expedition.json',
  pregnancy: 'pregnancy.json',
  drama: 'drama.json',
  items: 'items.json',
  stalls: 'stalls.json',
  poker: 'poker.json',
  minigames: 'minigames.json',
  // Faces and sex-acts added in the editor.
  looks: 'looks.json',
  sounds: 'sounds.json',
  // What is said under the logo while a scene loads.
  tips: 'tips.json',
  // The course catalogue, once one has been built for the pack.
  catalogue: 'catalogue.json',
  // Everything the University teaches: its subjects, their courses, and what each is on and teaches.
  curriculum: 'curriculum.json'
}

/** Reads and validates a content pack directory. Throws if anything is missing or invalid. */
export function loadContentPack(dir: string, languageDir?: string): ContentPack {
  return validateContentPack(readPack(dir, languageDir))
}

/** Reads a content pack directory as it is written, without checking it: in another language, when given that language's folder. */
export function readPack(dir: string, languageDir?: string): Record<string, unknown> {
  const loveInterestDir = join(dir, 'love-interests')
  const loveInterests = readdirSync(loveInterestDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => readJson(join(loveInterestDir, file)))

  const pack = {
    ...Object.fromEntries(Object.entries(REQUIRED_FILES).map(([key, file]) => [key, readJson(join(dir, file))])),
    ...Object.fromEntries(Object.entries(OPTIONAL_FILES).map(([key, file]) => [key, optionalJson(join(dir, file))])),
    loveInterests
  }
  return languageDir ? (translated(pack, readContentTranslation(languageDir, { ...REQUIRED_FILES, ...OPTIONAL_FILES })) as Record<string, unknown>) : pack
}
