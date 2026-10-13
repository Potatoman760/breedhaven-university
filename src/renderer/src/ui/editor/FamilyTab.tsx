import { useState } from 'react'
import { isSafeId } from '../../../../shared/editor'
import type { LoveInterest } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { Group, List } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'

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
      {birthViewing && draft.birthPicture && <Lightbox image={draft.birthPicture} name="Birth" onClose={() => setBirthViewing(false)} />}
      {!ready && <p className="notice">Give the character an id before adding pictures: they are filed under it.</p>}
      {notice && <p className="notice">{notice}</p>}

      {/* The picture of her with a newborn: the whole stage of the scene of a birth he is there for. */}
      <Group
        title="Birth"
        hint="One picture of her just after giving birth: sitting up in a hospital bed in a gown, with the child in her arms. When he is there for the birth of a child of hers, the scene is set in it. Without one, the Health Center's maternity room is shown."
      >
        <SlotGrid wide>
          {draft.birthPicture ? (
            <PictureSlot
              image={draft.birthPicture}
              name="Birth"
              onView={() => setBirthViewing(true)}
              actions={
                <>
                  <Button disabled={!ready} onClick={pick}>
                    Replace
                  </Button>
                  <Button disabled={!ready} title="Draw it again with ComfyUI" onClick={() => setBirthing(true)}>
                    Generate
                  </Button>
                  <Button onClick={() => set({ birthPicture: undefined })}>Remove</Button>
                </>
              }
            />
          ) : (
            <EmptySlot name="Birth" disabled={!ready} onAdd={pick} onGenerate={() => setBirthing(true)} />
          )}
        </SlotGrid>
      </Group>

      <Group title="Birth control" hint="Most women take something against the Bloom, and seldom conceive while they do. She can be talked into stopping in a scene, if she comes to want his child.">
        <label className="inline">
          <input type="checkbox" checked={draft.birthControl} onChange={(e) => set({ birthControl: e.target.checked })} />
          On birth control when the game begins
        </label>
      </Group>

      <Group title="Names" hint="What she would call a child of hers. When one is born she suggests one of these that no child has yet.">
        <List label="Names for a daughter" value={draft.childNames.daughters} onChange={(daughters) => set({ childNames: { ...draft.childNames, daughters } })} />
        <List label="Names for a son" value={draft.childNames.sons} onChange={(sons) => set({ childNames: { ...draft.childNames, sons } })} />
      </Group>
    </>
  )
}
