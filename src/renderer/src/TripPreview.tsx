import { useEffect, useState } from 'react'
import { spriteFor } from '../../shared/game'
import type { ContentPack } from '../../shared/model'
import { TripMoment, type TripMomentKind } from './ui/TripMoment'
import { t, type MessageKey } from '../../shared/i18n'

// The flights there and home: the drives, aboard the airship.
const FLIGHTS: Record<string, TripMomentKind> = { 'fly-there': 'drive-there', 'fly-home': 'drive-home' }
const KINDS: (TripMomentKind | keyof typeof FLIGHTS)[] = ['drive-there', 'soak', 'cascade', 'market', 'private-bath', 'fireworks', 'last-morning', 'drive-home', 'beach', 'boardwalk', 'sunrise-swim', 'trail', 'campfire', 'dawn-lake', 'fly-there', 'bay', 'cabin', 'sea-cave', 'reef', 'bungalow', 'sandbar', 'lake-boat', 'rooftop', 'colors', 'fly-home']
const TITLES: Partial<Record<TripMomentKind, MessageKey>> = {
  soak: 'shell.preview.soak',
  cascade: 'shell.preview.cascade',
  market: 'shell.preview.market',
  'private-bath': 'shell.preview.privateBath',
  fireworks: 'shell.preview.fireworks',
  'last-morning': 'shell.preview.lastMorning'
}

/**
 * The moments of the trips on their own, for looking at without playing to them: opened by `npm run preview:trip`,
 * all of them in turn, Saltmere's from the drive there to the drive home and then the weekend getaways' openings, or
 * only the one named, with the one or two love interests named or two picked at random. A click goes on to the next.
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
  const chosenKind = named ?? KINDS[turn % KINDS.length]
  const flight = FLIGHTS[chosenKind]
  const kind = flight ?? (chosenKind as TripMomentKind)
  // A flight goes through the sky of the trip that flies.
  const flown = content.getaways.trips.find((one) => one.travel === 'airship')
  const sample = [t('shell.preview.tripFirst'), t('shell.preview.tripSecond')]
  // A getaway's opening is titled as the part it opens.
  const part = content.getaways.trips.flatMap((one) => one.program).find((one) => (one.animations as string[]).includes(kind))
  const known = TITLES[kind]
  const title = flight ? undefined : known ? t(known) : part?.name
  return (
    <TripMoment
      key={turn}
      kind={kind}
      title={title}
      companions={shown.flatMap((li) => {
        const image = li && happy(li)
        return image ? [{ id: li.id, image, walk: li.walkSprite, head: li.walkHead, stageHeight: li.stageHeight }] : []
      })}
      lines={kind === 'drive-there' || kind === 'drive-home' ? () => Promise.resolve(shown.map((li, i) => ({ speakerId: li.id, text: sample[i % 2] }))) : undefined}
      travel={flight ? 'airship' : undefined}
      road={flight ? flown?.road : undefined}
      onDone={() => setTurn((now) => now + 1)}
    />
  )
}
