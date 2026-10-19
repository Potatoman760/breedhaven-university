import { useEffect, useRef, useState } from 'react'
import { cutsceneBeats, spriteFor, toDate, wornOutfit } from '../../../shared/game'
import { Portrait } from './Portrait'
import type { ContentPack, GameState, Intro } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { ChevronIcon } from './icons'
import { emphasise } from './SceneView'

interface Props {
  content: ContentPack
  state: GameState
  intro: Intro
  onDone: () => void
}

/**
 * A cutscene, as the welcome before orientation and the opening of a story beat are: scenes written out in full, read a
 * line at a time, with nothing to answer and nothing else on the screen. Whoever a place names stands on the stage, and a
 * line that starts with a name is hers. A line such as [OUTFIT: Tamsin=nude] or [EXPRESSION: Maren=aroused] is not read:
 * it changes how she looks from the next line on. A click, Space, Enter, the right arrow or the wheel goes on; the left arrow or the
 * wheel back goes back. The last line read, it is over.
 */
export function IntroView({ content, state, intro, onDone }: Props) {
  const people = [...content.npcs, ...content.loveInterests]
  // Every line of every scene in order, each with the scene it is in, who is on the stage, and how each of them looks. A
  // line in asterisks is narration.
  const beats = cutsceneBeats(intro, people)
  const [index, setIndex] = useState(0)
  const { scene, cast, line, looks } = beats[Math.min(index, beats.length - 1)]
  const location = content.locations.find((l) => l.id === scene.locationId)
  const date = toDate(content.calendar, state.time)
  // Each in the outfit and with the face the script has put her in by now, or failing that as the day has her. An outfit
  // asked for is worn as she wears it now: her pregnant form of it, once she shows.
  const spriteOf = (who: (typeof people)[number]) => spriteFor(who, wornOutfit(content, state, who, looks[who.id]?.outfitId), looks[who.id]?.expression)
  // Whose line it is: the one it names, else the speaker's. Narration is nobody's.
  const speaker = line.action ? undefined : people.find((one) => one.id === (line.speakerId ?? intro.speakerId))
  const sprite = speaker && spriteOf(speaker)

  const next = () => (index < beats.length - 1 ? setIndex(index + 1) : onDone())
  const back = () => setIndex(Math.max(0, index - 1))
  const turned = useRef(0)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowRight'].includes(event.key)) next()
      else if (event.key === 'ArrowLeft') back()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main
      className="stage intro"
      onClick={next}
      onWheel={(event) => {
        // One line for each turn of the wheel, however many events a turn sends.
        if (event.deltaY === 0 || event.timeStamp - turned.current < 180) return
        turned.current = event.timeStamp
        if (event.deltaY < 0) back()
        else next()
      }}
    >
      <Backdrop screen="intro" location={location} periodId={date.period.id} light={date.period.light} backgroundId={scene.backgroundId} />
      {cast.length > 1 ? (
        <div className="cast">
          {cast.map((who) => {
            const image = spriteOf(who)
            return image && <img key={who.id} className={speaker && speaker.id !== who.id ? 'listening' : undefined} src={`content://pack/${image}`} alt={who.name} />
          })}
        </div>
      ) : (
        cast[0] && spriteOf(cast[0]) && <img className="sprite-art" src={`content://pack/${spriteOf(cast[0])}`} alt={cast[0].name} />
      )}
      <div className="textbox-wrap">
        {speaker && (
          <div className="speaker-tab">
            <Portrait who={speaker} image={sprite} size={88} className="speaker-face" />
            <span className="speaker-name">{speaker.name.split(' ')[0]}</span>
          </div>
        )}
        <div className="textbox glass framed turning">
          {line.action ? (
            <p className="narration action">{line.text}</p>
          ) : (
            <div className="speech">
              <p>{emphasise(line.text)}</p>
            </div>
          )}
          <span className="turn-mark" aria-hidden="true">
            {index + 1} / {beats.length}
            <ChevronIcon size={14} />
          </span>
        </div>
      </div>
    </main>
  )
}
