import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

function App() {
  const [greeting, setGreeting] = useState('')
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()

    async function loadGreeting() {
      try {
        const response = await fetch(`${API_BASE_URL}/app-test`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        setGreeting(await response.text())
        setStatus('success')
      } catch (error) {
        if (error.name !== 'AbortError') {
          setStatus('error')
        }
      }
    }

    loadGreeting()

    return () => controller.abort()
  }, [])

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Vaibhav home">
          <span className="brand-mark">V</span>
          <span>Vaibhav</span>
        </a>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          Spring + React
        </span>
      </nav>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">A small hello from the backend</p>
          <h1 id="hero-title">
            Building something
            <span> thoughtful.</span>
          </h1>
          <p className="hero-description">
            Your React interface is now connected to a Spring Boot API. A live
            greeting is waiting for you below.
          </p>

          <div className={`api-card ${status}`} aria-live="polite">
            <div className="api-card-header">
              <span className="api-label">LIVE API RESPONSE</span>
              <span className="api-route">GET /app-test</span>
            </div>
            <div className="api-response">
              {status === 'loading' && <span className="loading-text">Reaching the backend...</span>}
              {status === 'success' && <span>{greeting}</span>}
              {status === 'error' && (
                <span className="error-text">
                  Could not reach the backend. Start Spring Boot and refresh this page.
                </span>
              )}
            </div>
            <div className="api-card-footer">
              <span className="response-indicator" aria-hidden="true" />
              {status === 'success' ? 'Connected successfully' : status === 'error' ? 'Connection unavailable' : 'Connecting'}
            </div>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="orb orb-large" />
          <div className="orb orb-small" />
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-card">
            <span className="art-card-dot" />
            <span className="art-card-line short" />
            <span className="art-card-line" />
            <span className="art-card-line medium" />
          </div>
          <div className="floating-tag">hello, world ✦</div>
        </div>
      </section>

      <footer className="footer">
        <span>Frontend interface</span>
        <span className="footer-divider" />
        <span>Backend connected</span>
      </footer>
    </main>
  )
}

export default App
