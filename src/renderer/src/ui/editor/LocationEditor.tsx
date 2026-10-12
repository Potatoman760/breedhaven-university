import { useEffect, useRef, useState, type ReactNode } from 'react'
import { backgroundPrompt, framingFor, sizeFor } from '../../../../shared/comfy'
import { slugify, type EditorInfo } from '../../../../shared/editor'
import { viewImage } from '../../../../shared/game'
import { DEFAULT_VIEW, LIGHTS, STATS, type Stat, type Background, type ContentPack, type Light, type Location } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { BatchProgress, useBatch } from '../art/batch'
import { fileName, pngsIn, renamed, toWebp } from '../art/optimize'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { EditorFoot, Group, Text } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'

// What the run that makes the place's pictures smaller is filed under, beside the runs of its views.
const OPTIMIZE_BATCH = '(optimize)'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A location with its default view in place, first, whether or not its file had one. */
function withDefaultView(location: Location): Location {
  const own = location.backgrounds.find((view) => view.id === DEFAULT_VIEW.id) ?? { ...DEFAULT_VIEW, images: {} }
  return { ...location, backgrounds: [own, ...location.backgrounds.filter((view) => view.id !== DEFAULT_VIEW.id)] }
}

/** An id not already taken among the views, made from the wanted one: "counter", "counter-2"... */
function freeId(wanted: string, views: Background[]): string {
  const base = slugify(wanted) || 'view'
  let id = base
  for (let n = 2; views.some((view) => view.id === id); n++) id = `${base}-${n}`
  return id
}

/**
 * The places of the game: what is said of each, when it is open, and the pictures it is
 * shown with. A place has views, as a character has outfits, and each view has a picture
 * for each time of day, as an outfit has one for each expression. A place can be changed
 * but not added, since it has to be on the map to be reached. A changed one is kept in the
 * add-on folder and the game's own left as it was.
 */
