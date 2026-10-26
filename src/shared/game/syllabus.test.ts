import { describe, expect, it } from 'vitest'
import { buildCharacterPrompt, lessonCue } from './prompt'
import { createInitialState } from './state'
import { lessonTopic, topicsCovered, topicsOf } from './syllabus'
import { fixture } from './testFixture'

const topics = [
  { title: 'What a riddle is', content: 'A riddle hides a plain thing in a strange one.' },
  { title: 'The kenning', content: 'A kenning names a thing by what it does: the whale-road is the sea.' },
  { title: 'Riddles of the Starkelands', content: 'Northern riddles are sung, and answered in the same metre.' }
]
const content = { ...fixture(), syllabus: [{ courseId: 'course-rid-101', topics }] }
const start = createInitialState(content)
const sat = (count: number) => ({ attendance: { 'course-rid-101': { sat: Array.from({ length: count }, (_, index) => `${index}:6`) } } })

describe('what a class is on', () => {
  it('is the next topic of the course after the classes he has sat, and comes round again', () => {
    expect(topicsOf(content, 'course-rid-101')).toEqual(topics)
    expect(topicsOf(content, 'course-other')).toEqual([])
    expect(lessonTopic(content, start, { id: 'course-rid-101' })).toEqual(topics[0])
    expect(lessonTopic(content, sat(1), { id: 'course-rid-101' })).toEqual(topics[1])
    expect(lessonTopic(content, sat(2), { id: 'course-rid-101' })).toEqual(topics[2])
    expect(lessonTopic(content, sat(3), { id: 'course-rid-101' })).toEqual(topics[0])
    // A course with nothing written for it is taught as it always was.
    expect(lessonTopic(content, start, { id: 'course-other' })).toBeUndefined()
  })

  it('is its course’s syllabus in any section of it, taken up from what he has sat in his own', () => {
    const section = { id: 'course-rid-101-2', courseId: 'course-rid-101' }
    const inSection = { attendance: { 'course-rid-101-2': { sat: ['0:6'] } } }
    expect(lessonTopic(content, inSection, section)).toEqual(topics[1])
    expect(topicsCovered(content, inSection, section)).toEqual([0])
    // What he sat in another section of it is not his.
    expect(lessonTopic(content, sat(2), section)).toEqual(topics[0])
  })

  it('has taught him a topic for each class he sat, and no more than there are', () => {
    expect(topicsCovered(content, start, { id: 'course-rid-101' })).toEqual([])
    expect(topicsCovered(content, sat(2), { id: 'course-rid-101' })).toEqual([0, 1])
    expect(topicsCovered(content, sat(7), { id: 'course-rid-101' })).toEqual([0, 1, 2])
  })

  it('has whoever teaches say what the examination asks', () => {
    const topic = { ...topics[1], question: { ask: 'What is the whale-road?', answer: 'The sea', wrong: ['A river', 'A ship', 'The sky'] } }
    const lesson = { speaker: 'Doctor Reed', course: 'Riddles (RID 101)', about: '', topic }
    expect(lessonCue('Pat', lesson)).toContain('It is examined, so Doctor Reed says it outright in one of the lines: What is the whale-road? The sea.')
    expect(lessonCue('Pat', { ...lesson, topic: topics[1] })).not.toContain('It is examined')
  })

  it('is told to whoever teaches the class, at its opening and for as long as it lasts, and to nobody else', () => {
    const lesson = { speaker: 'Doctor Reed', course: 'Riddles (RID 101)', about: 'How a riddle is built.', topic: topics[1] }
    expect(lessonCue('Pat', lesson)).toContain('Today\'s topic is "The kenning". What is true of it in this world, to teach from and not to contradict: A kenning names a thing by what it does')
    expect(lessonCue('Pat', { ...lesson, topic: undefined })).not.toContain("Today's topic is")
    const scene = { content, state: start, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Riddles' }] }
    const inClass = buildCharacterPrompt({ ...scene, lesson })
    expect(inClass).toContain("## Today's class: The kenning")
    expect(inClass).toContain('the whale-road is the sea')
    // Outside the class none of it is anywhere: it is not world knowledge that a word could call up.
    const elsewhere = buildCharacterPrompt({ ...scene, recentText: 'Tell me about the kenning and the whale-road.' })
    expect(elsewhere).not.toContain('whale-road is the sea')
    expect(elsewhere).not.toContain("Today's class")
  })
})
