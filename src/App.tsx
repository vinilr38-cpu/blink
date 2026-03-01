import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { HomePage } from './pages/HomePage'
import { HostDashboard } from './pages/HostDashboard'
import { ParticipantView } from './pages/ParticipantView'
import { motion, AnimatePresence } from "framer-motion"
import "./App.css"

function AppContent() {
  const location = useLocation()
  const isParticipant = location.pathname.startsWith('/join/')

  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {!isParticipant && (
        <aside className="sidebar">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white font-black text-xl">B</span>
            </div>
            <h2 className="text-xl font-black text-foreground tracking-tight">Smart Audio</h2>
          </div>

          <nav className="space-y-2 mb-8">
            <a
              href="/"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${location.pathname === '/' ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              Dashboard
            </a>
          </nav>

          <button
            className="primary-btn w-full flex items-center justify-center gap-2 py-4 mt-auto"
            onClick={() => window.location.href = '/'}
          >
            Create Session
          </button>
        </aside>
      )}

      <main className={`main-content ${isParticipant ? 'w-full' : ''}`}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/host/:sessionId" element={<HostDashboard />} />
            <Route path="/join/:sessionCode" element={<ParticipantView />} />
          </Routes>
        </AnimatePresence>
      </main>
    </motion.div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <Toaster position="top-center" />
    </BrowserRouter>
  )
}

export default App
