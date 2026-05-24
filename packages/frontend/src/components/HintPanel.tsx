/**
 * HintPanel — the learning feature panel rendered on the right side.
 *
 * Uses the browser's native EventSource API to consume the SSE stream from
 * GET /api/games/:id/hint. Tokens arrive and are appended to the hint text
 * as they stream in, giving a typewriter effect.
 *
 * The hint is cleared whenever moveCount changes (i.e. a move was made)
 * because the previous hint is now stale.
 */

import { useEffect, useRef, useState } from 'react'
import type { GameAnalysis } from '../api/client'
import styles from './HintPanel.module.css'

interface HintPanelProps {
  gameId: string
  /** True only when it's the human's turn, game isn't over, and AI isn't thinking. */
  isHumanTurn: boolean
  /** Null until the AI has made at least one move. */
  analysis: GameAnalysis | null
  /** Derived from the number of pieces on the board. Changes on every move
   *  and is used to clear the stale hint. */
  moveCount: number
}

export function HintPanel({
  gameId,
  isHumanTurn,
  analysis,
  moveCount,
}: HintPanelProps) {
  const [hint, setHint] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep a ref to the active EventSource so we can close it on cleanup.
  const esRef = useRef<EventSource | null>(null)

  // Clear the hint whenever the board changes — the position has moved on.
  useEffect(() => {
    setHint('')
    setError(null)
    closeStream()
  }, [moveCount])

  // Cleanup on unmount.
  useEffect(() => {
    return () => closeStream()
  }, [])

  function closeStream() {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setIsStreaming(false)
  }

  const hasReceivedContent = useRef(false)

  function getHint() {
    if (isStreaming) return
    setHint('')
    setError(null)
    setIsStreaming(true)

    hasReceivedContent.current = false

    // EventSource automatically sends a GET request and keeps the connection
    // open. The Vite proxy forwards /api/* to NestJS on port 3000.
    const es = new EventSource(`/api/games/${gameId}/hint`)
    esRef.current = es

    es.onmessage = (event: MessageEvent) => {
      hasReceivedContent.current = true
      const data = JSON.parse(event.data as string) as { token: string }
      setHint(prev => prev + data.token)
    }

    // onerror fires both when the stream ends normally (server closes) and
    // on a real network error. In both cases we stop streaming — if there's
    // real content in `hint` the user can read it; if not, show an error.
    es.onerror = () => {
      if (!hasReceivedContent.current) {
        setError('Could not reach the hint service.')
      }
      closeStream()
    }
  }

  const canGetHint = isHumanTurn && analysis !== null && !isStreaming

  const placeholderText = () => {
    if (!analysis) return 'Available after the AI makes its first move.'
    if (!isHumanTurn) return 'Available on your turn.'
    return 'Click GET HINT for move guidance.'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>HINT</span>
        <button
          className={styles.hintBtn}
          onClick={getHint}
          disabled={!canGetHint}
        >
          {isStreaming ? 'THINKING...' : 'GET HINT'}
        </button>
      </div>

      <div className={styles.content}>
        {error && (
          <p className={styles.error}>{error}</p>
        )}
        {hint ? (
          <p className={styles.hintText}>{hint}</p>
        ) : (
          !error && <p className={styles.placeholder}>{placeholderText()}</p>
        )}
      </div>
    </div>
  )
}