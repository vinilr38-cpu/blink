import { useState } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { HomePage } from './pages/HomePage'
import { HostDashboard } from './pages/HostDashboard'
import { ParticipantView } from './pages/ParticipantView'
import { Participants } from './pages/Participants'
import { Settings } from './pages/Settings'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { motion, AnimatePresence } from "framer-motion"
import "./App.css"

function SidebarItem({ icon, label, to, collapsed }: { icon: string; label: string; to: string; collapsed: boolean }) {
  return (
    <Link to={to} className="sidebar-item" style={{ textDecoration: 'none' }}>
      <span className="icon">{icon}</span>
      {!collapsed && <span className="sidebar-label">{label}</span>}
    </Link>
  )
}

function AppContent() {
  const location = useLocation()
  const isParticipant = location.pathname.startsWith('/join/')
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const hideSidebar = isParticipant || isAuthPage
  const [collapsed, setCollapsed] = useState(false)

  // Auth guard — redirect to login if no token and not on public pages
  const token = localStorage.getItem("token")
  if (!token && !isParticipant && !isAuthPage) {
    return <Navigate to="/login" />
  }

  return (
    <div className="dashboard">
      {!hideSidebar && (
        <motion.aside
          animate={{ width: collapsed ? 80 : 260 }}
          transition={{ duration: 0.4, ease: "linear" }}
          className="sidebar"
        >
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            ☰
          </button>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 mb-8 px-2"
              >
                <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                  <span className="text-white font-black text-lg">B</span>
                </div>
                <h2 className="text-lg font-black text-foreground tracking-tight whitespace-nowrap">Smart Audio</h2>
              </motion.div>
            )}
          </AnimatePresence>

          <nav className="nav">
            <SidebarItem icon="🎤" label="Sessions" to="/" collapsed={collapsed} />
            <SidebarItem icon="👥" label="Participants" to="/participants" collapsed={collapsed} />
            <SidebarItem icon="⚙️" label="Settings" to="/settings" collapsed={collapsed} />
          </nav>

          <div className="mt-auto">
            <motion.button
              className="primary-btn w-full flex items-center justify-center gap-2 py-3"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/'}
            >
              <span>🎙️</span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    Create Session
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </motion.aside>
      )}

      <motion.main
        className="main-content"
        animate={{ marginLeft: hideSidebar ? 0 : collapsed ? 80 : 260 }}
        transition={{ duration: 0.4, ease: "linear" }}
      >
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/host/:sessionId" element={<HostDashboard />} />
            <Route path="/join/:sessionCode" element={<ParticipantView />} />
          </Routes>
        </AnimatePresence>
      </motion.main>
    </div>
  )
}

function App() {
  return (
    <>
      <AppContent />
      <Toaster position="top-center" />
    </>
  )
}

export default App

