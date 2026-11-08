import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CacheProvider } from '@emotion/react'
import App from './App'
import { createAppStyleCache } from './style-cache'
import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing root element')

const cache = createAppStyleCache(
  [...document.querySelectorAll('meta[name="app-style-nonce"]')].map(meta => meta.getAttribute('content') || ''),
  import.meta.env.DEV,
)

createRoot(rootElement).render(
  <CacheProvider value={cache}>
    <StrictMode>
      <App />
    </StrictMode>
  </CacheProvider>,
)