export function LocationEditor({ content, onContent, switcher }: Props) {
  const [info, setInfo] = useState<EditorInfo | null>(null)
  const [search, setSearch] = useState('')
  const [original, setOriginal] = useState<Location>(() => withDefaultView(content.locations[0]))
  const [draft, setDraft] = useState<Location>(() => withDefaultView(content.locations[0]))
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  // The view and time of day the art tool is open on, while it is.
  const [drawing, setDrawing] = useState<{ viewId: string; period: Light } | null>(null)
  // The picture opened to be looked at whole, while one is.
  const [viewing, setViewing] = useState<{ viewId: string; period: Light } | null>(null)
  // The run that is drawing every missing time of day of one view, while there is one.
  const { batch, run, stop } = useBatch()
  // The draft as it stands now, for a run that outlives the render it was started from.
  const latest = useRef(draft)
  latest.current = draft

  useEffect(() => {
    window.api.editor.info().then(setInfo, (error) => setStatus(errorMessage(error)))
  }, [])

  // The place's pictures that are still PNGs: everything the optimize button would turn into WebP.
  const pngs = pngsIn(draft.backgrounds)
  /**
   * Turns every PNG of the place into a WebP of the same picture, one after another, and puts each in every view the
   * PNG was in as it is done. Nothing is kept until the place is saved; the PNGs go once a save no longer names them.
   */
  async function optimize() {
    const paths = pngsIn(latest.current.backgrounds)
    if (paths.length === 0 || batch) return
    setStatus('')
    const { failed } = await run(OPTIMIZE_BATCH, 'Optimizing', paths, fileName, async (path) => {
      try {
        const to = await toWebp(path)
        setDraft((current) => ({ ...current, backgrounds: renamed(current.backgrounds, path, to) }))
        return { ok: true }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    })
    setStatus(failed.length > 0 ? `Could not optimize: ${failed.join('; ')}` : 'Optimized. Save the place to keep it.')
  }

  // A view is drawn twice, as an outfit is drawn once for each expression.
  const periods = LIGHTS
  const dirty = !same(draft, original)
  const mayLeave = () => !dirty || window.confirm('Discard the changes you have not saved?')
  const set = (patch: Partial<Location>) => {
    // What was wrong with the last save may no longer be.
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const origin = info?.locations[draft.id]

  /** Changes one view of the draft as it stands now. */
  const changeView = (viewId: string, change: (view: Background) => Background) =>
    setDraft((current) => ({ ...current, backgrounds: current.backgrounds.map((view) => (view.id === viewId ? change(view) : view)) }))
  /** Puts a picture on a view for a time of day, or takes it off, keeping the times in the order of the day. */
  const setImage = (viewId: string, period: Light, image: string | undefined) =>
    changeView(viewId, (view) => {
      const images: Record<string, string | undefined> = { ...view.images, [period]: image }
      return { ...view, images: Object.fromEntries(periods.flatMap((p) => (images[p.id] ? [[p.id, images[p.id] as string]] : []))) }
    })

  function open(next: Location) {
    if (next.id === original.id || !mayLeave()) return
    setOriginal(withDefaultView(next))
    setDraft(withDefaultView(next))
    setIssues([])
    setStatus('')
  }

  async function apply(change: Promise<{ issues: string[]; content: ContentPack; info: EditorInfo }>, done: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      setInfo(result.info)
      onContent(result.content)
      const next = withDefaultView(result.content.locations.find((l) => l.id === draft.id) ?? result.content.locations[0])
      setOriginal(next)
      setDraft(next)
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Has the user pick a picture, which is copied into the add-on folder, for a view at a time of day. */
  async function upload(viewId: string, period: Light) {
    setStatus('')
    try {
      const image = await window.api.editor.importAsset({ loveInterestId: `location-${draft.id}`, kind: 'image' })
      if (image) setImage(viewId, period, image)
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  function addView() {
    const id = freeId('view', draft.backgrounds)
    set({ backgrounds: [...draft.backgrounds, { id, name: 'New view', images: {} }] })
  }

  /**
   * Draws every time of day a view lacks, one after another, and puts each on the view as
   * it arrives. Nothing is asked first: a picture that is not liked can be removed and drawn again.
   */
  async function generateMissing(viewId: string) {
    const view = latest.current.backgrounds.find((v) => v.id === viewId)
    if (!view) return
    const missing = periods.filter((p) => !(p.id in view.images))
    setStatus('')
    const settings = await window.api.comfy.getSettings()
    const size = sizeFor(settings, 'background')
    const { failed } = await run(viewId, 'Drawing', missing, (p) => p.name, async (p) => {
      const place = latest.current
      const now = place.backgrounds.find((v) => v.id === viewId)
      const result = await window.api.comfy.generate({
        kind: 'background',
        subjectId: place.id,
        name: `${viewId}-${p.id}`,
        positive: backgroundPrompt({ ...place, appearance: now?.appearance ?? place.appearance, indoors: now?.indoors ?? place.indoors }, now?.name ?? '', p.id, framingFor(settings, 'background')),
        width: size.width,
        height: size.height
      })
      // Without a working ComfyUI the rest would fail the same way.
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      setImage(viewId, p.id, result.path)
      return { ok: true }
    })
    if (failed.length > 0) setStatus(`Stopped at ${failed[0]}`)
  }

  const shown = content.locations.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()))
  const openAllDay = draft.open === undefined
  const viewed = draft.backgrounds.find((view) => view.id === viewing?.viewId)
  const drawn = draft.backgrounds.find((view) => view.id === drawing?.viewId)
  const periodName = (id: string) => periods.find((p) => p.id === id)?.name ?? id
  const isLight = (id: string): id is Light => periods.some((p) => p.id === id)

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {viewing && viewed?.images[viewing.period] && (
        <Lightbox image={viewed.images[viewing.period] ?? ''} name={`${draft.name}, ${viewed.name}: ${periodName(viewing.period)}`} onClose={() => setViewing(null)} />
      )}
      {drawing && drawn && (
        <ArtTool
          target={{
            kind: 'background',
            location: { id: draft.id, name: draft.name, appearance: drawn.appearance ?? draft.appearance, indoors: drawn.indoors ?? draft.indoors },
            periods: [...LIGHTS],
            view: drawn.name,
            period: drawing.period,
            // Onto the view it was opened for, at the time of day it was drawn for.
            onUse: (_view, image, period) => setImage(drawn.id, isLight(period) ? period : drawing.period, image)
          }}
          onClose={() => setDrawing(null)}
        />
      )}

      <aside className="editor-list">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${content.locations.length} locations`} aria-label="Search" />
        <div className="editor-people">
          {shown.map((location) => {
            const first = viewImage(location.backgrounds[0], 'day')
            const pictures = location.backgrounds.reduce((sum, view) => sum + Object.keys(view.images).length, 0)
            return (
              <button key={location.id} className={location.id === original.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(location)}>
                <span className="place-thumb" style={first ? { backgroundImage: `url("content://pack/${first}")` } : undefined} />
                <span>
                  <strong>{location.name}</strong>
                  <span className="hint">
                    {pictures} picture{pictures === 1 ? '' : 's'}
                    {location.private ? ' · private' : ''}
                  </span>
                </span>
              </button>
            )
          })}
          {shown.length === 0 && <p className="hint">No place by that name.</p>}
        </div>
        <Button variant="quiet" onClick={() => window.api.editor.openFolder()} title={info?.addonDir}>
          Open the add-on folder
        </Button>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || draft.id}</h1>
            <span className="hint">
              {origin === 'override' ? 'Built in, with your changes.' : 'Built in. Saving keeps your version in your add-ons and leaves the original untouched.'}
            </span>
          </div>
        </div>

        <div className="editor-body">
          <div className="row">
            <Text label="Name" value={draft.name} onChange={(name) => set({ name })} />
            <Text label="Id" value={draft.id} disabled onChange={() => undefined} />
          </div>
          <Text
            label="Description"
            value={draft.description}
            onChange={(description) => set({ description })}
            rows={4}
            hint="Told to the LLM in every scene here: what the place is, what goes on in it, who is found there and what a scene can draw on."
          />
          <Text
            label="Appearance"
            value={draft.appearance}
            onChange={(appearance) => set({ appearance })}
            rows={4}
            hint="Sent to the image model when a picture of the place is generated, and to nothing else. Only what can be seen, with nobody in it."
          />
          <div className="row checks">
            <label className="inline">
              <input type="checkbox" checked={draft.indoors} onChange={(e) => set({ indoors: e.target.checked })} />
              Indoors: under a roof, out of the weather
            </label>
            <label className="inline">
              <input type="checkbox" checked={draft.private} onChange={(e) => set({ private: e.target.checked })} />
              Private: nobody turns up here uninvited
            </label>
          </div>

          <Group title="Opening hours" hint="When the place can be gone to. From an hour up to, but not including, another; it may run past midnight.">
            <div className="row checks">
              <label className="inline">
                <input type="checkbox" checked={openAllDay} onChange={(e) => set({ open: e.target.checked ? undefined : { fromHour: 8, toHour: 22 } })} />
                Always open
              </label>
              {draft.open && (
                <>
                  <label className="inline">
                    From
                    <select value={draft.open.fromHour} onChange={(e) => set({ open: { ...draft.open!, fromHour: Number(e.target.value) } })}>
                      {Array.from({ length: content.calendar.hoursPerDay }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline">
                    to
                    <select value={draft.open.toHour} onChange={(e) => set({ open: { ...draft.open!, toHour: Number(e.target.value) } })}>
                      {Array.from({ length: content.calendar.hoursPerDay }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </Group>

          <Group
            title="Ways to raise a stat here"
            hint="What the day view suggests when the player asks how to get better at something: one is picked for each stat from every place that has one. Each is two hours, a scene with whoever is there, and raises that stat. The stats named here are also what the place counts as good for."
          >
            {draft.drills.map((drill, index) => {
              const change = (patch: Partial<typeof drill>) => set({ drills: draft.drills.map((d, i) => (i === index ? { ...d, ...patch } : d)) })
              return (
                <div key={index} className="card">
                  <div className="row">
                    <label>
                      Raises
                      <select value={drill.stat} onChange={(e) => change({ stat: e.target.value as Stat })}>
                        {STATS.map((stat) => (
                          <option key={stat} value={stat}>
                            {stat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Text label="What it is" value={drill.title} onChange={(title) => change({ title })} placeholder="A workout on the racks" />
                    <Button variant="quiet" onClick={() => set({ drills: draft.drills.filter((_, i) => i !== index) })}>
                      Remove
                    </Button>
                  </div>
                  <Text label="How it opens" value={drill.description} onChange={(description) => change({ description })} placeholder="You load a bar, chalk your hands and start on the first set." />
                </div>
              )
            })}
            <Button onClick={() => set({ drills: [...draft.drills, { stat: 'strength', title: '', description: '' }] })}>Add one</Button>
          </Group>

          <Group
            title="Views"
            hint="A place has views, as a character has outfits. Every place has its default view. Another view is shown in its place on the day of an event or holiday of the same name: call one “Winter Break” and the place is dressed for it while it lasts. Each is drawn twice, by day and by night; whichever has not been drawn shows the other. Pictures are generated from the appearance above."
          >
            <div className="outfit-actions">
              <Button
                disabled={batch !== null || pngs.length === 0}
                title="Turn every PNG of this place into a WebP of the same picture, a fraction of the size, and put it in the same views"
                onClick={optimize}
              >
                {pngs.length > 0 ? `Optimize (${pngs.length} PNG${pngs.length === 1 ? '' : 's'})` : 'Optimized'}
              </Button>
            </div>
            <BatchProgress batch={batch} at={OPTIMIZE_BATCH} onStop={stop} />
            {draft.backgrounds.map((view, index) => {
              const missing = periods.filter((p) => !(p.id in view.images))
              const isDefault = view.id === DEFAULT_VIEW.id
              return (
                <div key={view.id} className="outfit card">
                  <div className="row">
                    <Text label="Name" value={view.name} disabled={isDefault} onChange={(name) => changeView(view.id, (v) => ({ ...v, name }))} />
                    <label>
                      Under a roof
                      <select
                        value={view.indoors === undefined ? '' : view.indoors ? 'yes' : 'no'}
                        onChange={(e) => changeView(view.id, (v) => ({ ...v, indoors: e.target.value === '' ? undefined : e.target.value === 'yes' }))}
                      >
                        <option value="">As the place is ({draft.indoors ? 'indoors' : 'out of doors'})</option>
                        <option value="yes">Indoors</option>
                        <option value="no">Out of doors</option>
                      </select>
                    </label>
                  </div>
                  {/* A view that is a room of its own, such as one room of a house, can say what it is and what it looks like. */}
                  <Text
                    label="What this view is"
                    value={view.description ?? ''}
                    rows={2}
                    placeholder="Left empty, the place's own description is all a character is told."
                    onChange={(description) => changeView(view.id, (v) => ({ ...v, description: description || undefined }))}
                  />
                  <Text
                    label="What it looks like"
                    value={view.appearance ?? ''}
                    rows={2}
                    placeholder="Left empty, it is drawn from the place's own appearance."
                    onChange={(appearance) => changeView(view.id, (v) => ({ ...v, appearance: appearance || undefined }))}
                  />
                  <div className="outfit-actions">
                    {missing.length > 0 && (
                      <Button
                        disabled={batch !== null}
                        title="Draws whichever of day and night this view does not have yet with your own ComfyUI, and sets each as it is finished"
                        onClick={() => generateMissing(view.id)}
                      >
                        {missing.length === periods.length ? 'Generate day and night' : `Generate the missing ${missing[0].name.toLowerCase()} picture`}
                      </Button>
                    )}
                    <Button
                      disabled={isDefault || index <= 1}
                      title="The order the other views are offered to the player in"
                      onClick={() => {
                        const views = [...draft.backgrounds]
                        ;[views[index - 1], views[index]] = [views[index], views[index - 1]]
                        set({ backgrounds: views })
                      }}
                    >
                      Move up
                    </Button>
                    <Button variant="quiet" className="outfit-remove" disabled={isDefault} title={isDefault ? 'Every place has its default view' : undefined} onClick={() => set({ backgrounds: draft.backgrounds.filter((v) => v.id !== view.id) })}>
                      Remove view
                    </Button>
                  </div>
                  <BatchProgress batch={batch} at={view.id} onStop={stop} />

                  <SlotGrid wide>
                    {periods.map((p) =>
                      view.images[p.id] ? (
                        <PictureSlot
                          key={p.id}
                          image={view.images[p.id] ?? ''}
                          name={p.name}
                          onView={() => setViewing({ viewId: view.id, period: p.id })}
                          actions={
                            <>
                              <Button onClick={() => upload(view.id, p.id)}>Replace</Button>
                              <Button title="Draw this one again with ComfyUI" onClick={() => setDrawing({ viewId: view.id, period: p.id })}>
                                Generate
                              </Button>
                              <Button onClick={() => setImage(view.id, p.id, undefined)}>Remove</Button>
                            </>
                          }
                        />
                      ) : (
                        <EmptySlot key={p.id} name={p.name} onAdd={() => upload(view.id, p.id)} onGenerate={() => setDrawing({ viewId: view.id, period: p.id })} />
                      )
                    )}
                  </SlotGrid>
                </div>
              )
            })}
            <Button onClick={addView}>Add a view</Button>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          onUndo={() => {
            setDraft(original)
            setIssues([])
          }}
          onSave={() => apply(window.api.editor.saveLocation(draft), 'Saved to your add-ons.')}
          remove={
            origin === 'override'
              ? {
                  label: 'Put back the original',
                  onClick: () => window.confirm(`Put ${draft.name} back as it shipped? Your changes to it are lost.`) && apply(window.api.editor.deleteLocation(draft.id), 'Put back as shipped.')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
