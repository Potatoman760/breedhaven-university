import { useState } from 'react'
import { coursePoints, examPaper } from '../../../shared/game'
import type { ContentPack, Course, ExamKind, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Facts } from './Facts'
import { useCueAt } from '../sound'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  course: Course
  kind: ExamKind
  /** Hands the paper in, with the answer chosen to each question in order. */
  onHandIn: (answers: number[]) => void
  onClose: () => void
}

/**
 * The paper of an examination he has turned up for: the questions to answer, and once it is handed in, the same
 * paper marked, his marks against what the course asks for, and the grade stamped on it.
 */
export function ExamDialog({ content, state, course, kind, onHandIn, onClose }: Props) {
  const grading = content.coursework!.grading
  // The paper as it was set when he sat down: what he is shown marked is what he answered.
  const [paper] = useState(() => examPaper(content, state, course, kind))
  const [answers, setAnswers] = useState<number[]>(() => paper.map(() => -1))
  const grade = state.grades[course.id]?.[kind]
  const outOf = kind === 'midterm' ? Math.round((grading.points * grading.midtermWeek) / grading.finalWeek) : grading.points
  const points = grade?.points ?? Math.round(coursePoints(state, course.id))
  const lines = [
    { letter: 'C', at: grading.passAt },
    { letter: 'B', at: grading.markAt }
  ]

  return (
    <Dialog title={t('screens.exam.title', { kind, number: course.number })} note={course.title} onClose={onClose} noClose>
      {paper.map((question, index) => (
        <fieldset key={question.topic} className="exam-question" disabled={grade !== undefined}>
          <legend>
            <span className="caps">{question.title}</span>
            {question.ask}
          </legend>
          {question.choices.map((choice, pick) => {
            const chosen = answers[index] === pick
            const mark = grade === undefined ? '' : pick === question.right ? ' right' : chosen ? ' wrong' : ''
            return (
              <label key={choice} className={`inline${mark}`}>
                <input type="radio" name={`question-${question.topic}`} checked={chosen} onChange={() => setAnswers(answers.map((was, at) => (at === index ? pick : was)))} />
                {choice}
                {mark && <span className="exam-tick">{mark === ' right' ? '✓' : '✗'}</span>}
              </label>
            )
          })}
        </fieldset>
      ))}

      {grade ? (
        <div className="exam-result">
          <div className="exam-marks">
            <Facts
              facts={[
                { label: t('screens.exam.marks'), value: t('screens.exam.outOf', { n: points, total: outOf }) },
                { label: t('screens.exam.answers'), value: t('screens.exam.outOf', { n: grade.correct, total: grade.topics.length }), title: t('screens.exam.answersTitle') }
              ]}
            />
            <div className="exam-measure">
              <div className="meter">
                <div style={{ width: `${Math.min(100, outOf > 0 ? (points / outOf) * 100 : 0)}%` }} />
              </div>
              {lines.map((line) => (
                <span key={line.letter} className="exam-line" style={{ left: `${line.at * 100}%` }}>
                  {line.letter}
                </span>
              ))}
            </div>
          </div>
          <GradeStamp letter={grade.letter} />
        </div>
      ) : (
        <Facts facts={[{ label: t('screens.exam.marks'), value: t('screens.exam.outOf', { n: points, total: outOf }), note: lines.map((line) => t('screens.exam.forA', { n: Math.ceil(outOf * line.at), letter: line.letter })).join(', '), warn: points < outOf * grading.passAt }]} />
      )}

      <div className="actions end">
        {grade ? (
          <Button variant="primary" onClick={onClose}>
            {t('screens.courses.done')}
          </Button>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose}>
              {t('screens.exam.notYet')}
            </Button>
            <Button variant="primary" disabled={answers.includes(-1)} onClick={() => onHandIn(answers)}>
              {t('screens.exam.handIn')}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}

/** The grade, stamped on the paper with a thump as it lands: 0.6s in, and most of the way through its 0.45s (`exam-stamp` in styles.css). */
function GradeStamp({ letter }: { letter: string }) {
  useCueAt('stamp', 850)
  return (
    <div className="exam-stamp" role="img" aria-label={t('screens.exam.grade', { letter })}>
      {letter}
    </div>
  )
}
