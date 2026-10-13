import { useState } from 'react'
import { isCodexUnlocked } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'

interface Props {
  content: ContentPack
  state: GameState
}

/**
 * The codex as a book lying open: its contents down the left page, by chapter, and the entry being read on the right.
 * Only what he has come to know is in it; the pages turn with the buttons at their feet.
 */
export function CodexBook({ content, state }: Props) {
  // In the order they are written, kept together by category: a chapter each.
  const known = content.codex.filter((entry) => isCodexUnlocked(entry, state, content))
  const chapters = [...new Set(known.map((entry) => entry.category))]
  const pages = chapters.flatMap((chapter) => known.filter((entry) => entry.category === chapter))
  const [at, setAt] = useState(0)
  const page = pages[Math.min(at, pages.length - 1)]
  if (!page) return <p className="hint">Nothing is written here yet.</p>
  const number = pages.indexOf(page)

  return (
    <div className="book">
      <nav className="book-page book-contents" aria-label="Contents">
        <h2>Contents</h2>
        {chapters.map((chapter) => (
          <section key={chapter}>
            <h3>{chapter}</h3>
            <ul>
              {pages
                .filter((entry) => entry.category === chapter)
                .map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className={entry === page ? 'book-link reading' : 'book-link'} aria-current={entry === page ? 'page' : undefined} onClick={() => setAt(pages.indexOf(entry))}>
                      <span>{entry.title}</span>
                      <i aria-hidden />
                      <span>{pages.indexOf(entry) + 1}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </nav>
      <article className="book-page book-entry" key={page.id}>
        <span className="caps">{page.category}</span>
        <h2>{page.title}</h2>
        <div className="book-text">
          {page.content
            .split(/\n\s*\n/)
            .filter((paragraph) => paragraph.trim() !== '')
            .map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
        </div>
        <footer>
          <button type="button" className="book-turn" disabled={number === 0} onClick={() => setAt(number - 1)}>
            ‹ Previous
          </button>
          <span>
            {number + 1} of {pages.length}
          </span>
          <button type="button" className="book-turn" disabled={number === pages.length - 1} onClick={() => setAt(number + 1)}>
            Next ›
          </button>
        </footer>
      </article>
    </div>
  )
}
