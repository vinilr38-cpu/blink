import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { blink } from '@/lib/blink'
import { Mic, Users, Radio, Headphones, Play, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export function HomePage() {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const createSession = async () => {
    setIsCreating(true)

    try {
      const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const session = await blink.db.sessions.create({
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        hostId: `host_${Date.now()}`,
        sessionCode,
        isActive: 1
      })

      toast.success('Session created successfully!')
      navigate(`/host/${session.id}`)
    } catch (error) {
      console.error('Failed to create session:', error)
      toast.error('Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (joinCode.length !== 6) {
      toast.error('Session code must be 6 characters')
      return
    }
    navigate(`/join/${joinCode.toUpperCase()}`)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  }

  return (
    <div className="flex-1 bg-background text-foreground bg-dot-pattern">
      {/* Hero Section */}
      <div className="relative overflow-hidden pt-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />

        <div className="relative max-w-7xl mx-auto px-4 py-16 lg:py-24">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="text-center space-y-8 max-w-3xl mx-auto"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm font-medium text-primary">
              <Radio className="h-4 w-4 animate-pulse" />
              Live Audio Q&A Platform
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
      <div className="max-w-7xl mx-auto px-4 py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {[
            { icon: Mic, title: "Real-Time Audio", desc: "Ultra-low latency WebRTC streaming from any device." },
            { icon: Users, title: "10+ Participants", desc: "Scale your sessions with professional management tools." },
            { icon: Radio, title: "Instant Join", desc: "No app needed. Scan or type the code to go live." },
            { icon: Headphones, title: "Hand Raising", desc: "Structured Q&A with real-time speaker moderation." }
          ].map((f, i) => (
            <motion.div key={i} variants={itemVariants}>
              <Card className="h-full border-none shadow-lg hover:shadow-xl transition-shadow bg-white/50 backdrop-blur-sm rounded-3xl overflow-hidden group">
                <CardHeader className="pb-2">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {f.desc}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* How It Works */}
      <div className="bg-muted/30 py-24 border-y border-primary/5">
        <div className="max-w-7xl mx-auto px-4">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-4xl font-bold text-center mb-16"
          >
            How It Works
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { step: "1", title: "Host Creates Session", desc: "Start a session to get your unique QR code and 6-digit link." },
              { step: "2", title: "Participants Join", desc: "Scan or type the code. No login required for your audience." },
              { step: "3", title: "Live Audio Q&A", desc: "Manage permissions and stream high-quality audio instantly." }
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="text-center space-y-6 relative"
              >
                <div className="h-20 w-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-3xl font-black mx-auto shadow-xl ring-8 ring-primary/10">
                  {s.step}
                </div>
                <h3 className="text-2xl font-bold">{s.title}</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
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
