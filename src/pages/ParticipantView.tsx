import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Headphones, Radio, Hand, ArrowLeft } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { WebRTCManager } from '@/lib/webrtc'
import { AudioWaveform } from '@/components/AudioWaveform'
import { AdSense } from '@/components/AdSense'
import { AMPAd } from '@/components/AMPAd'

// Cast blink to any to avoid TS errors on dynamic SDK methods
const blink = blinkSDK as any


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

  useEffect(() => {
    if (stage === 'join' || !sessionId || !participantId) return

    let mounted = true
    let channel: any = null

    const init = async () => {
      try {
        // 1. Set up Firestore listener for this participant
        const participantRef = doc(db, 'participants', participantId)
        const unsubscribeFirestore = onSnapshot(participantRef, (docSnap) => {
          if (!mounted || !docSnap.exists()) return
          const data = docSnap.data()
          
          if (data.hasMicPermission !== undefined) {
            const hasPerm = Number(data.hasMicPermission) > 0
            if (hasPerm && !hasMicPermission) {
              setHasMicPermission(true)
              toast.success('🎤 Microphone permission granted!')
              startAudioStream()
            } else if (!hasPerm && hasMicPermission) {
              setHasMicPermission(false)
              toast.error('Microphone permission revoked')
              stopAudioStream()
            }
          }
          
          if (data.handRaised !== undefined) {
            setHandRaised(Number(data.handRaised) > 0)
          }
          
          if (data.isMuted !== undefined) {
            const muted = Number(data.isMuted) > 0
            if (muted !== isMuted) {
              setIsMuted(muted)
              if (muted) {
                webrtcRef.current?.muteLocalAudio()
                toast.info('You have been muted')
              } else {
                webrtcRef.current?.unmuteLocalAudio()
                toast.info('You have been unmuted')
              }
            }
          }
        })

        // 2. Set up signaling channel
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        // 3. Signaling listener via Firestore
        const signalingRef = collection(db, 'sessions', sessionId, 'signaling')
        const sigQ = query(signalingRef, where('to', '==', participantId))
        
        const unsubscribeSignaling = onSnapshot(sigQ, async (snapshot) => {
          if (!mounted) return
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added') {
              const message = change.doc.data()
              const msgId = change.doc.id

              try {
                switch (message.type) {
                  case 'answer':
                    if (webrtcRef.current) await webrtcRef.current.handleAnswer(sessionId, message.data)
                    break
                  case 'ice-candidate':
                    if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(sessionId, message.data)
                    break
                  case 'mic-permission':
                    if (message.data.granted) {
                      setHasMicPermission(true)
                      toast.success('🎤 Microphone permission granted!')
                      startAudioStream()
                    } else {
                      setHasMicPermission(false)
                      toast.error('Microphone permission revoked')
                      stopAudioStream()
                    }
                    break
                  case 'remove':
                    toast.error('You have been removed from the session')
                    cleanup()
                    setStage('join')
                    break
                }
                // Cleanup processed signal
                await deleteDoc(doc(db, 'sessions', sessionId, 'signaling', msgId))
              } catch (err) {
                console.error('Signaling processing error:', err)
              }
            }
          }
        })

        // Listen for session end via the session document itself
        const sessionRef = doc(db, 'sessions', sessionId)
        const unsubscribeSession = onSnapshot(sessionRef, (docSnap) => {
          if (!mounted) return
          if (docSnap.exists() && docSnap.data().isActive === 0) {
            toast.error('Session ended by host')
            cleanup()
            setStage('join')
          }
        })

        await channel.subscribe({ userId: participantId })

        return () => {
          unsubscribeFirestore()
          unsubscribeSignaling()
          unsubscribeSession()
        }
      } catch (error) {
        console.error('Failed to initialize participant view:', error)
      }
    }

    init()

    return () => {
      mounted = false
      channel?.unsubscribe()
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
      // 1. Lookup session by code in Firestore
      const sessionsRef = collection(db, 'sessions')
      const q = query(sessionsRef, where('sessionCode', '==', sessionCode?.trim().toUpperCase()))
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.empty) {
        throw new Error('Session not found — invalid code?')
      }

      const sessionDoc = querySnapshot.docs[0]
      const realSessionId = sessionDoc.id
      setSessionId(realSessionId)

      // 2. Generate a consistent ID
      const consistentId = user?.id || `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 3. Register in Firestore
      const participantRef = doc(db, 'participants', consistentId)
      await setDoc(participantRef, {
        sessionId: realSessionId,
        name: name.trim(),
        phone: phone.trim(),
        email: user ? user.email : email.trim(),
        userId: consistentId,
        isConnected: 1,
        hasMicPermission: 0,
        isMuted: 0,
        isSpeaking: 0,
        handRaised: 0,
        joinedAt: serverTimestamp()
      })

      setParticipantId(consistentId)
      setStage('waiting')
      toast.success('Connected successfully! Waiting for host...')
    } catch (error: any) {
      console.error('Join Session Failed:', error)
      toast.error(error.message || 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const raiseHand = async () => {
    if (!participantId || !sessionId) return
    try {
      setHandRaised(true)
      const participantRef = doc(db, 'participants', participantId)
      await updateDoc(participantRef, {
        handRaised: 1
      })
      toast.success('✋ Hand raised!')
    } catch (error: any) {
      setHandRaised(false)
      toast.error('Failed to raise hand')
    }
  }

  const lowerHand = async () => {
    if (!participantId || !sessionId) return
    try {
      setHandRaised(false)
      const participantRef = doc(db, 'participants', participantId)
      await updateDoc(participantRef, {
        handRaised: 0
      })
      toast.info('Hand lowered')
    } catch (error) {
      console.error('Failed to lower hand:', error)
    }
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
        async (candidate) => {
          // Send ICE Candidate via Firestore
          await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
            type: 'ice-candidate',
            from: participantId,
            to: sessionId,
            data: JSON.parse(JSON.stringify(candidate)),
            timestamp: serverTimestamp()
          })
        }
      )

      const offer = await webrtcRef.current.createOffer(sessionId)

      // Send Offer via Firestore
      await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
        type: 'offer',
        from: participantId,
        to: sessionId,
        data: JSON.parse(JSON.stringify(offer)),
        timestamp: serverTimestamp()
      })

      const participantRef = doc(db, 'participants', participantId)
      await updateDoc(participantRef, {
        isSpeaking: 1
      })
    } catch (error) {
      console.error('Mic access error:', error)
      toast.error('Mic access denied')
    }
  }

  const stopAudioStream = () => {
    webrtcRef.current?.cleanup()
    setAudioStream(null)
    if (participantId) {
      const participantRef = doc(db, 'participants', participantId)
      updateDoc(participantRef, {
        isSpeaking: 0
      }).catch(console.error)
    }
  }

  const toggleMute = async () => {
    if (!participantId || !sessionId) return
    const newMutedState = !isMuted
    setIsMuted(newMutedState)

    try {
      const participantRef = doc(db, 'participants', participantId)
      if (newMutedState) {
        webrtcRef.current?.muteLocalAudio()
        await updateDoc(participantRef, {
          isMuted: 1,
          isSpeaking: 0
        })
      } else {
        webrtcRef.current?.unmuteLocalAudio()
        await updateDoc(participantRef, {
          isMuted: 0,
          isSpeaking: 1
        })
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error)
    }
  }

  const cleanup = () => {
    stopAudioStream()
    channelRef.current?.unsubscribe()
    if (participantId) {
      const participantRef = doc(db, 'participants', participantId)
      deleteDoc(participantRef).catch(console.error)
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
            <AdSense className="mt-6" />
            <AMPAd className="mt-4" />
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
                          <motion.div
                            animate={{ y: [0, -15, 0] }}
                            transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                          >
                            <Hand size={40} />
                          </motion.div>
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
            <AdSense className="mt-6" />
            <AMPAd className="mt-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
