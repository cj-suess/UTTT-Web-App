import { evaluate, isTerminal } from '@uttt/shared'
import { Board } from './components/Board'
import { useGame } from './hooks/useGame'
import styles from './App.module.css'
import { useState } from 'react'
import { HintPanel } from './components/HintPanel'
import type { Difficulty } from './api/client'

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy:   'EASY',
  medium: 'MEDIUM',
  hard:   'HARD',
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy:   '#39ff14',
  medium: '#e8c547',
  hard:   '#e60e0e',
}

export default function App() {
  const { game, analysis, loading, error, hintsUsed, createGame, playMove, recordHintUsed } = useGame()
  const [playerName, setPlayerName] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('hard')
  const [showPrompt, setShowPrompt] = useState(false)
  const [showConfirm, setConfirm] = useState(false)
  const [hintedMove, setHintedMove] = useState<[number, number] | null>(null)
  const [hintKey, setHintKey] = useState(0)

  function statusText(): string {
    if (error) return error
    if (!game) return 'Press NEW GAME to begin.'
    if (isTerminal(game.state)) {
      const result = evaluate(game.state)
      if (result === 1)  return game.playerName + ' wins!'
      if (result === -1) return 'AI wins!'
      return "It's a draw."
    }
    if (loading) return 'AI thinking...'
    const turnText = game.state.player === 1
      ? `Your turn, ${game.playerName}`
      : 'AI to move'

    if (analysis && !isTerminal(game.state)) {
      const prob = Math.round((1 - analysis.winProbability) * 100)
      return `${turnText} | Win probability: ${prob}%`
    }

    return turnText
  }

  function renderBoardArea() {
    if (game) {
      return (
        <Board state={game.state} onMove={playMove} disabled={loading} hintMove={hintedMove} hintKey={hintKey} />
      )
    }
    if (showPrompt) {
      return (
        <form className={styles.setupForm} onSubmit={e => {
          e.preventDefault()
          createGame(playerName.trim(), difficulty)
          setShowPrompt(false)
          setPlayerName('')
        }}>
          <span className={styles.setupLabel}>ENTER YOUR NAME</span>
          <input
            className={styles.nameInput}
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            autoFocus
          />

          <span className={styles.setupLabel}>DIFFICULTY</span>
          <div className={styles.difficultyPicker}>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map(d => (
              <button
                key={d}
                type="button"
                className={styles.difficultyBtn}
                style={difficulty === d ? {
                  borderColor: DIFFICULTY_COLORS[d],
                  color:       DIFFICULTY_COLORS[d],
                  background:  `${DIFFICULTY_COLORS[d]}18`,
                } : undefined}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>

          <button className={styles.btn} type="submit" disabled={playerName.trim() === ''}>
            START GAME
          </button>
        </form>
      )
    }
    return null
  }

  function renderFooter() {
    if (showConfirm) {
      if (game) {
        return (
          <>
            <span className={styles.statusText}>Start over? Your game will be lost.</span>
            <div>
              <button
                className={styles.btn}
                onClick={() => {
                  createGame(game.playerName, game.difficulty)
                  setConfirm(false)
                }}
                disabled={loading}
              >
                YES
              </button>
              <button
                className={styles.btn}
                onClick={() => setConfirm(false)}
                disabled={loading}
              >
                CANCEL
              </button>
            </div>
          </>
        )
      }
    } else {
      if (!game) {
        return (
          <>
            <span className={styles.statusText}>{statusText()}</span>
            <button
              className={styles.btn}
              onClick={() => setShowPrompt(true)}
              disabled={loading}
            >
              NEW GAME
            </button>
          </>
        )
      } else {
        return (
          <>
            <span className={styles.statusText}>{statusText()}</span>
            <button
              className={styles.btn}
              onClick={() => setConfirm(true)}
              disabled={loading}
            >
              START OVER
            </button>
          </>
        )
      }
    }
    return null
  }

  const activeDifficulty = game?.difficulty ?? difficulty

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>UTTT</span>
        <span className={styles.subtitle}>ULTIMATE TIC-TAC-TOE</span>
        {game && (
          <span
            className={styles.difficultyBadge}
            style={{ color: DIFFICULTY_COLORS[activeDifficulty] }}
          >
            {DIFFICULTY_LABELS[activeDifficulty]}
          </span>
        )}
      </header>
      <main className={styles.content}>
        <div className={styles.boardSection}>
          {renderBoardArea()}
        </div>
        <div className={styles.learningPanel}>
          {game && (
            <HintPanel
              gameId={game.id}
              isHumanTurn={game.state.player === 1 && !isTerminal(game.state) && !loading}
              analysis={analysis}
              moveCount={game.state.board.filter(c => c !== 0).length}
              hintsUsed={hintsUsed}
              onHintStart={move => {
                setHintedMove(move)
                setHintKey(k => k + 1)
              }}
              onHintClear={() => setHintedMove(null)}
              onHintUsed={recordHintUsed}
            />
          )}
        </div>
      </main>
      <footer className={styles.statusBar}>{renderFooter()}</footer>
    </div>
  )
}
