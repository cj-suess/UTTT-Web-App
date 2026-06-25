import { useEffect, useRef, useState } from 'react'
import { HINT_LIMIT } from '@uttt/shared'
import type { GameAnalysis } from '../api/client'
import styles from './HintPanel.module.css'

interface HintPanelProps {
  gameId: string
  isHumanTurn: boolean
  analysis: GameAnalysis | null
  moveCount: number
  hintsUsed: number
  /** Called immediately when GET HINT is clicked with the recommended [macro, cell]. */
  onHintStart?: (move: [number, number]) => void
  /** Called when the hint is cleared (move made or new game). */
  onHintClear?: () => void
  /** Called when a hint is successfully streamed. */
  onHintUsed?: () => void
}

export function HintPanel({
  gameId,
  isHumanTurn,
  analysis,
  moveCount,
  hintsUsed,
  onHintStart,
  onHintClear,
  onHintUsed,
}: HintPanelProps) {
  const [hint, setHint] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const hasReceivedContent = useRef(false)

  // Clear hint and board highlight whenever a move is made.
  useEffect(() => {
    setHint('')
    setError(null)
    closeStream()
    onHintClear?.()
  }, [moveCount])

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

  function getHint() {
    if (isStreaming || !analysis) return

    // Notify parent immediately so the board can start the flash animation
    // before the first token arrives.
    const pv = analysis.principalVariation
    if (pv.length >= 2) {
      onHintStart?.(pv[1] as [number, number])
    }

    setHint('')
    setError(null)
    setIsStreaming(true)
    hasReceivedContent.current = false

    const es = new EventSource(`/api/games/${gameId}/hint`)
    esRef.current = es

    es.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as { token: string }
      hasReceivedContent.current = true
      setHint(prev => prev + data.token)
    }

    es.onerror = () => {
      if (!hasReceivedContent.current) {
        setError('Could not reach the hint service.')
      } else {
        onHintUsed?.()
      }
      closeStream()
    }
  }

  const hintsRemaining = HINT_LIMIT - hintsUsed
  const canGetHint = isHumanTurn && analysis !== null && !isStreaming && hintsRemaining > 0

  const placeholderText = () => {
    if (!analysis) return 'Available after the AI makes its first move.'
    if (!isHumanTurn) return 'Available on your turn.'
    if (hintsRemaining <= 0) return 'No hints remaining for this game.'
    return 'Click GET HINT for move guidance.'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}>HINT</span>
          <span className={styles.counter}>{hintsRemaining} / {HINT_LIMIT}</span>
        </div>
        <button
          className={styles.hintBtn}
          onClick={getHint}
          disabled={!canGetHint}
        >
          {isStreaming ? 'THINKING...' : 'GET HINT'}
        </button>
      </div>

      <div className={styles.content}>
        {error && <p className={styles.error}>{error}</p>}
        {hint ? (
          <p className={styles.hintText}>{hint}</p>
        ) : (
          !error && <p className={styles.placeholder}>{placeholderText()}</p>
        )}
      </div>
    </div>
  )
}