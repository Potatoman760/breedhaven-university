import { useEffect, useState } from 'react'
import type { ContentPack } from '../../shared/model'
import { spriteFor } from '../../shared/game'
import { LanternRelease } from './ui/LanternRelease'
import { t } from '../../shared/i18n'

/**
 * The lanterns let go at the festival date, on their own, for looking at without playing to it: opened by
 * `npm run preview:lantern`, with the one or two love interests it names, or one or two picked at random. When it is
 * over, or on a click, it plays again with others.
 */
export function LanternPreview({ who }: { who?: string }) {
  const [content, setContent] = useState<ContentPack | null>(null)
  const [error, setError] = useState('')
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    window.api.getContent().then(setContent, (e) => setError(String(e)))
  }, [])
  if (error) return <main className="title">{error}</main>
  if (!content) return null

  // Those with a glad face to show, as each usually dresses.
  const happy = (li: ContentPack['loveInterests'][number]) => spriteFor(li, li.outfits.find((outfit) => outfit.id === li.defaultOutfitId), 'happy')
  const walkers = content.loveInterests.filter((li) => happy(li))
  const find = (name: string) => walkers.find((li) => li.id === name.toLowerCase() || li.name.split(' ')[0].toLowerCase() === name.toLowerCase())
  const named = (who ?? '').split(',').map((name) => name.trim()).filter(Boolean).flatMap((name) => find(name) ?? [])
  // Unnamed, it is one and then two, by turns.
  const count = turn % 2 === 0 ? 1 : 2
  const first = Math.floor(Math.random() * walkers.length)
  const shown = named.length > 0 ? named : Array.from({ length: count }, (_, i) => walkers[(first + i) % walkers.length])
  return (
    <LanternRelease
      key={turn}
      dates={shown.flatMap((li) => {
        const image = li && happy(li)
        return image ? [{ id: li.id, image, stageHeight: li.stageHeight }] : []
      })}
      // Lines as they might be, to see the balloons without asking the LLM.
      lines={() =>
        Promise.resolve(
          shown.flatMap((li, i) =>
            li ? [{ speakerId: li.id, text: i === 0 ? t('shell.preview.lanternFirst') : t('shell.preview.lanternSecond') }] : []
          )
        )
      }
      onDone={() => setTurn((now) => now + 1)}
    />
  )
}
