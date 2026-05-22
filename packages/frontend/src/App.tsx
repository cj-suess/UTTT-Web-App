import { evaluate, isTerminal } from '@uttt/shared'
import { Board } from './components/Board'
import { useGame } from './hooks/useGame'
import styles from './App.module.css'
import { useState } from 'react'

export default function App() {
  const { game, loading, error, createGame, playMove } = useGame()
  const [playerName, setPlayerName] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [showConfirm, setConfirm] = useState(false)

  function statusText(): string {
    if (error) return error
    if (!game) return 'Press NEW GAME to begin.'
    if (isTerminal(game.state)) {
      const result = evaluate(game.state)
      if (result === 1)  return game.playerName + ' wins!'
      if (result === -1) return 'O wins!'
      return "It's a draw."
    }
    if (loading) return 'AI thinking...'
    return game.state.player === 1 ? 'It is your move ' + game.playerName : 'O to move'
  }

  function renderBoardArea() {
    if(game) {
      return(
        <Board state={game.state} onMove={playMove} disabled={loading}/>
      )
    }
    if(showPrompt) {
      return (
        <form className={styles.namePrompt} onSubmit={e => {
            e.preventDefault()
            createGame(playerName.trim())
            setShowPrompt(false)
            setPlayerName('')
          }}>
          <span style={{ color: 'var(--text-bright)', fontSize: '11px', letterSpacing: '0.15em' }}>
            ENTER YOUR NAME
          </span>
          <div style={{display: 'flex', gap: '8px'}}>
            <input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            autoFocus
            />
            <button className={styles.btn} type='submit' disabled={playerName.trim() === ''}>
              START GAME
            </button>
          </div>
        </form>
      )
    }
    return null
  }

  function renderFooter() {
    if(showConfirm) {
      if (game) {
        return (
          <>
            <span className={styles.statusText}>Start over? Your game will be lost.</span>
            <div>
              <button
                className={styles.btn}
                onClick={ () => {
                    createGame(game.playerName);
                    setConfirm(false);
                  }
                }
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
      if(!game) {
        return (
          <>
            <span className={styles.statusText}>{ statusText() }</span>
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
            <span className={styles.statusText}>{ statusText() }</span>
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

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>UTTT</span>
        <span className={styles.subtitle}>ULTIMATE TIC-TAC-TOE</span>
      </header>
      <main className={styles.boardArea}> { renderBoardArea() } </main>
      <footer className={styles.statusBar}> { renderFooter() } </footer>
    </div>
  )
}