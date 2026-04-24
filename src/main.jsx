import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ConfiguratorProvider } from './context/ConfiguratorContext'
import { ErrorBoundary } from './utils/ErrorBoundary'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={<div className="w-screen h-screen bg-[#0d0f12] flex items-center justify-center text-white font-black uppercase tracking-widest text-center px-10">Application Crashed.<br/>Please Refresh the Browser.</div>}>
      <ConfiguratorProvider>
        <App />
      </ConfiguratorProvider>
    </ErrorBoundary>
  </StrictMode>,
)
