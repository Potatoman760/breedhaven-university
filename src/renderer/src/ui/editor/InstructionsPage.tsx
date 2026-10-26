import type { ReactNode } from 'react'
import { Button } from '../Button'
import { t } from '../../../../shared/i18n'

interface Props {
  switcher: (mayLeave: () => boolean) => ReactNode
  /** Opens another side of the editor. */
  onGo: (side: 'Characters' | 'Majors' | 'Courses' | 'ComfyUI') => void
}

/**
 * Where a player's editor opens: what to set up, and in what order, to add a character of their own and play her.
 * The one page of the editor that is all words, since it is read once and then left.
 */
export function InstructionsPage({ switcher, onGo }: Props) {
  return (
    <main className="editor player-editor">
      {switcher(() => true)}
      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{t('editor.instructions.title')}</h1>
          </div>
        </div>
        <div className="editor-body instructions">
          <ol>
            <li>
              <h2>{t('editor.instructions.llmTitle')}</h2>
              <p>
                {t('editor.instructions.llm')}
              </p>
            </li>
            <li>
              <h2>{t('editor.instructions.comfyTitle')}</h2>
              <p>
                {t('editor.instructions.comfy')}
              </p>
              <Button onClick={() => onGo('ComfyUI')}>{t('editor.sides.comfy')}</Button>
            </li>
            <li>
              <h2>{t('editor.instructions.majorTitle')}</h2>
              <p>
                {t('editor.instructions.major')}
              </p>
              <Button onClick={() => onGo('Majors')}>{t('editor.sides.majors')}</Button>
            </li>
            <li>
              <h2>{t('editor.instructions.characterTitle')}</h2>
              <p>{t('editor.instructions.character')}</p>
              <ul>
                <li>{t('editor.instructions.profile')}</li>
                <li>{t('editor.instructions.academics')}</li>
                <li>
                  {t('editor.instructions.media')}
                </li>
                <li>{t('editor.instructions.save')}</li>
              </ul>
              <Button onClick={() => onGo('Characters')}>{t('editor.sides.characters')}</Button>
            </li>
            <li>
              <h2>{t('editor.instructions.coursesTitle')}</h2>
              <p>
                {t('editor.instructions.courses')}
              </p>
              <Button onClick={() => onGo('Courses')}>{t('editor.sides.courses')}</Button>
            </li>
            <li>
              <h2>{t('editor.instructions.newGameTitle')}</h2>
              <p>
                {t('editor.instructions.newGame')}
              </p>
            </li>
          </ol>
        </div>
      </section>
    </main>
  )
}
