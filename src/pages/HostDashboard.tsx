import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { blink as blinkSDK } from '@/lib/blink'
import { WebRTCManager } from '@/lib/webrtc'
import { Participant, WebRTCMessage } from '@/types'
import { Mic, MicOff, UserX, Users, Radio, LogOut, Share2, Hand, Volume2, Headphones } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import AudioWaveform from '@/components/AudioWaveform'
import api from '@/lib/api'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

// Cast blink to any to avoid TS errors on dynamic SDK methods
const blink = blinkSDK as any

// Auto-detect local network testing
const isLocalNetwork = window.location.hostname === 'localhost' || /^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(window.location.hostname);
const defaultSocketUrl = isLocalNetwork ? `http://${window.location.hostname}:5001` : 'https://blink-3.onrender.com';
const SOCKET_URL = import.meta.env.VITE_API_URL || defaultSocketUrl;

const container: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
}

const item: any = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1 }
}

export function HostDashboard() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [sessionCode, setSessionCode] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({})
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const webrtcRef = useRef<WebRTCManager | null>(null)
  const channelRef = useRef<any>(null)
  const socketRef = useRef<Socket | null>(null)

  // Construct join URL using current origin
  const joinUrl = `${window.location.origin}/join/${sessionCode}`

  useEffect(() => {
    if (!sessionId) return

    let mounted = true
    let channel: any = null

    const init = async () => {
      try {
        let sessionCode = ''

        // 1. Try to get session from SDK (first choice)
        try {
          const session = await blink.db.sessions.get(sessionId)
          if (session) {
            sessionCode = session.sessionCode
            setSessionCode(session.sessionCode)
          }
        } catch (e) {
          console.warn('SDK Session lookup failed:', e)
        }

        // 2. Sync/Initialize session on our backend (Mandatory)
        const storedUser = localStorage.getItem('user')
        const hostId = storedUser ? JSON.parse(storedUser).id : 'anonymous'

        try {
          const res = await api.post('/sessions/create', {
            sessionId: sessionId,
            sessionCode: sessionCode, // May be empty if SDK failed
            hostId
          })

          // If we didn't have a code from SDK, get it from our backend
          if (!sessionCode && res.data.session?.sessionCode) {
            setSessionCode(res.data.session.sessionCode)
          }
          console.log('Session synced to backend:', sessionId)
        } catch (syncErr: any) {
          console.warn('Backend sync failed (non-critical):', syncErr?.message)
        }

        if (!mounted) return

        const fetchParticipants = async () => {
          try {
            const res = await api.get(`/sessions/${sessionId}/participants`)
            if (mounted) setParticipants(res.data.participants)
          } catch (err) {
            console.error("Failed to fetch participants:", err)
          }
        }

        await fetchParticipants()

        webrtcRef.current = new WebRTCManager(`session-${sessionId}`)
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        await channel.subscribe({ userId: sessionId })

        // Initialize Socket.io for secondary (more reliable) signaling
        const socket = io(SOCKET_URL);
        socketRef.current = socket;
        socket.emit('join-session', { sessionId, userId: sessionId, name: 'Host', isHost: true });

        // Listen for signaling over Socket.io
        socket.on('webrtc-signaling', async (message: any) => {
          if (!mounted || message.to !== sessionId) return
          const participantId = message.from

          try {
            switch (message.type) {
              case 'offer':
                await handleWebRTCOffer(participantId, message.data)
                break
              case 'ice-candidate':
                if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(participantId, message.data)
                break
            }
          } catch (err) {
            console.error('Socket signaling error:', err)
          }
        })

        // Real-time participant list updates
        socket.on('participant-joined', () => {
          if (mounted) fetchParticipants()
        })
        socket.on('participant-left', ({ userId: leftId }: any) => {
          if (mounted) {
            setParticipants(prev => prev.filter(p => p.userId !== leftId))
            setRemoteStreams(prev => {
              const next = new Map(prev)
              // Find participant by userId and remove their stream
              const [peerId] = [...next.entries()].find(([id]) => id === leftId) || []
              if (peerId) next.delete(peerId)
              return next
            })
          }
        })

        const handleWebRTCOffer = async (participantId: string, offer: any) => {
          if (!webrtcRef.current) return
          await webrtcRef.current.createPeerConnection(
            participantId,
            false,
            (candidate) => {
              socket.emit('webrtc-signaling', {
                type: 'ice-candidate',
                from: sessionId,
                to: participantId,
                sessionId,
                data: candidate
              })
            },
            (stream) => {
              updateSpeakingStatus(participantId, true)
              setRemoteStreams(prev => {
                const next = new Map(prev)
                next.set(participantId, stream)
                return next
              })
            }
          )
          await webrtcRef.current.handleOffer(participantId, offer)
          const answer = await webrtcRef.current.createAnswer(participantId)
          socket.emit('webrtc-signaling', {
            type: 'answer',
            from: sessionId,
            to: participantId,
            sessionId,
            data: answer
          })
        }

        channel.onMessage(async (msg: any) => {
          if (!mounted || msg.type !== 'webrtc') return
          const message = msg.data as any
          if (message.to !== sessionId) return
          const participantId = message.from

          try {
            switch (message.type) {
              case 'join-session':
                fetchParticipants()
                // No toast — participant list updates silently
                break
              case 'hand-raise':
                try {
                  await api.post(`/sessions/${sessionId}/hand-raise`, {
                    participantId: message.from,
                    name: message.data?.name
                  })
                } catch { }
                refreshParticipants()
                toast.info(`✋ ${message.data?.name || 'A participant'} raised their hand`)
                break
              case 'hand-lower':
                try {
                  await api.post(`/sessions/${sessionId}/hand-lower`, {
                    participantId: message.from,
                    name: message.data?.name
                  })
                } catch { }
                refreshParticipants()
                break
              case 'participant-speaking':
                updateSpeakingStatus(participantId, message.data.status)
                break
            }
          } catch (error) {
            console.error('Error handling channel message:', error)
          }
        })
      } catch (error) {
        console.error('Failed to initialize host dashboard:', error)
        toast.error('Failed to load session')
      }
    }

    const setupSessionPersistence = () => {
      if (sessionId) {
        localStorage.setItem('activeSessionId', sessionId)
      }
    }

    setupSessionPersistence()
    init()
    const interval = setInterval(refreshParticipants, 3000)

    return () => {
      mounted = false
      clearInterval(interval)
      channel?.unsubscribe()
      socketRef.current?.disconnect()
      webrtcRef.current?.cleanup()
    }
  }, [sessionId])

  const refreshParticipants = async () => {
    if (!sessionId) return
    try {
      const res = await api.get(`/sessions/${sessionId}/participants`)
      setParticipants(res.data.participants || [])
    } catch (error) {
      console.error('Failed to refresh participants:', error)
    }
  }

  const updateSpeakingStatus = async (participantId: string, isSpeaking: boolean) => {
    try {
      await api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isSpeaking: isSpeaking ? 1 : 0
      })
      refreshParticipants()
    } catch (error) {
      console.error('Failed to update speaking status:', error)
    }
  }

  const grantMicPermission = async (participant: Participant) => {
    try {
      await api.post(`/sessions/${sessionId}/participants/${participant.id}/update`, {
        hasMicPermission: 1,
        handRaised: 0
      })

      // Use the consistent userId (matches what participant stores in state)
      const targetId = participant.userId || participant.id

      // Primary: send via Socket.io (fast, reliable)
      socketRef.current?.emit('webrtc-signaling', {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
        sessionId,
        data: { granted: true }
      })

      // Fallback: also send via Blink channel
      await channelRef.current?.publish('webrtc', {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
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
      await api.post(`/sessions/${sessionId}/participants/${participant.id}/update`, {
        hasMicPermission: 0,
        handRaised: 0,
        isSpeaking: 0
      })

      const targetId = participant.userId || participant.id

      socketRef.current?.emit('webrtc-signaling', {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
        sessionId,
        data: { granted: false }
      })

      await channelRef.current?.publish('webrtc', {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
        data: { granted: false }
      }, { userId: sessionId })

      webrtcRef.current?.closePeerConnection(targetId)
      refreshParticipants()
      toast.success(`Mic permission revoked from ${participant.name}`)
    } catch (error) {
      console.error('Failed to deny permission:', error)
      toast.error('Failed to revoke mic permission')
    }
  }

  const lowerParticipantHand = async (participant: Participant) => {
    try {
      await api.post(`/sessions/${sessionId}/hand-lower`, {
        participantId: participant.id,
        name: participant.name
      })
      refreshParticipants()
      toast.info(`Lowered hand for ${participant.name}`)
    } catch (error) {
      console.error('Failed to lower hand:', error)
      toast.error('Failed to lower hand')
    }
  }

  const muteParticipant = async (participant: Participant) => {
    try {
      await api.post(`/sessions/${sessionId}/participants/${participant.id}/update`, {
        isMuted: 1
      })

      const targetId = participant.userId || participant.id

      // Primary: socket (reliable)
      socketRef.current?.emit('webrtc-signaling', {
        type: 'mute',
        from: sessionId,
        to: targetId,
        sessionId,
        data: {}
      })
      // Fallback: Blink channel
      await channelRef.current?.publish('webrtc', {
        type: 'mute',
        from: sessionId,
        to: targetId,
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
      await api.post(`/sessions/${sessionId}/participants/${participant.id}/update`, {
        isMuted: 0
      })

      const targetId = participant.userId || participant.id

      socketRef.current?.emit('webrtc-signaling', {
        type: 'unmute',
        from: sessionId,
        to: targetId,
        sessionId,
        data: {}
      })
      await channelRef.current?.publish('webrtc', {
        type: 'unmute',
        from: sessionId,
        to: targetId,
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
      await api.post(`/sessions/${sessionId}/participants/${participant.id}/remove`)

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
      localStorage.removeItem('activeSessionId')
      toast.success('Session ended')
      navigate('/', { replace: true })
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
    <div className="flex-1 p-4 sm:p-8 bg-dot-pattern transition-theme relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px] animate-pulse" />

      <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-12 relative z-10">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg">
            <Radio className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-foreground tracking-tight">Broadcast Center</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-[9px] flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Live interaction • {sessionCode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-3 px-6 py-2.5 bg-success/10 border border-success/20 rounded-full text-success font-black text-xs tracking-widest shadow-lg shadow-success/5"
          >
            <span className="h-2 w-2 rounded-full bg-success animate-ping" />
            ON AIR
          </motion.div>

          <Button
            variant="ghost"
            className="h-12 w-12 rounded-2xl hover:bg-destructive/10 hover:text-destructive transition-all border border-transparent hover:border-destructive/20"
            onClick={endSession}
          >
            <LogOut className="h-6 w-6" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16 relative z-10">
        {/* Quick Stats */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { label: "Listeners", val: connectedCount, icon: Users, color: "primary", gradient: "from-primary/20 to-primary/5" },
            { label: "On Mic", val: speakingCount, icon: Mic, color: "success", gradient: "from-success/20 to-success/5" },
            { label: "Requests", val: handRaisedCount, icon: Radio, color: "destructive", gradient: "from-destructive/20 to-destructive/5" }
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="stat-card p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] group overflow-hidden relative glass-morphism border-none shadow-2xl"
            >
              <div className={`absolute -right-8 -bottom-8 opacity-[0.05] group-hover:opacity-[0.1] transition-all duration-700 transform group-hover:scale-110 group-hover:rotate-6`}>
                <s.icon size={150} />
              </div>
              <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-6`}>
                <s.icon className={`h-6 w-6 text-${s.color}`} />
              </div>
              <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">{s.label}</h3>
              <p className={`text-4xl md:text-6xl font-black text-foreground tracking-tighter`}>{s.val}</p>
            </motion.div>
          ))}
        </div>

        {/* QR Access Card */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="stat-card p-10 rounded-[2.5rem] glass-morphism border-none flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6 relative z-10">
            <Share2 className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-black text-primary mb-6 tracking-[0.25em] uppercase relative z-10">Invite Audience</span>
          <button
            onClick={() => setQrModalOpen(true)}
            className="bg-white p-4 rounded-3xl shadow-2xl border border-primary/5 mb-4 group-hover:scale-105 transition-transform duration-500 relative z-10 cursor-zoom-in"
            title="Click to enlarge QR code"
          >
            <QRCodeSVG value={joinUrl} size={140} />
          </button>
          <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase mb-4 relative z-10 opacity-60">Tap to enlarge</p>
          <Button
            variant="secondary"
            className="w-full h-12 rounded-2xl font-black text-xs tracking-widest relative z-10"
            onClick={() => {
              navigator.clipboard.writeText(joinUrl)
              toast.success('Access link copied!')
            }}
          >
            COPY LINK • {sessionCode}
          </Button>
        </motion.div>
      </div>

      {/* QR Fullscreen Modal */}
      <AnimatePresence>
        {qrModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="relative glass-morphism rounded-[2.5rem] p-10 flex flex-col items-center gap-8 shadow-2xl border border-primary/10 max-w-sm w-full"
            >
              <div className="text-center">
                <span className="text-[10px] font-black text-primary tracking-[0.3em] uppercase">Smart Audio Session</span>
                <h3 className="text-2xl font-black mt-1">Scan to Join</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-primary/10">
                <QRCodeSVG value={joinUrl} size={280} />
              </div>

              <div className="text-center space-y-2 w-full">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Session Code</p>
                <p className="text-4xl font-black text-primary tracking-[0.3em]">{sessionCode}</p>
                <p className="text-xs text-muted-foreground font-medium break-all px-2 mt-2">{joinUrl}</p>
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  className="flex-1 h-12 rounded-2xl font-black"
                  onClick={() => { navigator.clipboard.writeText(joinUrl); toast.success('Link copied!') }}
                >
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-6 rounded-2xl font-black"
                  onClick={() => setQrModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-black tracking-tight">Active Participants</h2>
          </div>
          <div className="h-[1px] flex-1 bg-primary/10 mx-8 opacity-50" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{connectedCount} Total</p>
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
                  whileHover={{ y: -5 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className={`user-card relative p-8 glass-morphism border-none overflow-hidden rounded-[2rem] shadow-xl group transition-all duration-500 ${isSpeaking ? 'ring-2 ring-success shadow-[0_0_30px_rgba(16,185,129,0.2)]' : ''}`}
                  onClick={() => setSelectedParticipant(participant)}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${isSpeaking ? 'from-success/10 to-transparent' : 'from-primary/5 to-transparent'} opacity-0 group-hover:opacity-100 transition-opacity`} />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-8">
                      <div className={`h-16 w-16 rounded-[1.25rem] flex items-center justify-center text-3xl font-black transition-all duration-500 shadow-lg ${isSpeaking ? 'bg-success text-white scale-110' : 'bg-primary/10 text-primary'}`}>
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <AnimatePresence>
                          {isSpeaking && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                              <div className="h-8 px-4 rounded-full bg-success text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-success/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                Speaking
                              </div>
                            </motion.div>
                          )}
                          {!isSpeaking && handRaised && !hasPermission && (
                            <motion.div
                              initial={{ y: -10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              className="flex gap-2"
                            >
                              <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                                <Hand className="h-5 w-5 animate-bounce" />
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); lowerParticipantHand(participant); }}
                                className="h-10 w-10 flex items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground hover:bg-muted transition-all"
                                title="Lower Hand"
                              >
                                <UserX className="h-4 w-4" />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mb-8">
                      <h4 className="text-2xl font-black text-foreground mb-1 tracking-tight">{participant.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-success opacity-50" />
                        <p className="text-[10px] font-black text-muted-foreground tracking-[0.2em] uppercase">{participant.phone || 'GUEST'}</p>
                      </div>
                    </div>

                    {isSpeaking && remoteStreams.get(participant.id) && (
                      <div className="mb-6 -mx-2 h-12">
                        <AudioWaveform stream={remoteStreams.get(participant.id)!} />
                      </div>
                    )}

                    <div className="flex gap-4">
                      <AnimatePresence mode="wait">
                        {!hasPermission ? (
                          <motion.button
                            key="grant"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${handRaised ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-muted/50 text-muted-foreground opacity-50'}`}
                            onClick={(e) => { e.stopPropagation(); grantMicPermission(participant); }}
                          >
                            <Mic className="h-5 w-5" /> <span>Invite</span>
                          </motion.button>
                        ) : (
                          <motion.div
                            key="controls"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex gap-2 w-full"
                          >
                            <button
                              className={`flex-1 h-14 rounded-2xl flex items-center justify-center transition-all ${isMuted ? 'bg-destructive/10 text-destructive hover:bg-destructive/20' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                              onClick={(e) => { e.stopPropagation(); isMuted ? unmuteParticipant(participant) : muteParticipant(participant); }}
                            >
                              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                            </button>
                            <button
                              className="flex-1 h-14 rounded-2xl bg-muted/50 hover:bg-muted text-foreground font-black text-[10px] uppercase tracking-widest transition-all"
                              onClick={(e) => { e.stopPropagation(); denyMicPermission(participant); }}
                            >
                              Revoke
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        className="w-14 h-14 flex items-center justify-center rounded-2xl bg-muted/30 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                        onClick={(e) => { e.stopPropagation(); removeParticipant(participant); }}
                      >
                        <UserX className="h-6 w-6" />
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

      <AnimatePresence>
        {selectedParticipant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedParticipant(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="details-panel relative w-full max-w-lg glass-morphism border-none rounded-[2rem] overflow-hidden shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center text-3xl font-black text-primary">
                    {selectedParticipant.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black">{selectedParticipant.name}</h3>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Participant Details</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <UserX className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-muted/30">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Name</p>
                  <p className="text-lg font-bold">{selectedParticipant.name}</p>
                </div>
                <div className="p-4 rounded-2xl bg-muted/30">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Phone Number</p>
                  <p className="text-lg font-bold">{selectedParticipant.phone}</p>
                </div>
                <div className="p-4 rounded-2xl bg-muted/30">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Email Address</p>
                  <p className="text-lg font-bold">{selectedParticipant.email || 'Not provided'}</p>
                </div>
                <div className="p-4 rounded-2xl bg-muted/30">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Joined At</p>
                  <p className="text-lg font-bold">
                    {new Date(selectedParticipant.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  className="flex-1 primary-btn py-4"
                  onClick={() => setSelectedParticipant(null)}
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
