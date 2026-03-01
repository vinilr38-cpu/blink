import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { blink } from '@/lib/blink'
import { WebRTCManager } from '@/lib/webrtc'
import { WebRTCMessage } from '@/types'
import { Hand, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'

export function ParticipantView() {
  const { sessionCode } = useParams()
  const [stage, setStage] = useState<'join' | 'waiting' | 'active'>('join')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
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
        // Setup realtime channel
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        await channel.subscribe({ userId: participantId })

        // Listen for messages from host
        channel.onMessage(async (msg: any) => {
          if (!mounted || msg.type !== 'webrtc') return

          const message: WebRTCMessage = msg.data

          if (message.to !== participantId) return

          try {
            switch (message.type) {
              case 'mic-permission':
                if (message.data.granted) {
                  setHasMicPermission(true)
                  toast.success('Microphone permission granted! You can now speak.')
                  // Start audio streaming
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
                toast.info('You have been muted by the host')
                break

              case 'unmute':
                setIsMuted(false)
                webrtcRef.current?.unmuteLocalAudio()
                toast.info('You have been unmuted by the host')
                break

              case 'remove':
                toast.error('You have been removed from the session')
                cleanup()
                setStage('join')
                break

              case 'answer':
                if (webrtcRef.current) {
                  await webrtcRef.current.handleAnswer(sessionId, message.data)
                }
                break

              case 'ice-candidate':
                if (webrtcRef.current) {
                  await webrtcRef.current.handleIceCandidate(sessionId, message.data)
                }
                break
            }
          } catch (error) {
            console.error('Error handling message:', error)
          }
        })

      } catch (error) {
        console.error('Failed to initialize participant view:', error)
        toast.error('Failed to connect to session')
      }
    }

    init()

    return () => {
      mounted = false
      channel?.unsubscribe()
    }
  }, [stage, sessionId, participantId])

  const joinSession = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Please enter your name and phone number')
      return
    }

    setIsConnecting(true)

    try {
      // Find session by code
      const sessions = await blink.db.sessions.list({
        where: { sessionCode, isActive: "1" },
        limit: 1
      })

      if (sessions.length === 0) {
        toast.error('Session not found or has ended')
        setIsConnecting(false)
        return
      }

      const session = sessions[0]
      setSessionId(session.id)

      // Create participant record
      const participant = await blink.db.participants.create({
        id: `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId: session.id,
        name: name.trim(),
        phone: phone.trim(),
        isConnected: 1,
        hasMicPermission: 0,
        isMuted: 0,
        isSpeaking: 0,
        handRaised: 0
      })

      setParticipantId(participant.id)
      setStage('waiting')
      toast.success('Joined session successfully!')

    } catch (error) {
      console.error('Failed to join session:', error)
      toast.error('Failed to join session')
    } finally {
      setIsConnecting(false)
    }
  }

  const raiseHand = async () => {
    if (!participantId || !sessionId) {
      toast.error('Session not connected')
      return
    }

    if (!channelRef.current) {
      toast.error('Connection not ready. Please wait...')
      return
    }

    try {
      setHandRaised(true)
      await blink.db.participants.update(participantId, {
        handRaised: 1,
        handRaisedAt: new Date().toISOString()
      })

      await channelRef.current.publish('webrtc', {
        type: 'hand-raise',
        from: participantId,
        to: sessionId,
        data: { name }
      }, { userId: participantId })

      toast.success('Hand raised! Waiting for host approval...')
    } catch (error) {
      console.error('Failed to raise hand:', error)
      toast.error('Failed to raise hand. Please try again.')
      setHandRaised(false)
    }
  }

  const lowerHand = async () => {
    if (!participantId || !sessionId) {
      toast.error('Session not connected')
      return
    }

    if (!channelRef.current) {
      toast.error('Connection not ready. Please wait...')
      return
    }

    try {
      setHandRaised(false)
      await blink.db.participants.update(participantId, {
        handRaised: 0,
        handRaisedAt: null
      })

      await channelRef.current.publish('webrtc', {
        type: 'hand-lower',
        from: participantId,
        to: sessionId,
        data: {}
      }, { userId: participantId })

      toast.info('Hand lowered')
    } catch (error) {
      console.error('Failed to lower hand:', error)
      toast.error('Failed to lower hand. Please try again.')
      setHandRaised(true)
    }
  }

  const startAudioStream = async () => {
    if (!sessionId || !participantId) return

    try {
      // Initialize WebRTC manager
      webrtcRef.current = new WebRTCManager(`session-${sessionId}`)

      // Get microphone access
      const stream = await webrtcRef.current.initLocalStream()
      setAudioStream(stream)

      // Create peer connection
      const pc = await webrtcRef.current.createPeerConnection(
        sessionId,
        true,
        (candidate) => {
          // Send ICE candidate to host
          channelRef.current?.publish('webrtc', {
            type: 'ice-candidate',
            from: participantId,
            to: sessionId,
            data: candidate
          }, { userId: participantId })
        }
      )

      // Create and send offer
      const offer = await webrtcRef.current.createOffer(sessionId)

      await channelRef.current?.publish('webrtc', {
        type: 'offer',
        from: participantId,
        to: sessionId,
        data: offer
      }, { userId: participantId })

      // Update speaking status
      await blink.db.participants.update(participantId, { isSpeaking: 1 })

      // Publish speaking event for instant feedback
      await channelRef.current?.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: true }
      }, { userId: participantId })

      toast.success('Audio streaming started!')
    } catch (error) {
      console.error('Failed to start audio stream:', error)
      toast.error('Failed to access microphone')
    }
  }

  const stopAudioStream = () => {
    webrtcRef.current?.cleanup()
    setAudioStream(null)

    if (participantId) {
      blink.db.participants.update(participantId, { isSpeaking: 0 }).catch(console.error)

      // Publish speaking event for instant feedback
      channelRef.current?.publish('webrtc', {
        type: 'participant-speaking',
        from: participantId,
        to: sessionId,
        data: { id: participantId, status: false }
      }, { userId: participantId })
    }
  }

  const toggleMute = () => {
    if (isMuted) {
      webrtcRef.current?.unmuteLocalAudio()
      setIsMuted(false)
    } else {
      webrtcRef.current?.muteLocalAudio()
      setIsMuted(true)
    }
  }

  const cleanup = () => {
    stopAudioStream()
    channelRef.current?.unsubscribe()

    if (participantId) {
      blink.db.participants.update(participantId, { isConnected: 0 }).catch(console.error)
    }
  }

  const leaveSession = () => {
    cleanup()
    setStage('join')
    setName('')
    setPhone('')
    setParticipantId(null)
    setSessionId(null)
    setHandRaised(false)
    setHasMicPermission(false)
    toast.info('Left session')
  }

  if (stage === 'join') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Join Session</CardTitle>
            <CardDescription>Session Code: <span className="font-mono font-semibold">{sessionCode}</span></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={joinSession}
              disabled={isConnecting || !name.trim() || !phone.trim()}
            >
              {isConnecting ? 'Joining...' : 'Join Session'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (stage === 'waiting') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome, {name}!</CardTitle>
            <CardDescription>You're in the session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center space-y-4">
              {hasMicPermission ? (
                <>
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Mic className="h-8 w-8" />
                    <Badge variant="default" className="text-lg px-4 py-2">
                      Mic Enabled
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You can speak now. Your audio is being streamed to the host.
                  </p>

                  <div className="flex gap-2 justify-center">
                    <Button
                      size="lg"
                      variant={isMuted ? "outline" : "default"}
                      onClick={toggleMute}
                    >
                      {isMuted ? (
                        <>
                          <MicOff className="h-5 w-5 mr-2" />
                          Unmute
                        </>
                      ) : (
                        <>
                          <Mic className="h-5 w-5 mr-2" />
                          Mute
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : handRaised ? (
                <>
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Hand className="h-8 w-8 animate-pulse" />
                    <Badge variant="secondary" className="text-lg px-4 py-2">
                      Hand Raised
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Waiting for host to grant microphone permission...
                  </p>
                  <Button variant="outline" onClick={lowerHand}>
                    Lower Hand
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <VolumeX className="h-8 w-8" />
                    <Badge variant="outline" className="text-lg px-4 py-2">
                      Listening
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Raise your hand to request permission to speak
                  </p>
                  <Button size="lg" onClick={raiseHand}>
                    <Hand className="h-5 w-5 mr-2" />
                    Raise Hand
                  </Button>
                </>
              )}
            </div>

            <div className="pt-4 border-t">
              <Button variant="destructive" className="w-full" onClick={leaveSession}>
                Leave Session
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
