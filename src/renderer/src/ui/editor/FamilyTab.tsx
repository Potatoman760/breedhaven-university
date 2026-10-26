import { useState } from 'react'
import { isSafeId } from '../../../../shared/editor'
import type { LoveInterest } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { Group, List } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'
import { t } from '../../../../shared/i18n'

interface Props {
  draft: LoveInterest
  set: (patch: Partial<LoveInterest>) => void
}

/** What a love interest brings to a child of hers: the picture of her with it just born, and what she would call it. */
export function FamilyTab({ draft, set }: Props) {
  const [notice, setNotice] = useState('')
  const ready = isSafeId(draft.id)
  // The art tool is open on her birth picture, or that picture is being looked at whole.
  const [birthing, setBirthing] = useState(false)
  const [birthViewing, setBirthViewing] = useState(false)

  async function pick(): Promise<void> {
    setNotice('')
    try {
      const picked = await window.api.editor.importAsset({ loveInterestId: draft.id, kind: 'image' })
      if (picked) set({ birthPicture: picked })
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  return (
    <>
      {birthing && <ArtTool target={{ kind: 'birth', who: draft, onUse: (birthPicture) => set({ birthPicture }) }} onClose={() => setBirthing(false)} />}
      {birthViewing && draft.birthPicture && <Lightbox image={draft.birthPicture} name={t('editor.family.birth')} onClose={() => setBirthViewing(false)} />}
      {!ready && <p className="notice">{t('editor.common.idFirst')}</p>}
      {notice && <p className="notice">{notice}</p>}

      {/* The picture of her with a newborn: the whole stage of the scene of a birth he is there for. */}
      <Group
        title={t('editor.family.birth')}
        hint={t('editor.family.birthHint')}
      >
        <SlotGrid wide>
          {draft.birthPicture ? (
            <PictureSlot
              image={draft.birthPicture}
              name={t('editor.family.birth')}
              onView={() => setBirthViewing(true)}
              actions={
                <>
                  <Button disabled={!ready} onClick={pick}>
                    {t('editor.common.replace')}
                  </Button>
                  <Button disabled={!ready} title={t('editor.common.drawAgain')} onClick={() => setBirthing(true)}>
                    {t('editor.common.generate')}
                  </Button>
                  <Button onClick={() => set({ birthPicture: undefined })}>{t('editor.common.remove')}</Button>
                </>
              }
            />
          ) : (
            <EmptySlot name={t('editor.family.birth')} disabled={!ready} onAdd={pick} onGenerate={() => setBirthing(true)} />
          )}
        </SlotGrid>
      </Group>

      <Group title={t('editor.family.birthControl')} hint={t('editor.family.birthControlHint')}>
        <label className="inline">
          <input type="checkbox" checked={draft.birthControl} onChange={(e) => set({ birthControl: e.target.checked })} />
          {t('editor.family.onBirthControl')}
        </label>
      </Group>

      <Group title={t('editor.family.names')} hint={t('editor.family.namesHint')}>
        <List label={t('editor.family.daughters')} value={draft.childNames.daughters} onChange={(daughters) => set({ childNames: { ...draft.childNames, daughters } })} />
        <List label={t('editor.family.sons')} value={draft.childNames.sons} onChange={(sons) => set({ childNames: { ...draft.childNames, sons } })} />
      </Group>
    </>
  )
}
