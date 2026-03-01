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

import { ThemeProvider } from "./components/theme-provider"

function AppContent() {
  const location = useLocation()
  const isParticipant = location.pathname.startsWith('/join/')
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const hideSidebar = isParticipant || isAuthPage
  const [collapsed, setCollapsed] = useState(false)

  // Auth guard — redirect to login if no token and not on public pages
  const token = localStorage.getItem("token")
  const user = JSON.parse(localStorage.getItem("user") || "null")

  if (!token && !isParticipant && !isAuthPage) {
    return <Navigate to="/login" />
  }

  return (
    <div className="dashboard transition-theme">
      {!hideSidebar && (
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 80 : 280 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="sidebar bg-card border-r border-border"
        >
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-10">
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                      <span className="text-white font-black text-xl">B</span>
                    </div>
                    <h2 className="text-xl font-black text-foreground tracking-tight">Smart Audio</h2>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                className="h-10 w-10 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-primary"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? '→' : '←'}
              </button>
            </div>

            <nav className="nav space-y-2">
              <SidebarItem icon="🎤" label="Sessions" to="/" collapsed={collapsed} />
              <SidebarItem icon="👥" label="Participants" to="/participants" collapsed={collapsed} />
              <SidebarItem icon="⚙️" label="Settings" to="/settings" collapsed={collapsed} />
            </nav>

            {user?.role === 'host' && (
              <div className="mt-auto">
                <motion.button
                  className="primary-btn w-full flex items-center justify-center gap-3 py-4 text-sm font-bold shadow-2xl shadow-primary/30"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => window.location.href = '/'}
                >
                  <span className="text-lg">🎙️</span>
                  {!collapsed && <span>Create Session</span>}
                </motion.button>
              </div>
            )}
          </div>
        </motion.aside>
      )}

      <motion.main
        className="main-content relative"
        animate={{ marginLeft: hideSidebar ? 0 : collapsed ? 80 : 280 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="min-h-full"
          >
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/participants" element={<Participants />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/host/:sessionId" element={<HostDashboard />} />
              <Route
                path="/join/:sessionCode"
                element={
                  token
                    ? <ParticipantView />
                    : <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
                }
              />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="blink-theme">
      <AppContent />
      <Toaster position="top-right" closeButton richColors />
    </ThemeProvider>
  )
}

export default App

