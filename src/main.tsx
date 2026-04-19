import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/theme/index.css'
// AR 진단 플래그(`?debug=1` → localStorage)를 앱 부트 시 1회 sync.
// IntroPage(`/ar`) → PlayPage(`/ar/play`) 이동 시 쿼리 drop 돼도 localStorage 로 유지됨.
import '@/features/ar/lib/debugFlag'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA install eligibility.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* swallow — install prompt simply won't appear if SW fails */
    })
  })
}
