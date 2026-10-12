import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateContentPack, type ContentPack } from '../../shared/model'

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

/** Reads and validates a content pack directory. Throws if anything is missing or invalid. */
export function loadContentPack(dir: string): ContentPack {
  return validateContentPack(readPack(dir))
}

/** Reads a content pack directory as it is written, without checking it. */
export function readPack(dir: string): Record<string, unknown> {
  const loveInterestDir = join(dir, 'love-interests')
  const loveInterests = readdirSync(loveInterestDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => readJson(join(loveInterestDir, file)))

  return {
    calendar: readJson(join(dir, 'calendar.json')),
    relationships: readJson(join(dir, 'relationships.json')),
    traits: readJson(join(dir, 'traits.json')),
    locations: readJson(join(dir, 'locations.json')),
    activities: readJson(join(dir, 'activities.json')),
    codex: readJson(join(dir, 'codex.json')),
    newGame: readJson(join(dir, 'new-game.json')),
    map: optionalJson(join(dir, 'map.json')),
    coursework: optionalJson(join(dir, 'coursework.json')),
    orientation: optionalJson(join(dir, 'orientation.json')),
    jobs: optionalJson(join(dir, 'jobs.json')),
    housing: optionalJson(join(dir, 'housing.json')),
    pregnancy: optionalJson(join(dir, 'pregnancy.json')),
    drama: optionalJson(join(dir, 'drama.json')),
    items: optionalJson(join(dir, 'items.json')),
    stalls: optionalJson(join(dir, 'stalls.json')),
    // What is said under the logo while a scene loads.
    tips: optionalJson(join(dir, 'tips.json')),
    // The course catalogue, once one has been built for the pack.
    catalogue: optionalJson(join(dir, 'catalogue.json')),
    loveInterests
  }
}
