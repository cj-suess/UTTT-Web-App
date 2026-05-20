import { evaluate, isTerminal } from '@uttt/shared'
import { Board } from './components/Board'
import { useGame } from './hooks/useGame'
import styles from './App.module.css'

export default function App() {
  const { game, loading, error, createGame, playMove } = useGame()

  function statusText(): string {
    if (error) return error
    if (!game) return 'Press NEW GAME to begin.'
    if (isTerminal(game.state)) {
      const result = evaluate(game.state)
      if (result === 1)  return 'X wins!'
      if (result === -1) return 'O wins!'
      return "It's a draw."
    }
    if (loading) return 'AI thinking...'
    return game.state.player === 1 ? 'X to move' : 'O to move'
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>UTTT</span>
        <span className={styles.subtitle}>ULTIMATE TIC-TAC-TOE</span>
      </header>

      <main className={styles.boardArea}>
        {game ? (
          <Board
            state={game.state}
            onMove={playMove}
            disabled={loading}
          />
        ) : (
          <span className={styles.placeholder}>BOARD</span>
        )}
      </main>

      <footer className={styles.statusBar}>
        <span className={styles.statusText}>{statusText()}</span>
        <button
          className={styles.btn}
          onClick={createGame}
          disabled={loading}
        >
          NEW GAME
        </button>
      </footer>
    </div>
  )
}