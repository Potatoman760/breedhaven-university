import { useEffect, useState } from 'react'
import type { ContentPack } from '../../shared/model'
import { LoadingScreen } from './ui/LoadingScreen'

/**
 * The loading screen on its own, for looking at it without starting a scene: opened by `npm run preview:loading`, with
 * the love interest it names walking, or one picked at random. A click shows someone else.
 */
export function LoadingPreview({ who }: { who?: string }) {
  const [content, setContent] = useState<ContentPack | null>(null)
  const [error, setError] = useState('')
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    window.api.getContent().then(setContent, (e) => setError(String(e)))
  }, [])
  if (error) return <main className="title">{error}</main>
  if (!content) return null

  const walkers = content.loveInterests.filter((li) => li.walkSprite)
  const named = who ? walkers.find((li) => li.id === who.toLowerCase() || li.name.split(' ')[0].toLowerCase() === who.toLowerCase()) : undefined
  const shown = named ?? walkers[(Math.floor(Math.random() * walkers.length) + turn) % Math.max(walkers.length, 1)]
  const tips = content.tips.filter((tip) => tip.trim() !== '')
  return (
    <div style={{ position: 'fixed', inset: 0 }} onClick={() => !named && setTurn(turn + 1)}>
      {/* Keyed by who walks, so that a new one brings a new crowd. */}
      <LoadingScreen
        key={shown?.id ?? turn}
        walker={shown?.walkSprite ? { image: shown.walkSprite, stageHeight: shown.stageHeight } : undefined}
        label={who && !named ? `Nobody called "${who}" has a walking profile` : 'Loading'}
        tip={tips[turn % Math.max(tips.length, 1)]}
      />
    </div>
  )
}
