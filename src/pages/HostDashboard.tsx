import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteDoc, getDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Users, Radio, LogOut, Share2, Hand, UserX } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { WebRTCManager } from '@/lib/webrtc'
import { AudioWaveform } from '@/components/AudioWaveform'
import { Participant } from '@/types'

// Cast blink to any to avoid TS errors on dynamic SDK methods
const blink = blinkSDK as any

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

  // Construct join URL using current origin
  const joinUrl = `${window.location.origin}/join/${sessionCode}`

  useEffect(() => {
    if (!sessionId) return

    let mounted = true
    let channel: any = null

    const init = async () => {
      try {
        let sessionCodeVal = ''

        // 1. Get/Initialize session in Firestore
        const sessionRef = doc(db, 'sessions', sessionId)
        const sessionSnap = await getDoc(sessionRef)
        
        if (sessionSnap.exists()) {
          const data = sessionSnap.data()
          sessionCodeVal = data.sessionCode
          setSessionCode(data.sessionCode)
        } else {
          // If session doesn't exist in Firestore, we should probably redirect or create it
          // For now, let's try the SDK fallback
          try {
            const session = await blink.db.sessions.get(sessionId)
            if (session) {
              sessionCodeVal = session.sessionCode
              setSessionCode(session.sessionCode)
              // Sync to Firestore
              await setDoc(sessionRef, {
                sessionId,
                sessionCode: session.sessionCode,
                isActive: 1,
                createdAt: serverTimestamp()
              })
            }
          } catch (e) {
            console.warn('SDK Session lookup failed:', e)
          }
        }

        if (!mounted) return

        // 2. Continuous Firestore listener for participants
        const participantsRef = collection(db, 'participants')
        const q = query(participantsRef, where('sessionId', '==', sessionId))
        
        const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
          if (!mounted) return
          const list = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Participant[]
          
          // Filter out host if needed (though host shouldn't be in participants collection)
          setParticipants(list.filter(p => !p.isHost))
        })

        webrtcRef.current = new WebRTCManager(`session-${sessionId}`)
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        await channel.subscribe({ userId: sessionId })

        // 3. Signaling listener via Firestore
        const signalingRef = collection(db, 'sessions', sessionId, 'signaling')
        const sigQ = query(signalingRef, where('to', '==', sessionId))
        
        const unsubscribeSignaling = onSnapshot(sigQ, async (snapshot) => {
          if (!mounted) return
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added') {
              const message = change.doc.data()
              const participantId = message.from
              const msgId = change.doc.id

              try {
                switch (message.type) {
                  case 'offer':
                    await handleWebRTCOffer(participantId, message.data)
                    break
                  case 'ice-candidate':
                    if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(participantId, message.data)
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

        const handleWebRTCOffer = async (participantId: string, offer: any) => {
          if (!webrtcRef.current) return
          await webrtcRef.current.createPeerConnection(
            participantId,
            false,
            async (candidate) => {
              // Send ICE Candidate via Firestore
              await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
                type: 'ice-candidate',
                from: sessionId,
                to: participantId,
                data: JSON.parse(JSON.stringify(candidate)),
                timestamp: serverTimestamp()
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
          
          // Send Answer via Firestore
          await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
            type: 'answer',
            from: sessionId,
            to: participantId,
            data: JSON.parse(JSON.stringify(answer)),
            timestamp: serverTimestamp()
          })
        }

        return () => {
          unsubscribeFirestore()
          unsubscribeSignaling()
        }
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
    const cleanupFirestore = init()

    return () => {
      mounted = false
      cleanupFirestore.then(unsub => unsub?.())
      channel?.unsubscribe()
      webrtcRef.current?.cleanup()
    }
  }, [sessionId])

  const updateSpeakingStatus = async (participantId: string, isSpeaking: boolean) => {
    try {
      const participantRef = doc(db, 'participants', participantId)
      await updateDoc(participantRef, {
        isSpeaking: isSpeaking ? 1 : 0
      })
    } catch (error) {
      console.error('Failed to update speaking status:', error)
    }
  }


  const grantMicPermission = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await updateDoc(participantRef, {
        hasMicPermission: 1,
        handRaised: 0
      })

      const targetId = participant.userId || participant.id

      // Broadcast update via Socket
      socketRef.current?.emit('participant-updated', {
        sessionId,
        participantId: participant.id,
        updates: { hasMicPermission: 1, handRaised: 0 }
      })

      // Send permission signal via Firestore
      await addDoc(collection(db, 'sessions', sessionId!, 'signaling'), {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
        data: { granted: true },
        timestamp: serverTimestamp()
      })

      toast.success(`Mic permission granted to ${participant.name}`)
    } catch (error) {
      console.error('Failed to grant permission:', error)
      toast.error('Failed to grant mic permission')
    }
  }

  const denyMicPermission = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await updateDoc(participantRef, {
        hasMicPermission: 0,
        handRaised: 0,
        isSpeaking: 0
      })

      const targetId = participant.userId || participant.id

      // Send revocation signal via Firestore
      await addDoc(collection(db, 'sessions', sessionId!, 'signaling'), {
        type: 'mic-permission',
        from: sessionId,
        to: targetId,
        data: { granted: false },
        timestamp: serverTimestamp()
      })

      webrtcRef.current?.closePeerConnection(targetId)
      toast.success(`Mic permission revoked from ${participant.name}`)
    } catch (error) {
      console.error('Failed to deny permission:', error)
      toast.error('Failed to revoke mic permission')
    }
  }

  const lowerParticipantHand = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await updateDoc(participantRef, {
        handRaised: 0
      })
      toast.info(`Lowered hand for ${participant.name}`)
    } catch (error) {
      console.error('Failed to lower hand:', error)
      toast.error('Failed to lower hand')
    }
  }

  const muteParticipant = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await updateDoc(participantRef, {
        isMuted: 1
      })

      const targetId = participant.userId || participant.id

      socketRef.current?.emit('webrtc-signaling', {
        type: 'mute',
        from: sessionId,
        to: targetId,
        sessionId,
        data: {}
      })

      toast.success(`Muted ${participant.name}`)
    } catch (error) {
      console.error('Failed to mute participant:', error)
      toast.error('Failed to mute participant')
    }
  }

  const unmuteParticipant = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await updateDoc(participantRef, {
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

      toast.success(`Unmuted ${participant.name}`)
    } catch (error) {
      console.error('Failed to unmute participant:', error)
      toast.error('Failed to unmute participant')
    }
  }

  const removeParticipant = async (participant: Participant) => {
    try {
      const participantRef = doc(db, 'participants', participant.id)
      await deleteDoc(participantRef)

      const targetId = participant.userId || participant.id
      
      socketRef.current?.emit('webrtc-signaling', {
        type: 'remove',
        from: sessionId,
        to: targetId,
        data: {}
      })

      webrtcRef.current?.closePeerConnection(targetId)
      toast.success(`Removed ${participant.name}`)
    } catch (error) {
      console.error('Failed to remove participant:', error)
      toast.error('Failed to remove participant')
    }
  }

  const endSession = async () => {
    try {
      // 1. Mark session as inactive in Firestore
      const sessionRef = doc(db, 'sessions', sessionId!)
      await updateDoc(sessionRef, {
        isActive: 0,
        endedAt: serverTimestamp()
      })

      // 2. Clear participants for this session
      const participantsRef = collection(db, 'participants')
      const q = query(participantsRef, where('sessionId', '==', sessionId))
      const snapshot = await onSnapshot(q, (snap) => {
        snap.docs.forEach(async (doc) => {
          await deleteDoc(doc.ref)
        })
      })

      // 3. Notify participants via socket
      socketRef.current?.emit('session-ended', { sessionId })

      webrtcRef.current?.cleanup()
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
            {[...participants]
              .sort((a, b) => {
                const aRaised = Number(a.handRaised) > 0 && Number(a.hasMicPermission) === 0;
                const bRaised = Number(b.handRaised) > 0 && Number(b.hasMicPermission) === 0;
                if (aRaised && !bRaised) return -1;
                if (!aRaised && bRaised) return 1;
                return 0;
              })
              .map((participant) => {
                const hasPermission = Number(participant.hasMicPermission) > 0
                const isMuted = Number(participant.isMuted) > 0
                const isSpeaking = Number(participant.isSpeaking) > 0
                const handRaised = Number(participant.handRaised) > 0
                const showHandHighlight = handRaised && !hasPermission

                return (
                  <motion.div
                    key={participant.id}
                    layout
                    variants={item}
                    whileHover={{ y: -5 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className={`user-card relative p-8 glass-morphism overflow-hidden rounded-[2rem] shadow-xl group transition-all duration-500 ${isSpeaking ? 'border-2 border-success shadow-[0_0_30px_rgba(16,185,129,0.2)]' : 'border-none'} ${showHandHighlight ? 'hand-raise-glow' : ''}`}
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
