import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedStandings } from './seedData'

// Expose seedStandings to window for console access
(window as unknown as { seedStandings: typeof seedStandings }).seedStandings = seedStandings;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
