import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { EditorInfo } from '../../../../shared/editor'
import type { ContentPack } from '../../../../shared/model'
import { packChoices, type PackChoice, type PackPicks, type PackPreview } from '../../../../shared/packs'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { Group } from './fields'
import { t, type MessageKey } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const KINDS: { kind: keyof PackPicks; title: MessageKey }[] = [
  { kind: 'outfits', title: 'editor.packs.outfits' },
  { kind: 'expressions', title: 'editor.packs.expressions' },
  { kind: 'acts', title: 'editor.packs.acts' }
]

const NOTHING: PackPicks = { outfits: [], expressions: [], acts: [] }
// What the list opens in place of a character: the majors.
const MAJORS = 'majors'

const filesOf = ({ pictures, clips }: PackChoice) => t('editor.packs.files', { pictures, clips, both: pictures > 0 && clips > 0 })

const countOf = (picks: PackPicks | undefined) => (picks ? picks.outfits.length + picks.expressions.length + picks.acts.length : 0)

/**
 * Packs: a player's own outfits, expressions, sex-acts, characters and majors put in a zip to pass on, and a zip from
 * someone else brought in. Things are chosen character by character. From source all of it can go in; a player has only their own.
 */
export function PacksEditor({ content, onContent, switcher }: Props) {
  const [info, setInfo] = useState<EditorInfo>()
  useEffect(() => {
    window.api.editor.info().then(setInfo, () => undefined)
  }, [])
  const choices = useMemo(() => (info ? packChoices(content, info) : { characters: [], majors: [] }), [content, info])
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string>()
  const [picked, setPicked] = useState<Record<string, PackPicks>>({})
  const [people, setPeople] = useState<string[]>([])
  const [majors, setMajors] = useState<string[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [preview, setPreview] = useState<PackPreview>()

  const listed = choices.characters.filter((who) => who.name.toLowerCase().includes(search.trim().toLowerCase()))
  const showingMajors = openId === MAJORS
  const open = showingMajors ? undefined : (choices.characters.find((who) => who.id === openId) ?? listed[0])
  // One going whole counts once, whatever else was ticked for her.
  const items = people.length + majors.length + Object.entries(picked).reduce((total, [id, picks]) => total + (people.includes(id) ? 0 : countOf(picks)), 0)
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((one) => one !== id))

  const setPicks = (id: string, kind: keyof PackPicks, ids: string[]) => setPicked((now) => ({ ...now, [id]: { ...(now[id] ?? NOTHING), [kind]: ids } }))

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setIssues([])
    setStatus('')
    try {
      await work()
    } catch (error) {
      setIssues([errorMessage(error)])
    } finally {
      setBusy(false)
    }
  }

  const create = () =>
    run(async () => {
      const made = await window.api.editor.exportPack({ name: name.trim(), characters: picked, people, majors })
      if (!made) return
      setStatus(t(made.missing > 0 ? 'editor.packs.createdMissing' : 'editor.packs.created', made))
    })

  const look = () =>
    run(async () => {
      const opened = await window.api.editor.openPack()
      if (opened?.error) setIssues([opened.error])
      else if (opened?.preview) setPreview(opened.preview)
    })

  const install = () =>
    run(async () => {
      setPreview(undefined)
      const result = await window.api.editor.installPack()
      setIssues([...result.issues, ...result.notes])
      if (result.issues.length > 0) return
      onContent(result.content)
      const added = result.installed.length + result.majors.length
      setInfo(result.info)
      setStatus(added > 0 ? t('editor.packs.imported', { n: added }) : t('editor.packs.nothingToImport'))
    })

  return (
    <main className="editor">
      {switcher(() => true)}
      {preview && (
        <Dialog title={preview.name} onClose={() => setPreview(undefined)} noClose>
          <div className="pack-preview">
            {preview.looks.length > 0 && <p className="hint">{t('editor.packs.previewNew', { names: preview.looks.join(', ') })}</p>}
            {preview.majors.map((major) => (
              <section key={major.name}>
                <strong>{major.present ? t('editor.packs.keepsOwn', { name: major.name }) : major.name}</strong>
              </section>
            ))}
            {preview.people.map((who) => (
              <section key={who.id}>
                <strong>{who.name}</strong>
                <span className="hint">{t('editor.packs.files', { pictures: who.pictures, clips: who.clips, both: who.pictures > 0 && who.clips > 0 })}</span>
                {who.replaces && <span className="notice">{t('editor.packs.previewReplacesWhole')}</span>}
              </section>
            ))}
            {preview.characters.map((who) => (
              <section key={who.id}>
                <strong>{who.name}</strong>
                {who.present ? (
                  <>
                    {[...who.outfits, ...who.expressions, ...who.acts].length > 0 && <span>{[...who.outfits, ...who.expressions, ...who.acts].join(', ')}</span>}
                    <span className="hint">{t('editor.packs.files', { pictures: who.pictures, clips: who.clips, both: who.pictures > 0 && who.clips > 0 })}</span>
                    {who.replaces.length > 0 && <span className="notice">{t('editor.packs.previewReplaces', { names: [...new Set(who.replaces)].join(', ') })}</span>}
                  </>
                ) : (
                  <span className="hint">{t('editor.packs.previewAbsent')}</span>
                )}
              </section>
            ))}
          </div>
          <div className="actions end">
            <Button variant="quiet" onClick={() => setPreview(undefined)}>
              {t('editor.packs.cancel')}
            </Button>
            <Button variant="primary" disabled={!preview.characters.some((who) => who.present) && preview.people.length === 0 && !preview.majors.some((major) => !major.present)} onClick={() => void install()}>
              {t('editor.packs.import')}
            </Button>
          </div>
        </Dialog>
      )}
      <aside className="editor-list">
        <input aria-label={t('editor.packs.searchLabel')} placeholder={t('editor.packs.searchLabel')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="editor-people">
          {choices.majors.length > 0 && (
            <button className={showingMajors ? 'courier-person selected' : 'courier-person'} onClick={() => setOpenId(MAJORS)}>
              <span>
                <strong>{t('editor.packs.majors')}</strong>
                {majors.length > 0 && <span className="hint">{t('editor.packs.selected', { n: majors.length })}</span>}
              </span>
            </button>
          )}
          {listed.map((who) => {
            const chosen = people.includes(who.id) ? 1 : countOf(picked[who.id])
            return (
              <button key={who.id} className={who.id === open?.id ? 'courier-person selected' : 'courier-person'} onClick={() => setOpenId(who.id)}>
                <span>
                  <strong>{who.name}</strong>
                  {chosen > 0 && <span className="hint">{t('editor.packs.selected', { n: chosen })}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{showingMajors ? t('editor.packs.majors') : (open?.name ?? t('editor.packs.title'))}</h1>
          </div>
          <Button disabled={busy} onClick={() => void look()}>
            {busy ? t('editor.packs.importing') : t('editor.packs.import')}
          </Button>
        </div>

        <div className="editor-body">
          {!open && !showingMajors && <p className="hint">{t(choices.characters.length === 0 ? 'editor.packs.noneYet' : 'editor.packs.pick')}</p>}
          {showingMajors && (
            <Group title={t('editor.packs.majors')}>
              <div className="pack-choices">
                {choices.majors.map((major) => (
                  <label key={major.code} className="inline">
                    <input type="checkbox" checked={majors.includes(major.code)} onChange={(e) => setMajors(toggle(majors, major.code, e.target.checked))} />
                    <span>{major.name}</span>
                    <span className="hint">{major.code}</span>
                  </label>
                ))}
              </div>
            </Group>
          )}
          {open?.whole && (
            <label className="inline" title={t('editor.packs.wholeTitle')}>
              <input type="checkbox" checked={people.includes(open.id)} onChange={(e) => setPeople(toggle(people, open.id, e.target.checked))} />
              <span>{t('editor.packs.whole')}</span>
              <span className="hint">{filesOf(open.whole)}</span>
            </label>
          )}
          {open &&
            !people.includes(open.id) &&
            KINDS.map(({ kind, title }) => {
              const options = open[kind]
              if (options.length === 0) return null
              const chosen = picked[open.id]?.[kind] ?? []
              const all = chosen.length === options.length
              return (
                <Group key={kind} title={t(title)}>
                  <Button variant="quiet" size="small" className="pack-all" onClick={() => setPicks(open.id, kind, all ? [] : options.map((one) => one.id))}>
                    {t(all ? 'editor.packs.selectNone' : 'editor.packs.selectAll')}
                  </Button>
                  <div className="pack-choices">
                    {options.map((one) => (
                      <label key={one.id} className="inline">
                        <input
                          type="checkbox"
                          checked={chosen.includes(one.id)}
                          onChange={(e) => setPicks(open.id, kind, e.target.checked ? [...chosen, one.id] : chosen.filter((id) => id !== one.id))}
                        />
                        <span>{one.name}</span>
                        <span className="hint">{filesOf(one)}</span>
                      </label>
                    ))}
                  </div>
                </Group>
              )
            })}
        </div>

        <div className="editor-foot">
          <div className="editor-status">
            {issues.map((issue) => (
              <p key={issue} className="notice">
                {issue}
              </p>
            ))}
            {status && <p className="hint">{status}</p>}
            {!status && issues.length === 0 && items > 0 && <p className="hint">{t('editor.packs.summary', { items })}</p>}
          </div>
          <input aria-label={t('editor.packs.name')} placeholder={t('editor.packs.name')} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" disabled={busy || items === 0 || name.trim() === ''} onClick={() => void create()}>
            {busy ? t('editor.packs.creating') : t('editor.packs.create')}
          </Button>
        </div>
      </section>
    </main>
  )
}
