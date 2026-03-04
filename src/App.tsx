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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Auth guard — redirect to login if no token and not on public pages
  const token = localStorage.getItem("token")
  const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "null") } catch { return null } })()

  if (!token && !isParticipant && !isAuthPage) {
    return <Navigate to="/login" />
  }

  // Redirect host to active session if they try to go home
  const activeSessionId = localStorage.getItem("activeSessionId")
  if (token && user?.role === 'host' && activeSessionId && location.pathname === '/') {
    return <Navigate to={`/host/${activeSessionId}`} replace />
  }

  return (
    <div className="dashboard transition-theme">
      {/* Desktop Sidebar */}
      {!hideSidebar && (
        <motion.aside
          initial={false}
          animate={{
            width: collapsed ? 80 : 280,
            x: 0
          }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="sidebar bg-card border-r border-border hidden lg:flex"
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

      {/* Mobile Menu Button */}
      {!hideSidebar && (
        <div className="lg:hidden fixed top-4 left-4 z-[100]">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="h-12 w-12 rounded-2xl bg-primary text-white shadow-xl flex items-center justify-center text-xl"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      )}

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && !hideSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-card border-r border-border z-[90] lg:hidden"
            >
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-10">
                  <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center">
                    <span className="text-white font-black text-xl">B</span>
                  </div>
                  <h2 className="text-xl font-black text-foreground tracking-tight">Smart Audio</h2>
                </div>
                <nav className="nav space-y-3" onClick={() => setIsMobileMenuOpen(false)}>
                  <SidebarItem icon="🎤" label="Sessions" to="/" collapsed={false} />
                  <SidebarItem icon="👥" label="Participants" to="/participants" collapsed={false} />
                  <SidebarItem icon="⚙️" label="Settings" to="/settings" collapsed={false} />
                </nav>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main
        className="main-content relative flex-1 min-w-0 overflow-y-auto"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="min-h-full w-full max-w-full overflow-x-hidden break-words"
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
      </main>
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

