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
import { t } from '../../../../shared/i18n'

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
    const { failed } = await run(OPTIMIZE_BATCH, t('editor.common.optimizing'), paths, fileName, async (path) => {
      try {
        const to = await toWebp(path)
        setDraft((current) => ({ ...current, backgrounds: renamed(current.backgrounds, path, to) }))
        return { ok: true }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    })
    setStatus(failed.length > 0 ? t('editor.common.optimizeFailed', { failed: failed.join('; ') }) : t('editor.locations.optimized'))
  }

  // A view is drawn twice, as an outfit is drawn once for each expression.
  const periods = LIGHTS
  const dirty = !same(draft, original)
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
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
    const { failed } = await run(viewId, t('editor.common.drawing'), missing, (p) => p.name, async (p) => {
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
    if (failed.length > 0) setStatus(t('editor.common.stoppedAt', { name: failed[0] }))
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
        <Lightbox image={viewed.images[viewing.period] ?? ''} name={t('editor.locations.viewing', { place: draft.name, view: viewed.name, period: periodName(viewing.period) })} onClose={() => setViewing(null)} />
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
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('editor.locations.search', { count: content.locations.length })} aria-label={t('editor.common.search')} />
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
                    {t('editor.locations.listed', { count: pictures, private: location.private })}
                  </span>
                </span>
              </button>
            )
          })}
          {shown.length === 0 && <p className="hint">{t('editor.locations.noneFound')}</p>}
        </div>
        <Button variant="quiet" onClick={() => window.api.editor.openFolder()} title={info?.addonDir}>
          {t('editor.common.openFolder')}
        </Button>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || draft.id}</h1>
            <span className="hint">
              {origin === 'override' ? t('editor.common.builtInChanged') : t('editor.common.builtIn')}
            </span>
          </div>
        </div>

        <div className="editor-body">
          <div className="row">
            <Text label={t('editor.common.name')} value={draft.name} onChange={(name) => set({ name })} />
            <Text label={t('editor.common.id')} value={draft.id} disabled onChange={() => undefined} />
          </div>
          <Text
            label={t('editor.common.description')}
            value={draft.description}
            onChange={(description) => set({ description })}
            rows={4}
            hint={t('editor.locations.descriptionHint')}
          />
          <Text
            label={t('editor.common.appearance')}
            value={draft.appearance}
            onChange={(appearance) => set({ appearance })}
            rows={4}
            hint={t('editor.locations.appearanceHint')}
          />
          <div className="row checks">
            <label className="inline">
              <input type="checkbox" checked={draft.indoors} onChange={(e) => set({ indoors: e.target.checked })} />
              {t('editor.locations.indoors')}
            </label>
            <label className="inline">
              <input type="checkbox" checked={draft.private} onChange={(e) => set({ private: e.target.checked })} />
              {t('editor.locations.private')}
            </label>
          </div>

          <Group title={t('editor.locations.hours')} hint={t('editor.locations.hoursHint')}>
            <div className="row checks">
              <label className="inline">
                <input type="checkbox" checked={openAllDay} onChange={(e) => set({ open: e.target.checked ? undefined : { fromHour: 8, toHour: 22 } })} />
                {t('editor.locations.alwaysOpen')}
              </label>
              {draft.open && (
                <>
                  <label className="inline">
                    {t('editor.locations.from')}
                    <select value={draft.open.fromHour} onChange={(e) => set({ open: { ...draft.open!, fromHour: Number(e.target.value) } })}>
                      {Array.from({ length: content.calendar.hoursPerDay }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline">
                    {t('editor.locations.to')}
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
            title={t('editor.locations.drills')}
            hint={t('editor.locations.drillsHint')}
          >
            {draft.drills.map((drill, index) => {
              const change = (patch: Partial<typeof drill>) => set({ drills: draft.drills.map((d, i) => (i === index ? { ...d, ...patch } : d)) })
              return (
                <div key={index} className="card">
                  <div className="row">
                    <label>
                      {t('editor.locations.raises')}
                      <select value={drill.stat} onChange={(e) => change({ stat: e.target.value as Stat })}>
                        {STATS.map((stat) => (
                          <option key={stat} value={stat}>
                            {stat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Text label={t('editor.jobs.whatItIs')} value={drill.title} onChange={(title) => change({ title })} placeholder={t('editor.locations.drillPlaceholder')} />
                    <Button variant="quiet" onClick={() => set({ drills: draft.drills.filter((_, i) => i !== index) })}>
                      {t('editor.common.remove')}
                    </Button>
                  </div>
                  <Text label={t('editor.locations.opens')} value={drill.description} onChange={(description) => change({ description })} placeholder={t('editor.locations.opensPlaceholder')} />
                </div>
              )
            })}
            <Button onClick={() => set({ drills: [...draft.drills, { stat: 'strength', title: '', description: '' }] })}>{t('editor.locations.addDrill')}</Button>
          </Group>

          <Group
            title={t('editor.locations.views')}
            hint={t('editor.locations.viewsHint')}
          >
            <div className="outfit-actions">
              <Button
                disabled={batch !== null || pngs.length === 0}
                title={t('editor.locations.optimizeTitle')}
                onClick={optimize}
              >
                {pngs.length > 0 ? t('editor.common.optimize', { count: pngs.length }) : t('editor.common.optimizedButton')}
              </Button>
            </div>
            <BatchProgress batch={batch} at={OPTIMIZE_BATCH} onStop={stop} />
            {draft.backgrounds.map((view, index) => {
              const missing = periods.filter((p) => !(p.id in view.images))
              const isDefault = view.id === DEFAULT_VIEW.id
              return (
                <div key={view.id} className="outfit card">
                  <div className="row">
                    <Text
                      label={t('editor.common.name')}
                      value={view.name}
                      disabled={isDefault}
                      onChange={(name) => changeView(view.id, (v) => ({ ...v, name }))}
                      hint={isDefault ? undefined : content.calendar.events.some((event) => event.name.toLowerCase() === view.name.trim().toLowerCase() || event.id === view.id) ? t('editor.locations.eventView') : t('editor.locations.eventViewHint')}
                    />
                    <label>
                      {t('editor.locations.underRoof')}
                      <select
                        value={view.indoors === undefined ? '' : view.indoors ? 'yes' : 'no'}
                        onChange={(e) => changeView(view.id, (v) => ({ ...v, indoors: e.target.value === '' ? undefined : e.target.value === 'yes' }))}
                      >
                        <option value="">{t('editor.locations.asPlace', { indoors: draft.indoors })}</option>
                        <option value="yes">{t('editor.locations.indoorsOption')}</option>
                        <option value="no">{t('editor.locations.outdoorsOption')}</option>
                      </select>
                    </label>
                  </div>
                  {/* A view that is a room of its own, such as one room of a house, can say what it is and what it looks like. */}
                  <Text
                    label={t('editor.locations.viewDescription')}
                    value={view.description ?? ''}
                    rows={2}
                    placeholder={t('editor.locations.viewDescriptionPlaceholder')}
                    onChange={(description) => changeView(view.id, (v) => ({ ...v, description: description || undefined }))}
                  />
                  <Text
                    label={t('editor.locations.viewAppearance')}
                    value={view.appearance ?? ''}
                    rows={2}
                    placeholder={t('editor.locations.viewAppearancePlaceholder')}
                    onChange={(appearance) => changeView(view.id, (v) => ({ ...v, appearance: appearance || undefined }))}
                  />
                  <div className="outfit-actions">
                    {missing.length > 0 && (
                      <Button
                        disabled={batch !== null}
                        title={t('editor.locations.generateMissingTitle')}
                        onClick={() => generateMissing(view.id)}
                      >
                        {missing.length === periods.length ? t('editor.locations.generateBoth') : t('editor.locations.generateMissing', { period: missing[0].name.toLowerCase() })}
                      </Button>
                    )}
                    <Button
                      disabled={isDefault || index <= 1}
                      title={t('editor.locations.moveUpTitle')}
                      onClick={() => {
                        const views = [...draft.backgrounds]
                        ;[views[index - 1], views[index]] = [views[index], views[index - 1]]
                        set({ backgrounds: views })
                      }}
                    >
                      {t('editor.common.moveUp')}
                    </Button>
                    <Button variant="quiet" className="outfit-remove" disabled={isDefault} title={isDefault ? t('editor.locations.defaultView') : undefined} onClick={() => set({ backgrounds: draft.backgrounds.filter((v) => v.id !== view.id) })}>
                      {t('editor.locations.removeView')}
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
                              <Button onClick={() => upload(view.id, p.id)}>{t('editor.common.replace')}</Button>
                              <Button title={t('editor.common.drawThisAgain')} onClick={() => setDrawing({ viewId: view.id, period: p.id })}>
                                {t('editor.common.generate')}
                              </Button>
                              <Button onClick={() => setImage(view.id, p.id, undefined)}>{t('editor.common.remove')}</Button>
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
            <Button onClick={addView}>{t('editor.locations.addView')}</Button>
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
          onSave={() => apply(window.api.editor.saveLocation(draft), t('editor.common.savedAddons'))}
          remove={
            origin === 'override'
              ? {
                  label: t('editor.common.putBack'),
                  onClick: () => window.confirm(t('editor.common.putBackConfirm', { name: draft.name })) && apply(window.api.editor.deleteLocation(draft.id), t('editor.player.putBackDone'))
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
