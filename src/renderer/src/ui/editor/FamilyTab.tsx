import { useState } from 'react'
import { isSafeId } from '../../../../shared/editor'
import { SKIN_TONES, babyOutfitId, type LoveInterest, type Outfit, type SkinTone } from '../../../../shared/model'
import { babyOutfit } from '../../../../shared/comfy'
import { errorMessage } from '../../errors'
import { babyTonesOf } from '../../../../shared/game/skin'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { Group, List, Text } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'
import { t } from '../../../../shared/i18n'

interface Props {
  draft: LoveInterest
  set: (patch: Partial<LoveInterest>) => void
}

/** What a love interest brings to a child of hers: how it looks, the pictures of her with it just born, and what she would call it. */
export function FamilyTab({ draft, set }: Props) {
  const [notice, setNotice] = useState('')
  const ready = isSafeId(draft.id)
  // The art tool is open on one of her birth pictures, or one is being looked at whole: by the child's tone.
  const [birthing, setBirthing] = useState<SkinTone | null>(null)
  const [birthViewing, setBirthViewing] = useState<SkinTone | null>(null)
  const setBirth = (tone: SkinTone, image: string | undefined) => {
    const { [tone]: _gone, ...rest } = draft.birthPictures
    set({ birthPictures: image ? { ...rest, [tone]: image } : rest })
  }

  // Her holding a child of theirs, by its tone: an outfit of its own, made when it is first given a picture.
  const [holding, setHolding] = useState<SkinTone | null>(null)
  const [holdingViewing, setHoldingViewing] = useState<SkinTone | null>(null)
  const babyOf = (tone: SkinTone): Outfit | undefined => draft.outfits.find((outfit) => outfit.babyTone === tone)
  // Drawn from her as she is now, so that a tint or a parent changed since is in the next picture.
  const withBaby = (tone: SkinTone): LoveInterest => ({ ...draft, outfits: [...draft.outfits.filter((outfit) => outfit.babyTone !== tone), { ...babyOutfit(draft, tone), sprites: babyOf(tone)?.sprites ?? {} }] })
  const setHeld = (tone: SkinTone, image: string | undefined) => {
    const others = draft.outfits.filter((outfit) => outfit.babyTone !== tone)
    set({ outfits: image ? [...others, { ...babyOutfit(draft, tone), sprites: { neutral: { image, description: '' } } }] : others })
  }

  async function pickHeld(tone: SkinTone): Promise<void> {
    setNotice('')
    try {
      const picked = await window.api.editor.importAsset({ loveInterestId: draft.id, kind: 'image' })
      if (picked) setHeld(tone, picked)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  async function pick(tone: SkinTone): Promise<void> {
    setNotice('')
    try {
      const picked = await window.api.editor.importAsset({ loveInterestId: draft.id, kind: 'image' })
      if (picked) setBirth(tone, picked)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  return (
    <>
      {birthing && <ArtTool target={{ kind: 'birth', who: draft, tone: birthing, onUse: (path) => setBirth(birthing, path) }} onClose={() => setBirthing(null)} />}
      {holding && (
        <ArtTool
          target={{ kind: 'sprite', who: withBaby(holding), outfitId: babyOutfitId(holding), expression: 'neutral', onUse: (_outfit, _face, path) => setHeld(holding, path) }}
          onClose={() => setHolding(null)}
        />
      )}
      {holdingViewing && babyOf(holdingViewing)?.sprites.neutral && <Lightbox image={babyOf(holdingViewing)!.sprites.neutral.image} name={t('editor.family.withBaby', { tone: t(`editor.family.tone.${holdingViewing}`) })} onClose={() => setHoldingViewing(null)} />}
      {birthViewing && draft.birthPictures[birthViewing] && <Lightbox image={draft.birthPictures[birthViewing]!} name={t(`editor.family.tone.${birthViewing}`)} onClose={() => setBirthViewing(null)} />}
      {!ready && <p className="notice">{t('editor.common.idFirst')}</p>}
      {notice && <p className="notice">{notice}</p>}

      {/* How a child of hers looks: from her tone and his, and anything she gives it besides. */}
      <Group title={t('editor.family.looks')}>
        <label>
          {t('editor.family.skinTone')}
          <select value={draft.skinTone} onChange={(e) => set({ skinTone: e.target.value as SkinTone })}>
            {SKIN_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`editor.family.tone.${tone}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('editor.family.ownBabyTone')}
          <select value={draft.ownBabyTone ?? ''} onChange={(e) => set({ ownBabyTone: e.target.value === '' ? undefined : (e.target.value as SkinTone) })}>
            <option value="">{t('editor.family.byFather')}</option>
            {SKIN_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`editor.family.tone.${tone}`)}
              </option>
            ))}
          </select>
        </label>
        <Text label={t('editor.family.babyTint')} placeholder={t('editor.family.babyTintPlaceholder')} value={draft.babyTint ?? ''} onChange={(babyTint) => set({ babyTint: babyTint.trim() === '' ? undefined : babyTint })} />
      </Group>

      {/* The pictures of her with a newborn, one for each tone it may have: the whole stage of the scene of a birth he is there for. */}
      <Group title={t('editor.family.birth')} hint={t('editor.family.birthHint')}>
        <SlotGrid wide>
          {babyTonesOf(draft).map((tone) => {
            const image = draft.birthPictures[tone]
            const name = t(`editor.family.tone.${tone}`)
            return image ? (
              <PictureSlot
                key={tone}
                image={image}
                name={name}
                onView={() => setBirthViewing(tone)}
                actions={
                  <>
                    <Button disabled={!ready} onClick={() => void pick(tone)}>
                      {t('editor.common.replace')}
                    </Button>
                    <Button disabled={!ready} title={t('editor.common.drawAgain')} onClick={() => setBirthing(tone)}>
                      {t('editor.common.generate')}
                    </Button>
                    <Button onClick={() => setBirth(tone, undefined)}>{t('editor.common.remove')}</Button>
                  </>
                }
              />
            ) : (
              <EmptySlot key={tone} name={name} disabled={!ready} onAdd={() => void pick(tone)} onGenerate={() => setBirthing(tone)} />
            )
          })}
        </SlotGrid>
      </Group>

      {/* Her holding the child in the house: a sprite for each tone it can have, worn only there. */}
      <Group title={t('editor.family.holding')} hint={t('editor.family.holdingHint')}>
        <SlotGrid>
          {babyTonesOf(draft).map((tone) => {
            const image = babyOf(tone)?.sprites.neutral?.image
            const name = t('editor.family.withBaby', { tone: t(`editor.family.tone.${tone}`) })
            return image ? (
              <PictureSlot
                key={tone}
                image={image}
                name={name}
                onView={() => setHoldingViewing(tone)}
                actions={
                  <>
                    <Button disabled={!ready} onClick={() => void pickHeld(tone)}>
                      {t('editor.common.replace')}
                    </Button>
                    <Button disabled={!ready} title={t('editor.common.drawAgain')} onClick={() => setHolding(tone)}>
                      {t('editor.common.generate')}
                    </Button>
                    <Button onClick={() => setHeld(tone, undefined)}>{t('editor.common.remove')}</Button>
                  </>
                }
              />
            ) : (
              <EmptySlot key={tone} name={name} disabled={!ready} onAdd={() => void pickHeld(tone)} onGenerate={() => setHolding(tone)} />
            )
          })}
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
