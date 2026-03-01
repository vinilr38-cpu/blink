import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { blink } from '@/lib/blink'
import { WebRTCManager } from '@/lib/webrtc'
import { Participant, WebRTCMessage } from '@/types'
import { Mic, MicOff, UserX, Users, Radio, LogOut, Share2, Hand, Volume2, Headphones } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
}

const item = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1 }
}

export function HostDashboard() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [sessionCode, setSessionCode] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({})
  const webrtcRef = useRef<WebRTCManager | null>(null)
  const channelRef = useRef<any>(null)

  const joinUrl = `${window.location.origin}/join/${sessionCode}`

  useEffect(() => {
    if (!sessionId) return

    let mounted = true
    let channel: any = null

    const init = async () => {
      try {
        const session = await blink.db.sessions.get(sessionId)
        if (!session || !mounted) return

        setSessionCode(session.sessionCode)

        const parts = await blink.db.participants.list({
          where: { sessionId, isConnected: "1" },
          orderBy: { joinedAt: 'asc' }
        })
        if (mounted) setParticipants(parts)

        webrtcRef.current = new WebRTCManager(`session-${sessionId}`)
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        await channel.subscribe({ userId: sessionId })

        channel.onMessage(async (msg: any) => {
          if (!mounted || msg.type !== 'webrtc') return
          const message: WebRTCMessage = msg.data
          if (message.to !== sessionId) return
          const participantId = message.from

          try {
            switch (message.type) {
              case 'offer':
                await webrtcRef.current!.createPeerConnection(
                  participantId,
                  false,
                  (candidate) => {
                    channel.publish('webrtc', {
                      type: 'ice-candidate',
                      from: sessionId,
                      to: participantId,
                      data: candidate
                    }, { userId: sessionId })
                  },
                  (stream) => {
                    updateSpeakingStatus(participantId, true)
                  }
                )
                await webrtcRef.current!.handleOffer(participantId, message.data)
                const answer = await webrtcRef.current!.createAnswer(participantId)
                await channel.publish('webrtc', {
                  type: 'answer',
                  from: sessionId,
                  to: participantId,
                  data: answer
                }, { userId: sessionId })
                break
              case 'ice-candidate':
                if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(participantId, message.data)
                break
              case 'hand-raise':
                await blink.db.participants.update(participantId, {
                  handRaised: 1,
                  handRaisedAt: new Date().toISOString()
                })
                refreshParticipants()
                toast.info(`${message.data.name} raised their hand`)
                break
              case 'hand-lower':
                await blink.db.participants.update(participantId, { handRaised: 0, handRaisedAt: null })
                refreshParticipants()
                break
              case 'participant-speaking':
                updateSpeakingStatus(participantId, message.data.status)
                break
            }
          } catch (error) {
            console.error('Error handling WebRTC message:', error)
          }
        })

        channel.onPresence((users: any[]) => {
          if (!mounted) return
          refreshParticipants()
        })
      } catch (error) {
        console.error('Failed to initialize host dashboard:', error)
        toast.error('Failed to load session')
      }
    }

    init()
    const interval = setInterval(refreshParticipants, 3000)

    return () => {
      mounted = false
      clearInterval(interval)
      channel?.unsubscribe()
      webrtcRef.current?.cleanup()
    }
  }, [sessionId])

  const refreshParticipants = async () => {
    if (!sessionId) return
    try {
      const parts = await blink.db.participants.list({
        where: { sessionId, isConnected: "1" },
        orderBy: { joinedAt: 'asc' }
      })
      setParticipants(parts)
    } catch (error) {
      console.error('Failed to refresh participants:', error)
    }
  }

  const updateSpeakingStatus = async (participantId: string, isSpeaking: boolean) => {
    try {
      await blink.db.participants.update(participantId, { isSpeaking: isSpeaking ? 1 : 0 })
      refreshParticipants()
    } catch (error) {
      console.error('Failed to update speaking status:', error)
    }
  }

  const grantMicPermission = async (participant: Participant) => {
    try {
      await blink.db.participants.update(participant.id, { hasMicPermission: 1, handRaised: 0 })
      await channelRef.current?.publish('webrtc', {
        type: 'mic-permission',
        from: sessionId,
        to: participant.id,
        data: { granted: true }
      }, { userId: sessionId })
      refreshParticipants()
      toast.success(`Mic permission granted to ${participant.name}`)
    } catch (error) {
      console.error('Failed to grant permission:', error)
      toast.error('Failed to grant mic permission')
    }
  }

  const denyMicPermission = async (participant: Participant) => {
    try {
      await blink.db.participants.update(participant.id, {
        hasMicPermission: 0,
        handRaised: 0,
        isSpeaking: 0
      })
      await channelRef.current?.publish('webrtc', {
        type: 'mic-permission',
        from: sessionId,
        to: participant.id,
        data: { granted: false }
      }, { userId: sessionId })
      webrtcRef.current?.closePeerConnection(participant.id)
      refreshParticipants()
      toast.success(`Mic permission revoked from ${participant.name}`)
    } catch (error) {
      console.error('Failed to deny permission:', error)
      toast.error('Failed to revoke mic permission')
    }
  }

  const muteParticipant = async (participant: Participant) => {
    try {
      await blink.db.participants.update(participant.id, { isMuted: 1 })
      await channelRef.current?.publish('webrtc', {
        type: 'mute',
        from: sessionId,
        to: participant.id,
        data: {}
      }, { userId: sessionId })
      refreshParticipants()
      toast.success(`Muted ${participant.name}`)
    } catch (error) {
      console.error('Failed to mute participant:', error)
      toast.error('Failed to mute participant')
    }
  }

  const unmuteParticipant = async (participant: Participant) => {
    try {
      await blink.db.participants.update(participant.id, { isMuted: 0 })
      await channelRef.current?.publish('webrtc', {
        type: 'unmute',
        from: sessionId,
        to: participant.id,
        data: {}
      }, { userId: sessionId })
      refreshParticipants()
      toast.success(`Unmuted ${participant.name}`)
    } catch (error) {
      console.error('Failed to unmute participant:', error)
      toast.error('Failed to unmute participant')
    }
  }

  const removeParticipant = async (participant: Participant) => {
    try {
      await blink.db.participants.update(participant.id, { isConnected: 0 })
      await channelRef.current?.publish('webrtc', {
        type: 'remove',
        from: sessionId,
        to: participant.id,
        data: {}
      }, { userId: sessionId })
      webrtcRef.current?.closePeerConnection(participant.id)
      refreshParticipants()
      toast.success(`Removed ${participant.name}`)
    } catch (error) {
      console.error('Failed to remove participant:', error)
      toast.error('Failed to remove participant')
    }
  }

  const endSession = async () => {
    try {
      try {
        await channelRef.current?.publish('webrtc', {
          type: 'session-ended',
          from: sessionId!,
          to: 'all',
          data: {}
        }, { userId: sessionId! })
      } catch (e) {
        console.error('Failed to notify participants:', e)
      }

      await blink.db.sessions.update(sessionId!, { isActive: 0, endedAt: new Date().toISOString() })

      const activeParticipants = participants.filter(p => Number(p.isConnected) === 1)
      for (const p of activeParticipants) {
        try { await blink.db.participants.update(p.id, { isConnected: 0 }) } catch (e) { }
      }

      webrtcRef.current?.cleanup()
      channelRef.current?.unsubscribe()
      toast.success('Session ended')
      navigate('/')
    } catch (error) {
      console.error('Failed to end session:', error)
    } finally {
      navigate('/')
    }
  }

  const connectedCount = participants.length
  const handRaisedCount = participants.filter(p => Number(p.handRaised) > 0).length
  const speakingCount = participants.filter(p => Number(p.isSpeaking) > 0).length

  return (
    <div className="flex-1 p-8 bg-dot-pattern">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black text-foreground mb-2">Session Dashboard</h1>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            Managing live audio interaction • {sessionCode}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/20 rounded-full text-success font-bold text-sm shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            LIVE SESSION
          </motion.div>

          <button
            className="danger-btn flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold shadow-lg shadow-danger/20"
            onClick={endSession}
          >
            <LogOut className="h-4 w-4" /> End Session
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
        {/* Quick Stats */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "Participants", val: connectedCount, icon: Users, color: "primary" },
            { label: "Speakers", val: speakingCount, icon: Mic, color: "success" },
            { label: "Requests", val: handRaisedCount, icon: Radio, color: "danger" }
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="stat-card p-6 rounded-3xl group overflow-hidden relative glass-morphism border-none shadow-xl"
            >
              <div className={`absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity`}>
                <s.icon size={110} />
              </div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{s.label}</h3>
              <p className={`text-5xl font-black text-${s.color} tracking-tighter`}>{s.val}</p>
            </motion.div>
          ))}
        </div>

        {/* QR Access Card */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="stat-card p-6 rounded-3xl glass-morphism border-primary/10 flex flex-col items-center justify-center shadow-xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Share2 className="h-12 w-12" />
          </div>
          <span className="text-[10px] font-bold text-primary mb-4 tracking-[0.2em] uppercase">Scan to Join</span>
          <div className="bg-white p-3 rounded-2xl shadow-2xl border border-primary/5 mb-4 group-hover:scale-105 transition-transform duration-500">
            <QRCodeSVG value={joinUrl} size={110} />
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(joinUrl)
              toast.success('Link copied!')
            }}
            className="text-[10px] font-black tracking-widest text-muted-foreground hover:text-primary transition-colors uppercase"
          >
            {sessionCode}
          </button>
        </motion.div>
      </div>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            Live Queue
          </h2>
          <div className="h-[1px] flex-1 bg-primary/10 mx-6 opacity-50" />
        </div>

        <motion.div
          className="participants-grid"
          variants={container}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {participants.map((participant) => {
              const hasPermission = Number(participant.hasMicPermission) > 0
              const isMuted = Number(participant.isMuted) > 0
              const isSpeaking = Number(participant.isSpeaking) > 0
              const handRaised = Number(participant.handRaised) > 0

              return (
                <motion.div
                  key={participant.id}
                  layout
                  variants={item}
                  whileHover={{ scale: 1.05 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className={`user-card relative p-6 glass-morphism border-none shadow-lg overflow-hidden transition-all duration-500 rounded-3xl ${isSpeaking ? 'ring-2 ring-success shadow-success/20' : ''}`}
                >
                  {isSpeaking && <div className="absolute inset-0 bg-success/5 speaking-pulse" />}

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-6">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl font-black text-primary">
                        {participant.name.charAt(0)}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <AnimatePresence>
                          {isSpeaking && (
                            <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 10, opacity: 0 }}>
                              <Badge className="bg-success text-white border-none py-1 px-3 rounded-full text-[10px] font-black uppercase tracking-widest">Live</Badge>
                            </motion.div>
                          )}
                          {handRaised && !hasPermission && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="h-4 w-4 flex items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/20"
                            >
                              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mb-8">
                      <h4 className="text-xl font-black text-foreground mb-1 leading-tight">{participant.name}</h4>
                      <p className="text-[10px] font-bold text-muted-foreground tracking-[0.15em] uppercase opacity-70">{participant.phone}</p>
                    </div>

                    <div className="flex gap-3">
                      <AnimatePresence mode="wait">
                        {!hasPermission ? (
                          <motion.button
                            key="grant"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={`primary-btn flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl ${handRaised ? 'animate-bounce-subtle' : 'opacity-70 grayscale'}`}
                            onClick={() => grantMicPermission(participant)}
                          >
                            <Mic className="h-4 w-4" /> <span>Invite</span>
                          </motion.button>
                        ) : (
                          <motion.div
                            key="controls"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-2 w-full"
                          >
                            <button
                              className={`flex-1 flex items-center justify-center py-3 rounded-2xl font-black text-xs transition-all ${isMuted ? 'bg-danger/10 text-danger hover:bg-danger/20' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                              onClick={() => isMuted ? unmuteParticipant(participant) : muteParticipant(participant)}
                            >
                              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                            </button>
                            <button
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                              onClick={() => denyMicPermission(participant)}
                            >
                              Revoke
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-muted/50 hover:bg-danger/10 hover:text-danger text-muted-foreground transition-all"
                        onClick={() => removeParticipant(participant)}
                      >
                        <UserX className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>

        {participants.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-40 text-center glass-morphism rounded-[3rem] border-2 border-dashed border-primary/10 shadow-inner"
          >
            <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Users className="h-10 w-10 text-primary/20" />
            </div>
            <p className="text-2xl font-black text-foreground mb-3">Waiting for your audience</p>
            <p className="text-muted-foreground font-medium max-w-xs mx-auto leading-relaxed">
              Share the QR code or link to start the interactive session.
            </p>
          </motion.div>
        )}
      </section>
    </div>
  )
}
