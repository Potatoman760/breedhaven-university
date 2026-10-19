import type { Intro, IntroScene } from '../model'
import { dialogueLines, namesHer, type DialogueLine } from './scene'

/** How someone on a cutscene's stage looks at a beat of it: the outfit and the face it has put her in, where it has. */
export interface CutsceneLook {
  outfitId?: string
  expression?: string
}

/** One line of a cutscene as it is read: the place it is in, who is on the stage, the line, and how each of them looks. */
export interface CutsceneBeat<P> {
  scene: IntroScene
  cast: P[]
  line: DialogueLine
  looks: Record<string, CutsceneLook>
}

// A line that changes how someone looks rather than being read: [OUTFIT: Tamsin=nude], [EXPRESSION: Maren=aroused], or
// without a name, the speaker's.
const LOOK = /^\s*\[(OUTFIT|EXPRESSION):\s*(?:([^=\]]+?)\s*=\s*)?([^\]]+?)\s*\]\s*$/i

/**
 * Every line of a cutscene in order, as it is read, with who is on the stage and how each of them looks at that line.
 * A line that sets an outfit or a face is not read: it changes her from the next line on, and stays changed, from one
 * place to the next, until another does.
 */
export function cutsceneBeats<P extends { id: string; name: string }>(intro: Intro, people: P[]): CutsceneBeat<P>[] {
  const looks: Record<string, CutsceneLook> = intro.outfitId ? { [intro.speakerId]: { outfitId: intro.outfitId } } : {}
  return intro.scenes.flatMap((scene) => {
    const cast = (scene.castIds ?? [intro.speakerId]).flatMap((id) => people.find((one) => one.id === id) ?? [])
    // The speaker's name is known in every place, whether or not she is on the stage there: over a picture with her in it, say.
    const named = [...cast, ...people.filter((one) => one.id === intro.speakerId && !cast.includes(one))]
    return scene.lines.flatMap((written) => {
      const tag = written.match(LOOK)
      if (tag) {
        const who = tag[2] ? named.find((one) => namesHer(tag[2], one))?.id : intro.speakerId
        if (who) looks[who] = { ...looks[who], [tag[1].toUpperCase() === 'OUTFIT' ? 'outfitId' : 'expression']: tag[3].toLowerCase() }
        return []
      }
      return dialogueLines(written, named).map((line) => ({ scene, cast, line, looks: { ...looks } }))
    })
  })
}
