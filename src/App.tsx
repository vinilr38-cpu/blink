import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { HomePage } from './pages/HomePage'
import { HostDashboard } from './pages/HostDashboard'
import { ParticipantView } from './pages/ParticipantView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host/:sessionId" element={<HostDashboard />} />
        <Route path="/join/:sessionCode" element={<ParticipantView />} />
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  )
}

export default App
