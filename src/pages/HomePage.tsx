import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { blink as blinkSDK } from '@/lib/blink'
const blink = blinkSDK as any
import { Mic, Users, Radio, Headphones, Play, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'

export function HomePage() {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const createSession = async () => {
    const storedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null } })()

    if (storedUser && storedUser.role === 'participant') {
      toast.error('Access Denied: Participants cannot host sessions. Please change your role in Settings to proceed.')
      return
    }

    setIsCreating(true)

    try {
      const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const session = await blink.db.sessions.create({
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        hostId: `host_${Date.now()}`,
        sessionCode,
        isActive: 1
      })

      // Sync with our backend
      await api.post('/sessions/create', {
        sessionId: session.id,
        hostId: storedUser ? storedUser.id : 'anonymous'
      })

      localStorage.setItem('activeSessionId', session.id)
      toast.success('Session created successfully!')
      navigate(`/host/${session.id}`, { replace: true })
    } catch (error) {
      console.error('Failed to create session:', error)
      toast.error('Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }

  const handleManualJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (joinCode.length !== 6) {
      toast.error('Session code must be 6 characters')
      return
    }

    const storedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null } })()
    if (storedUser && storedUser.role === 'host') {
      try {
        toast.info('Switching your role to participant to join the session...')
        const res = await api.put('/users/profile', {
          id: storedUser.id,
          name: storedUser.name,
          phone: storedUser.phone,
          role: 'participant'
        })
        localStorage.setItem('user', JSON.stringify(res.data.user))
        // Small delay to ensure storage is updated before navigation
        await new Promise(r => setTimeout(r, 800))
      } catch (err) {
        console.error('Failed to auto-switch role:', err)
      }
    }

    navigate(`/join/${joinCode.toUpperCase()}`)
  }

  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  }

  const itemVariants: any = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "linear" } }
  }

  return (
    <div className="flex-1 bg-background text-foreground bg-dot-pattern relative overflow-hidden transition-theme">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px] animate-pulse" />

      {/* Hero Section */}
      <div className="relative pt-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />

        <div className="relative max-w-7xl mx-auto px-4 py-16 lg:py-24">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="text-center space-y-10 max-w-4xl mx-auto"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-3 px-5 py-2.5 bg-primary/10 border border-primary/20 rounded-full text-sm font-bold text-primary shadow-lg shadow-primary/5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Live Audio Management System
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-5xl lg:text-7xl font-extrabold tracking-tight">
              Interactive Audio
              <span className="block text-primary drop-shadow-sm">Session Manager</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Host live audio Q&A sessions with real-time participant management and
              WebRTC streaming. The professional choice for interactive events.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center pt-8">
              <AnimatePresence mode="wait">
                {!isJoining ? (
                  <motion.div
                    key="main-btns"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col sm:flex-row gap-6 justify-center w-full"
                  >
                    <button
                      className="primary-btn text-lg py-4 px-10 flex items-center justify-center min-w-[200px]"
                      onClick={createSession}
                      disabled={isCreating}
                    >
                      <Mic className="h-6 w-6 mr-3" />
                      {isCreating ? 'Creating...' : 'Start Session'}
                    </button>
                    <button
                      className="bg-white text-foreground border-2 border-primary/10 hover:border-primary/30 py-4 px-10 rounded-2xl font-bold flex items-center justify-center text-lg transition-all min-w-[200px]"
                      onClick={() => setIsJoining(true)}
                    >
                      <Users className="h-6 w-6 mr-3 text-primary" />
                      Join Now
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="join-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onSubmit={handleManualJoin}
                    className="w-full max-w-sm space-y-6"
                  >
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-400 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
                      <input
                        autoFocus
                        type="text"
                        placeholder="ENTER 6-DIGIT CODE"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="relative w-full px-6 py-6 text-center text-3xl font-black tracking-widest bg-white border-2 border-primary/20 rounded-2xl focus:border-primary focus:outline-none transition-all shadow-xl"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button type="submit" className="primary-btn flex-1 py-4 text-lg">
                        Go Live <ArrowRight className="h-5 w-5 ml-2 inline" />
                      </button>
                      <button
                        type="button"
                        className="px-6 py-4 rounded-2xl font-semibold hover:bg-muted transition-colors"
                        onClick={() => setIsJoining(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 py-32 relative z-10">
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-32 opacity-50" />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10"
        >
          {[
            { icon: Mic, title: "Real-Time Audio", desc: "Ultra-low latency WebRTC streaming from any device with professional gain control." },
            { icon: Users, title: "Professional Scaling", desc: "Scale your sessions to hundreds of participants with built-in moderation tools." },
            { icon: Radio, title: "Instant Access", desc: "No app installation required. Join instantly via secure QR code or unique session link." },
            { icon: Headphones, title: "Smart Interaction", desc: "Structured Q&A with real-time hand raising and speaker request management." }
          ].map((f, i) => (
            <motion.div key={i} variants={itemVariants}>
              <div className="glass-morphism h-full p-10 rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all hover:-translate-y-2 group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <f.icon size={80} />
                </div>
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-8 group-hover:bg-primary group-hover:text-white transition-all duration-500">
                  <f.icon className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-black mb-4 tracking-tight">{f.icon === Mic && <span className="text-primary mr-2">●</span>}{f.title}</h3>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* How It Works */}
      <div className="bg-muted/10 py-32 border-y border-primary/5 transition-theme">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4 italic">Simplicity by Design</h2>
            <p className="text-muted-foreground font-medium max-w-xl mx-auto">Three steps to launch your interactive broadcast.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            {[
              { step: "01", title: "Create Session", desc: "Instantly launch your dashboard and generate a unique join link." },
              { step: "02", title: "Invite Audience", desc: "Participants scan your QR code to join from their browser." },
              { step: "03", title: "Go Live", desc: "Manage permissions and stream high-quality audio to everyone." }
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="text-center space-y-6"
              >
                <div className="h-24 w-24 rounded-[2rem] bg-gradient-to-br from-primary to-primary/80 text-white flex items-center justify-center text-3xl font-black mx-auto shadow-2xl shadow-primary/30 rotate-3 hover:rotate-0 transition-transform duration-500">
                  {s.step}
                </div>
                <h3 className="text-2xl font-black tracking-tight">{s.title}</h3>
                <p className="text-muted-foreground text-lg leading-relaxed font-medium">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
