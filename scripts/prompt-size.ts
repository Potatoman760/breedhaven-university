/**
 * Says how big the prompt of a scene's first reply is: the system prompt a love interest is given when a new game's
 * first scene with her opens, as the app builds it, by section. Not part of the app:
 *
 *   npx jiti scripts/prompt-size.ts            everyone, one line each
 *   npx jiti scripts/prompt-size.ts tamsin     her, section by section
 *   npx jiti scripts/prompt-size.ts tamsin --print    and the prompt itself
 *   npx jiti scripts/prompt-size.ts --class course-bps-101 [--sat 2]    the instruction that opens a class of that course, after so many sat
 *
 * Tokens are an estimate, at four characters to one.
 */
import { resolve } from 'node:path'
import { loadBase } from '../src/main/content/addons'
import { buildCharacterPrompt, createInitialState, lessonCue, lessonTopic, personalise, sceneBaseline, withHousing } from '../src/shared/game'
import type { Scene } from '../src/shared/model'

const args = process.argv.slice(2)
const print = args.includes('--print')
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const classId = flag('--class')
const sat = Number(flag('--sat') ?? 0)
const only = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--class' && args[i - 1] !== '--sat')

const written = loadBase(resolve('content', 'default')).content
const state = createInitialState(written)
const content = withHousing(personalise(written, state.player.name), state)
const tokens = (text: string) => Math.round(text.length / 4)

function promptFor(id: string): string {
  const scene: Scene = { loveInterestId: id, companionIds: [], npc: false, nsfw: false, beats: [{ activityName: 'Talk' }], messages: [], gifts: [], conceived: [], departed: [], baseline: sceneBaseline(state, id, []) }
  return buildCharacterPrompt({ content, state, loveInterestId: id, companionIds: [], sceneBeats: scene.beats, opening: true, look: scene, looks: scene.looks, comfort: scene.comfort, gifts: scene.gifts, departed: [], hoursSoFar: 0, recentText: '' })
}

if (classId) {
  // What whoever teaches it is handed as the class begins: the course, and what today's class is on.
  const course = state.courses.find((one) => one.id === classId)
  if (!course) throw new Error(`No course called ${classId}. There are: ${state.courses.map((one) => one.id).join(', ')}`)
  const topic = lessonTopic(content, { attendance: { [course.id]: { sat: Array.from({ length: sat }, (_, index) => String(index)) } } }, course)
  console.log(lessonCue(state.player.name, { speaker: course.professor, course: `${course.title} (${course.number})`, about: course.description, topic }))
  process.exit(0)
}

const everyone = content.loveInterests.filter((li) => li.kind !== 'npc' && (only.length === 0 || only.includes(li.id)))
if (everyone.length === 0) throw new Error(`No love interest called: ${only.join(', ')}`)
const sizes = everyone.map((li) => ({ li, prompt: promptFor(li.id) }))
if (only.length === 0) {
  for (const { li, prompt } of sizes) console.log(`${li.id.padEnd(16)} ${String(prompt.length).padStart(6)} chars  ~${tokens(prompt)} tokens`)
  const mean = sizes.reduce((sum, one) => sum + one.prompt.length, 0) / sizes.length
  console.log(`${'average'.padEnd(16)} ${String(Math.round(mean)).padStart(6)} chars  ~${Math.round(mean / 4)} tokens`)
} else {
  for (const { li, prompt } of sizes) {
    console.log(`${li.name}: ${prompt.length} chars, about ${tokens(prompt)} tokens`)
    const parts = prompt.split(/^## /m)
    const rows = parts.map((part, i) => ({ title: i === 0 ? '(before the first section)' : part.split('\n')[0], size: part.length })).sort((a, b) => b.size - a.size)
    for (const row of rows) console.log(`  ${String(row.size).padStart(6)}  ${String(Math.round((row.size / prompt.length) * 100)).padStart(3)}%  ${row.title}`)
    if (print) console.log(`\n${prompt}`)
  }
}
