import { slugify } from '../../../../shared/editor'
import type { CalendarEvent, ContentPack, EventPart, Intro } from '../../../../shared/model'
import { Button } from '../Button'
import { Group, Text } from './fields'

interface Props {
  content: ContentPack
  event: CalendarEvent
  onChange: (program: EventPart[]) => void
}

const blankPart = (event: CalendarEvent, taken: string[]): EventPart => {
  let n = taken.length + 1
  while (taken.includes(`part-${n}`)) n++
  return { id: `part-${n}`, name: '', day: 1, startHour: event.startHour ?? 18, hours: 2, description: '', direction: '', castSize: 2, required: false }
}

const whole = (value: string, least: number, most: number) => Math.min(most, Math.max(least, Math.floor(Number(value)) || least))

/**
 * The scripted parts of an event, each a card: when on which of its days, where, what is said to open it and told to
 * the LLM, who is there, and the cutscene it opens on if it has one.
 */
export function EventProgram({ content, event, onChange }: Props) {
  const { calendar } = content
  const people = [...content.loveInterests, ...content.npcs].sort((a, b) => a.name.localeCompare(b.name))
  const setPart = (index: number, patch: Partial<EventPart>) => onChange(event.program.map((part, i) => (i === index ? { ...part, ...patch } : part)))
  const setCutscene = (index: number, patch: Partial<Intro> | undefined) => {
    const part = event.program[index]
    setPart(index, { cutscene: patch === undefined ? undefined : ({ ...(part.cutscene ?? { speakerId: people[0]?.id ?? '', scenes: [] }), ...patch } as Intro) })
  }

  return (
    <Group title="Program" hint="What happens at it, at set hours: each part is a card on the day's screen while it is on, and a scene with whoever is there. Places and people are dressed for the whole day; the parts are only their hours.">
      {event.program.map((part, index) => {
        const place = part.locationId ?? event.locationId
        const cutscene = part.cutscene
        const speaker = people.find((one) => one.id === cutscene?.speakerId)
        return (
          <div key={index} className="card event-part">
            <div className="row">
              <Text label="Name" llm value={part.name} placeholder="The supper" onChange={(name) => setPart(index, { name })} />
              <Text label="Id" value={part.id} onChange={(id) => setPart(index, { id: slugify(id) })} hint="Kept in saves: change it only before anyone has played it." />
            </div>
            <div className="row">
              <label>
                Day of the event
                <input type="number" min={1} max={event.durationDays} value={part.day} onChange={(e) => setPart(index, { day: whole(e.target.value, 1, event.durationDays) })} />
              </label>
              <label>
                Starts at (hour)
                <input type="number" min={0} max={calendar.hoursPerDay - 1} value={part.startHour} onChange={(e) => setPart(index, { startHour: whole(e.target.value, 0, calendar.hoursPerDay - 1) })} />
              </label>
              <label>
                Lasts (hours)
                <input type="number" min={1} max={calendar.hoursPerDay} value={part.hours} onChange={(e) => setPart(index, { hours: whole(e.target.value, 1, calendar.hoursPerDay) })} />
              </label>
              <label>
                Where
                <select value={part.locationId ?? ''} onChange={(e) => setPart(index, { locationId: e.target.value || undefined })}>
                  <option value="">{event.locationId ? `The event's place: ${content.locations.find((l) => l.id === event.locationId)?.name}` : 'Choose a place'}</option>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              The scene's view
              <select value={part.viewId ?? ''} onChange={(e) => setPart(index, { viewId: e.target.value || undefined })}>
                <option value="">As the day has it</option>
                {content.locations
                  .find((l) => l.id === place)
                  ?.backgrounds.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name}
                    </option>
                  ))}
              </select>
            </label>
            <Text label="Opening narration" rows={2} value={part.description} onChange={(description) => setPart(index, { description })} hint="Shown as the scene opens. Write {player} for his name." />
            <Text label="Direction" llm rows={3} value={part.direction} onChange={(direction) => setPart(index, { direction })} hint="What is going on and what the scene is for, told to the LLM." />

            <div className="row checks">
              <label className="inline">
                <input type="checkbox" checked={part.castIds !== undefined} onChange={(e) => setPart(index, { castIds: e.target.checked ? [] : undefined })} />
                Name who is there
              </label>
              {part.castIds === undefined && (
                <label className="inline">
                  Up to
                  <input type="number" min={1} max={3} value={part.castSize} onChange={(e) => setPart(index, { castSize: whole(e.target.value, 1, 3) })} />
                  of whoever said they would come, else those he is closest to
                </label>
              )}
              <label className="inline">
                <input type="checkbox" checked={part.required} onChange={(e) => setPart(index, { required: e.target.checked })} />
                He has to go: nothing else that day until he has
              </label>
            </div>
            {part.castIds !== undefined && (
              <div className="row checks">
                {part.castIds.map((id) => (
                  <Button key={id} variant="quiet" size="small" title="Take her out" onClick={() => setPart(index, { castIds: part.castIds?.filter((one) => one !== id) })}>
                    {content.loveInterests.find((li) => li.id === id)?.name ?? id} ×
                  </Button>
                ))}
                <select value="" onChange={(e) => e.target.value && setPart(index, { castIds: [...(part.castIds ?? []), e.target.value] })}>
                  <option value="">Add someone...</option>
                  {content.loveInterests
                    .filter((li) => !part.castIds?.includes(li.id))
                    .map((li) => (
                      <option key={li.id} value={li.id}>
                        {li.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="row checks">
              <label className="inline">
                <input type="checkbox" checked={cutscene !== undefined} onChange={(e) => setCutscene(index, e.target.checked ? { scenes: [{ locationId: place ?? content.locations[0].id, lines: [''] }] } : undefined)} />
                Opens on a cutscene: written lines, read with nothing to answer
              </label>
            </div>
            {cutscene && (
              <div className="event-cutscene">
                <div className="row">
                  <label>
                    Who speaks
                    <select value={cutscene.speakerId} onChange={(e) => setCutscene(index, { speakerId: e.target.value, outfitId: undefined })}>
                      {people.map((one) => (
                        <option key={one.id} value={one.id}>
                          {one.name}
                          {one.kind === 'npc' ? ' (NPC)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Wearing
                    <select value={cutscene.outfitId ?? ''} onChange={(e) => setCutscene(index, { outfitId: e.target.value || undefined })}>
                      <option value="">What she would wear that day</option>
                      {speaker?.outfits.map((outfit) => (
                        <option key={outfit.id} value={outfit.id}>
                          {outfit.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {cutscene.scenes.map((scene, at) => {
                  const where = content.locations.find((l) => l.id === scene.locationId)
                  const setScene = (patch: Partial<Intro['scenes'][number]>) => setCutscene(index, { scenes: cutscene.scenes.map((one, i) => (i === at ? { ...one, ...patch } : one)) })
                  return (
                    <div key={at} className="card">
                      <div className="row">
                        <label>
                          Where
                          <select value={scene.locationId} onChange={(e) => setScene({ locationId: e.target.value, backgroundId: undefined })}>
                            {content.locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          View
                          <select value={scene.backgroundId ?? ''} onChange={(e) => setScene({ backgroundId: e.target.value || undefined })}>
                            <option value="">As the day has it</option>
                            {where?.backgrounds.map((view) => (
                              <option key={view.id} value={view.id}>
                                {view.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="row checks">
                        <span className="caps">On stage</span>
                        {(scene.castIds ?? [cutscene.speakerId]).map((id) => (
                          <Button
                            key={id}
                            variant="quiet"
                            size="small"
                            title="Take her off the stage"
                            onClick={() => setScene({ castIds: (scene.castIds ?? [cutscene.speakerId]).filter((one) => one !== id) })}
                          >
                            {people.find((one) => one.id === id)?.name ?? id} ×
                          </Button>
                        ))}
                        <select value="" onChange={(e) => e.target.value && setScene({ castIds: [...(scene.castIds ?? [cutscene.speakerId]), e.target.value] })}>
                          <option value="">Add someone...</option>
                          {people
                            .filter((one) => !(scene.castIds ?? [cutscene.speakerId]).includes(one.id))
                            .map((one) => (
                              <option key={one.id} value={one.id}>
                                {one.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <Text
                        label="Lines"
                        rows={5}
                        value={scene.lines.join('\n')}
                        onChange={(text) => setScene({ lines: text.split('\n') })}
                        hint="One line a beat. A line in *asterisks* is narration; one that starts with a name (Seraphine: ...) is hers; the rest is the speaker's. Write {player} for his name."
                      />
                      {cutscene.scenes.length > 1 && (
                        <Button variant="quiet" size="small" onClick={() => setCutscene(index, { scenes: cutscene.scenes.filter((_, i) => i !== at) })}>
                          Remove this place
                        </Button>
                      )}
                    </div>
                  )
                })}
                <Button size="small" onClick={() => setCutscene(index, { scenes: [...cutscene.scenes, { locationId: place ?? content.locations[0].id, lines: [''] }] })}>
                  Add a place
                </Button>
              </div>
            )}

            <Button variant="quiet" size="small" onClick={() => onChange(event.program.filter((_, i) => i !== index))}>
              Remove this part
            </Button>
          </div>
        )
      })}
      <Button onClick={() => onChange([...event.program, blankPart(event, event.program.map((part) => part.id))])}>Add a part</Button>
    </Group>
  )
}
