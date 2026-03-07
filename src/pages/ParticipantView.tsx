/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { blink as blinkSDK } from '@/lib/blink'
import { WebRTCManager } from '@/lib/webrtc'
import { WebRTCMessage } from '@/types'
import { Hand, Mic, MicOff, ArrowLeft, Headphones, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'
import AudioWaveform from '@/components/AudioWaveform'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

// Cast blink to any to avoid TS errors on dynamic SDK methods
const blink = blinkSDK as any

// Auto-detect local network testing
const isLocalNetwork = window.location.hostname === 'localhost' || /^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(window.location.hostname);
const defaultSocketUrl = isLocalNetwork ? `http://${window.location.hostname}:5001` : 'https://blink-3.onrender.com';
const SOCKET_URL = import.meta.env.VITE_API_URL || defaultSocketUrl;


export function ParticipantView() {
  const { sessionCode } = useParams()
  const navigate = useNavigate()
  const [stage, setStage] = useState<'join' | 'waiting' | 'active'>('join')

  // Pre-fill from localStorage if user is logged in
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null } })()
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [email, setEmail] = useState('')
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [handRaised, setHandRaised] = useState(false)
  const [hasMicPermission, setHasMicPermission] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null)

  const webrtcRef = useRef<WebRTCManager | null>(null)
  const channelRef = useRef<any>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (stage === 'join' || !sessionId || !participantId) return

    let mounted = true
    let channel: any = null

    const init = async () => {
      try {
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        // Use existing socket or initialize if missing (e.g. on direct page reload)
        if (!socketRef.current) {
          socketRef.current = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            // Reconnection settings — ensures socket reconnects if the OS suspends the app
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 2000,
            timeout: 10000
          });
        }

        const socket = socketRef.current;
        socket.emit('join-session', {
          sessionId,
          userId: participantId,
          name,
          phone,
          email: user?.email || email
        });

        // Listen for signaling over Socket.io (handles BOTH WebRTC signaling AND control messages)
        socket.on('webrtc-signaling', async (message: any) => {
          if (!mounted || message.to !== participantId) return

          try {
            switch (message.type) {
              // WebRTC signaling
              case 'answer':
                if (webrtcRef.current) await webrtcRef.current.handleAnswer(sessionId, message.data)
                break
              case 'ice-candidate':
                if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(sessionId, message.data)
                break
              // Control messages — host sends these to grant/revoke mic access
              case 'mic-permission':
                if (message.data.granted) {
                  setHasMicPermission(true)
                  toast.success('🎤 Microphone permission granted!')
                  await startAudioStream()
                } else {
                  setHasMicPermission(false)
                  toast.error('Microphone permission revoked')
                  stopAudioStream()
                }
                break
              case 'mute':
                setIsMuted(true)
                webrtcRef.current?.muteLocalAudio()
                toast.info('You have been muted')
                break
              case 'unmute':
                setIsMuted(false)
                webrtcRef.current?.unmuteLocalAudio()
                toast.info('You have been unmuted')
                break
              case 'remove':
                toast.error('You have been removed from the session')
                cleanup()
                setStage('join')
                break
            }
          } catch (err) {
            console.error('Socket signaling error:', err)
          }
        })

        // 🔑 KEY FIX: Wait for host-ready signal before sending WebRTC offer
        // This ensures the host has registered its socket listener before we send the offer
        socket.on('host-ready', async ({ sessionId: readySessionId }: any) => {
          if (!mounted || readySessionId !== sessionId) return
          if (hasMicPermission && webrtcRef.current) {
            console.log('Host is ready - initiating WebRTC offer')
            await startAudioStream()
          }
        })

        await channel.subscribe({ userId: participantId })

        // 🚀 "socket.emit" equivalent for joining
        const joinData = {
          sessionId,
          name: name.trim(),
          phone: phone.trim(),
          email: user ? user.email : email.trim(),
          userId: user ? user.id : null
        }
        await channel.publish('webrtc', {
          type: 'join-session',
          from: participantId,
          to: sessionId,
          data: joinData
        }, { userId: participantId })

        channel.onMessage(async (msg: any) => {
          if (!mounted || msg.type !== 'webrtc') return
          const message: WebRTCMessage = msg.data
          if (message.to !== participantId) return

          try {
            switch (message.type) {
              case 'mic-permission':
                if (message.data.granted) {
                  setHasMicPermission(true)
                  toast.success('Microphone permission granted!')
                  await startAudioStream()
                } else {
                  setHasMicPermission(false)
                  toast.error('Microphone permission revoked')
                  stopAudioStream()
                }
                break

              case 'mute':
                setIsMuted(true)
                webrtcRef.current?.muteLocalAudio()
                toast.info('You have been muted')
                break

              case 'unmute':
                setIsMuted(false)
                webrtcRef.current?.unmuteLocalAudio()
                toast.info('You have been unmuted')
                break

              case 'remove':
                toast.error('Removed from session')
                cleanup()
                setStage('join')
                break

              case 'session-ended':
                toast.error('Session ended by host')
                cleanup()
                setStage('join')
                break
            }
          } catch (error) {
            console.error('Error handling message:', error)
          }
        })
      } catch (error) {
        console.error('Failed to initialize participant view:', error)
      }
    }

    init()

    // ─── Page Visibility / Background Reconnect ────────────────────────────
    // When the user switches apps on mobile, the browser suspends JS and the
    // socket disconnects. When they return, we reconnect and re-emit join-session
    // so the server cancels its removal grace-period timer.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionId && participantId) {
        const socket = socketRef.current
        if (!socket) return
        if (!socket.connected) {
          console.log('Returning from background — reconnecting socket...')
          socket.connect()
          // Re-join after a short delay to ensure the connection is up
          setTimeout(() => {
            socket.emit('join-session', {
              sessionId,
              userId: participantId,
              name,
              phone,
              email: user?.email || email
            })
          }, 800)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel?.unsubscribe()
      // ⚠️ Do NOT disconnect the socket here — keep it alive for background reconnect.
      // It will be cleaned up when the participant explicitly leaves (cleanup()).
      webrtcRef.current?.cleanup()
    }
  }, [stage, sessionId, participantId])

  const joinSession = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    setIsConnecting(true)
    try {
      const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));

      // 🌐 Step 1: Lookup session code → get the real sessionId
      const lookupPromise = api.get(`/sessions/lookup/${sessionCode?.trim().toUpperCase()}`)
      const res: any = await Promise.race([lookupPromise, timeout(15000)])

      const realSessionId = res.data.sessionId
      if (!realSessionId) throw new Error('Session not found — invalid code?');

      setSessionId(realSessionId)

      // ✅ Generate ONE consistent ID used everywhere — REST, socket, Blink SDK, and state.
      // This is critical so mic-permission messages sent by the host actually reach this participant.
      const consistentId = user?.id || `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const joinData = {
        sessionId: realSessionId,
        name: name.trim(),
        phone: phone.trim(),
        email: user ? user.email : email.trim(),
        userId: consistentId  // ← same ID for all channels
      }

      // 🔗 Step 2: Register via REST (primary join mechanism)
      const restJoinPromise = api.post('/sessions/join', joinData)
      await Promise.race([restJoinPromise, timeout(15000)])

      // 🔌 Step 3: Connect via Socket.io for real-time sync
      if (!socketRef.current) {
        socketRef.current = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          timeout: 10000
        })
      }
      socketRef.current.emit("join-session", joinData)  // uses same consistentId

      // 🧩 Step 4 (Optional): Sync to Blink SDK
      try {
        await blink.db.participants.create({
          id: consistentId,  // ← same ID
          sessionId: realSessionId,
          name: name.trim(),
          phone: phone.trim(),
          email: user ? user.email : email.trim(),
          isConnected: 1,
          hasMicPermission: 0,
          isMuted: 0,
          isSpeaking: 0,
          handRaised: 0
        })
      } catch (sdkErr: any) {
        console.warn('Blink SDK sync skipped (non-critical):', sdkErr?.message)
      }

      setParticipantId(consistentId)  // ← same ID stored in state
      setStage('waiting')
      toast.success('Connected successfully! Waiting for host...')
    } catch (error: any) {
      console.error('Join Session Failed:', error)

      let errorMsg = 'Connection failed'
      if (error.message === 'Timeout') {
        errorMsg = 'Connection timed out. The server may be waking up — try again in 30 seconds.'
      } else if (error.response) {
        const serverError = error.response.data?.error || error.response.statusText;
        errorMsg = `Server Error: ${serverError}`
      } else if (error.request) {
        errorMsg = 'Network Error: Cannot reach backend. Check your internet connection.'
      } else {
        errorMsg = `Error: ${error.message}`
      }

      toast.error(errorMsg, { duration: 8000 })
    } finally {
      setIsConnecting(false)
    }
  }

  const raiseHand = async () => {
    if (!participantId || !sessionId) return
    try {
      setHandRaised(true)
      // Persist to REST backend
      await api.post(`/sessions/${sessionId}/hand-raise`, {
        participantId,
        name: name.trim()
      })
      // Notify host via realtime channel if connected
      if (channelRef.current) {
        await channelRef.current.publish('webrtc', {
          type: 'hand-raise',
          from: participantId,
          to: sessionId,
          data: { name: name.trim() }
        }, { userId: participantId })
      }
      // Also notify via socket for reliability
      socketRef.current?.emit('hand-raise', { sessionId, participantId, name: name.trim() })
      toast.success('✋ Hand raised!')
    } catch (error: any) {
      setHandRaised(false)
      toast.error('Failed to raise hand: ' + (error?.message || 'Unknown error'))
    }
  }

  const lowerHand = async () => {
    if (!participantId || !sessionId) return
    try {
      setHandRaised(false)
      await api.post(`/sessions/${sessionId}/hand-lower`, {
        participantId,
        name: name.trim()
      })
      if (channelRef.current) {
        await channelRef.current.publish('webrtc', {
          type: 'hand-lower',
          from: participantId,
          to: sessionId,
          data: { name: name.trim() }
        }, { userId: participantId })
      }
      socketRef.current?.emit('hand-lower', { sessionId, participantId, name: name.trim() })
      toast.info('Hand lowered')
    } catch (error) { }
  }

  const startAudioStream = async () => {
    if (!sessionId || !participantId) return
    try {
      webrtcRef.current = new WebRTCManager(`session-${sessionId}`)
      const stream = await webrtcRef.current.initLocalStream()
      setAudioStream(stream)

      await webrtcRef.current.createPeerConnection(
        sessionId,
        true,
        (candidate) => {
          socketRef.current?.emit('webrtc-signaling', {
            type: 'ice-candidate',
            from: participantId,
            to: sessionId,
            sessionId,
            data: candidate
          })
        }
      )

      const offer = await webrtcRef.current.createOffer(sessionId)

      // Send offer immediately - timing is controlled by host-ready event
      socketRef.current?.emit('webrtc-signaling', {
        type: 'offer',
        from: participantId,
        to: sessionId,
        sessionId,
        data: offer
      })

      await api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isSpeaking: 1
      }).catch(console.error)
      await channelRef.current?.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: true }
      }, { userId: participantId })
    } catch (error) {
      toast.error('Mic access denied')
    }
  }

  const stopAudioStream = () => {
    webrtcRef.current?.cleanup()
    setAudioStream(null)
    if (participantId) {
      api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isSpeaking: 0
      }).catch(console.error)
      channelRef.current?.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: false }
      }, { userId: participantId })
    }
  }

  const toggleMute = async () => {
    if (!participantId || !sessionId || !channelRef.current) return
    const newMutedState = !isMuted
    setIsMuted(newMutedState)

    if (newMutedState) {
      webrtcRef.current?.muteLocalAudio()
      await api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isMuted: 1,
        isSpeaking: 0
      }).catch(console.error)
      await channelRef.current.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: false }
      }, { userId: participantId })
    } else {
      webrtcRef.current?.unmuteLocalAudio()
      await api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isMuted: 0,
        isSpeaking: 1
      }).catch(console.error)
      await channelRef.current.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: true }
      }, { userId: participantId })
    }
  }

  const cleanup = () => {
    stopAudioStream()
    channelRef.current?.unsubscribe()
    if (participantId) {
      api.post(`/sessions/${sessionId}/participants/${participantId}/update`, {
        isConnected: 0
      }).catch(console.error)
    }
  }

  const leaveSession = () => {
    cleanup()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-background bg-dot-pattern flex items-center justify-center p-6">
      <AnimatePresence mode="wait">
        {stage === 'join' ? (
          <motion.div
            key="join-stage"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <Card className="glass-morphism border-none shadow-2xl rounded-3xl overflow-hidden">
              <div className="h-2 bg-primary w-full" />
              <CardHeader className="text-center pt-8">
                <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Radio className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <CardTitle className="text-3xl font-black tracking-tight">Join Session</CardTitle>
                <CardDescription className="text-lg font-bold text-primary/60">
                  CODE: {sessionCode}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-8 pb-10">

                {user && (
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl">
                    <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center text-lg font-black text-primary">
                      {user.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground">Joining as {user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <Label htmlFor="name" className="text-sm font-black uppercase tracking-widest text-muted-foreground ml-1">Your Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter full name"
                    className="h-14 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium px-5"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="phone" className="text-sm font-black uppercase tracking-widest text-muted-foreground ml-1">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+91 00000 00000"
                    className="h-14 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium px-5"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                {!user && (
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-sm font-black uppercase tracking-widest text-muted-foreground ml-1">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      className="h-14 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium px-5"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}

                <button
                  className="primary-btn w-full py-4 text-xl flex items-center justify-center gap-3"
                  onClick={joinSession}
                  disabled={isConnecting || !name.trim() || !phone.trim()}
                >
                  {isConnecting ? 'Connecting...' : 'Join Now'}
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full text-sm font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Home
                </button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="waiting-stage"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <Card className="glass-morphism border-none shadow-2xl rounded-3xl overflow-hidden text-center">
              <div className="h-2 bg-primary w-full" />
              <CardHeader className="pt-10">
                <CardTitle className="text-2xl font-black">Welcome, {name.split(' ')[0]}!</CardTitle>
                <CardDescription className="font-bold flex items-center justify-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  Live Connection Verified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 px-8 pb-12">
                <div className="py-10 bg-primary/5 rounded-3xl border border-primary/5 relative overflow-hidden group">
                  {hasMicPermission && !isMuted && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-20 pointer-events-none">
                      {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: [20, 60, 20] }}
                          transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                          className="w-1 bg-primary rounded-full"
                        />
                      ))}
                    </div>
                  )}

                  <AnimatePresence mode="wait">
                    {hasMicPermission ? (
                      <motion.div key="active" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                        <div className="h-24 w-24 bg-success text-white rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-success/40 ring-8 ring-success/10 relative">
                          {!isMuted && <div className="absolute inset-0 bg-success rounded-full animate-ping opacity-25" />}
                          {isMuted ? <MicOff size={40} /> : <Mic size={40} />}
                        </div>

                        {!isMuted && audioStream && (
                          <div className="flex justify-center">
                            <AudioWaveform stream={audioStream} />
                          </div>
                        )}

                        <div>
                          <Badge className="bg-success px-4 py-1 text-sm mb-2">{isMuted ? 'Muted' : 'Speaking Live'}</Badge>
                          <p className="text-muted-foreground font-medium px-4">
                            {isMuted ? 'Wait for host to unmute you' : 'Your audience can hear you now'}
                          </p>
                        </div>
                        <button
                          className={`px-8 py-3 rounded-2xl font-black transition-all ${isMuted ? 'bg-success text-white shadow-lg' : 'bg-white border-2 border-danger/20 text-danger hover:bg-danger/5'}`}
                          onClick={toggleMute}
                        >
                          {isMuted ? 'Click to Unmute' : 'Mute Microphone'}
                        </button>
                      </motion.div>
                    ) : handRaised ? (
                      <motion.div key="waiting" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                        <div className="h-24 w-24 bg-primary text-white rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-primary/40 ring-8 ring-primary/10">
                          <Hand size={40} className="animate-bounce" />
                        </div>
                        <div>
                          <Badge variant="secondary" className="px-4 py-1 text-sm mb-2">Request Sent</Badge>
                          <p className="text-muted-foreground font-medium px-10 leading-relaxed">
                            Waiting for the host to approve your microphone access
                          </p>
                        </div>
                        <button
                          onClick={lowerHand}
                          className="text-sm font-black text-muted-foreground hover:text-danger transition-colors underline underline-offset-4"
                        >
                          Cancel Request
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                        <div className="h-24 w-24 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto border-4 border-white shadow-lg">
                          <Headphones size={40} />
                        </div>
                        <div>
                          <Badge variant="outline" className="px-4 py-1 text-sm mb-2">Listening Mode</Badge>
                          <p className="text-muted-foreground font-medium px-4">
                            Raise your hand if you want to ask a question
                          </p>
                        </div>
                        <button
                          className="primary-btn px-10 py-4 text-lg"
                          onClick={raiseHand}
                        >
                          Raise Your Hand
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="pt-6 border-t flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Session</p>
                    <p className="text-sm font-bold text-foreground">Interactive Audio Q&A</p>
                  </div>
                  <button
                    onClick={leaveSession}
                    className="px-6 py-3 rounded-xl bg-danger/10 text-danger font-black text-sm hover:bg-danger/20 transition-all"
                  >
                    Leave Session
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
