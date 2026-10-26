import { useEffect, useState } from 'react'
import { spriteFor } from '../../shared/game'
import type { ContentPack } from '../../shared/model'
import { TripMoment, type TripMomentKind } from './ui/TripMoment'
import { t, type MessageKey } from '../../shared/i18n'

const KINDS: TripMomentKind[] = ['drive-there', 'soak', 'cascade', 'market', 'private-bath', 'fireworks', 'last-morning', 'drive-home']
const TITLES: Partial<Record<TripMomentKind, MessageKey>> = {
  soak: 'shell.preview.soak',
  cascade: 'shell.preview.cascade',
  market: 'shell.preview.market',
  'private-bath': 'shell.preview.privateBath',
  fireworks: 'shell.preview.fireworks',
  'last-morning': 'shell.preview.lastMorning'
}

/**
 * The moments of the Saltmere trip on their own, for looking at without playing to the break: opened by
 * `npm run preview:trip`, all of them in turn from the drive there to the drive home, or only the one named, with the
 * one or two love interests named or two picked at random. A click goes on to the next.
 */
export function TripPreview({ who }: { who?: string }) {
  const [content, setContent] = useState<ContentPack | null>(null)
  const [error, setError] = useState('')
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    window.api.getContent().then(setContent, (e) => setError(String(e)))
  }, [])
  if (error) return <main className="title">{error}</main>
  if (!content) return null

  // "<kind>", "<kind>:<who>,<who>" or "<who>,<who>".
  const [first, second] = (who ?? '').split(':')
  const named = KINDS.find((kind) => kind === first)
  const people = (named ? second : first) ?? ''
  const happy = (li: ContentPack['loveInterests'][number]) => spriteFor(li, li.outfits.find((outfit) => outfit.id === li.defaultOutfitId), 'happy')
  const all = content.loveInterests.filter((li) => happy(li))
  const find = (name: string) => all.find((li) => li.id === name.toLowerCase() || li.name.split(' ')[0].toLowerCase() === name.toLowerCase())
  const chosen = people.split(',').map((name) => name.trim()).filter(Boolean).flatMap((name) => find(name) ?? [])
  const pick = Math.floor(Math.random() * all.length)
  const shown = chosen.length > 0 ? chosen : [all[pick % all.length], all[(pick + 1) % all.length]]
  const kind = named ?? KINDS[turn % KINDS.length]
  const sample = [t('shell.preview.tripFirst'), t('shell.preview.tripSecond')]
  const title = TITLES[kind]
  return (
    <TripMoment
      key={turn}
      kind={kind}
      title={title && t(title)}
      companions={shown.flatMap((li) => {
        const image = li && happy(li)
        return image ? [{ id: li.id, image, walk: li.walkSprite, stageHeight: li.stageHeight }] : []
      })}
      lines={kind === 'drive-there' || kind === 'drive-home' ? () => Promise.resolve(shown.map((li, i) => ({ speakerId: li.id, text: sample[i % 2] }))) : undefined}
      onDone={() => setTurn((now) => now + 1)}
    />
  )
}
