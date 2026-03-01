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
import { Mic, MicOff, Hand, UserX, Users, Volume2, Headphones } from 'lucide-react'
import { toast } from 'sonner'

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
        // Get session details
        const session = await blink.db.sessions.get(sessionId)
        if (!session || !mounted) return

        setSessionCode(session.sessionCode)

        // Load participants
        const parts = await blink.db.participants.list({
          where: { sessionId, isConnected: "1" },
          orderBy: { joinedAt: 'asc' }
        })
        if (mounted) setParticipants(parts)

        // Setup WebRTC manager
        webrtcRef.current = new WebRTCManager(`session-${sessionId}`)

        // Setup realtime channel for signaling
        channel = blink.realtime.channel(`session-${sessionId}`)
        channelRef.current = channel

        await channel.subscribe({ userId: sessionId })

        // Listen for WebRTC signaling messages
        channel.onMessage(async (msg: any) => {
          if (!mounted || msg.type !== 'webrtc') return

          const message: WebRTCMessage = msg.data

          if (message.to !== sessionId) return

          const participantId = message.from

          try {
            switch (message.type) {
              case 'offer':
                // Participant is offering to send audio
                const pc = await webrtcRef.current!.createPeerConnection(
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
                    // Play incoming audio
                    console.log('Receiving audio from:', participantId)
                    // Update speaking indicator
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
                if (webrtcRef.current) {
                  await webrtcRef.current.handleIceCandidate(participantId, message.data)
                }
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
                await blink.db.participants.update(participantId, {
                  handRaised: 0,
                  handRaisedAt: null
                })
                refreshParticipants()
                break
            }
          } catch (error) {
            console.error('Error handling WebRTC message:', error)
          }
        })

        // Presence tracking
        channel.onPresence((users: any[]) => {
          if (!mounted) return
          // Update participant connection status
          refreshParticipants()
        })

      } catch (error) {
        console.error('Failed to initialize host dashboard:', error)
        toast.error('Failed to load session')
      }
    }

    init()

    // Refresh participants every 2 seconds
    const interval = setInterval(refreshParticipants, 2000)

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
      
      // Send permission via realtime
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

      // Send denial via realtime
      await channelRef.current?.publish('webrtc', {
        type: 'mic-permission',
        from: sessionId,
        to: participant.id,
        data: { granted: false }
      }, { userId: sessionId })

      // Close peer connection
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
      await blink.db.sessions.update(sessionId!, { 
        isActive: 0,
        endedAt: new Date().toISOString()
      })

      // Disconnect all participants
      await blink.db.sql(`
        UPDATE participants 
        SET is_connected = 0 
        WHERE session_id = ?
      `, [sessionId])

      webrtcRef.current?.cleanup()
      channelRef.current?.unsubscribe()

      toast.success('Session ended')
      navigate('/')
    } catch (error) {
      console.error('Failed to end session:', error)
      toast.error('Failed to end session')
    }
  }

  const connectedCount = participants.length
  const handRaisedCount = participants.filter(p => Number(p.handRaised) > 0).length
  const speakingCount = participants.filter(p => Number(p.isSpeaking) > 0).length

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Host Dashboard</h1>
            <p className="text-muted-foreground">Session Code: <span className="font-mono font-semibold text-foreground">{sessionCode}</span></p>
          </div>
          <Button variant="destructive" onClick={endSession}>
            End Session
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connected</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{connectedCount}</div>
              <p className="text-xs text-muted-foreground">Total participants</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hands Raised</CardTitle>
              <Hand className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{handRaisedCount}</div>
              <p className="text-xs text-muted-foreground">Waiting to speak</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speaking</CardTitle>
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{speakingCount}</div>
              <p className="text-xs text-muted-foreground">Currently speaking</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* QR Code */}
          <Card>
            <CardHeader>
              <CardTitle>Join Session</CardTitle>
              <CardDescription>Scan QR code to join</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={joinUrl} size={200} />
              </div>
              <p className="text-xs text-center text-muted-foreground break-all">{joinUrl}</p>
            </CardContent>
          </Card>

          {/* Participants List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Participants ({connectedCount})</CardTitle>
              <CardDescription>Manage participant permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {participants.map((participant) => {
                    const hasPermission = Number(participant.hasMicPermission) > 0
                    const isMuted = Number(participant.isMuted) > 0
                    const isSpeaking = Number(participant.isSpeaking) > 0
                    const handRaised = Number(participant.handRaised) > 0

                    return (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-foreground">{participant.name}</h4>
                            {isSpeaking && (
                              <Badge variant="default" className="gap-1">
                                <Headphones className="h-3 w-3" />
                                Speaking
                              </Badge>
                            )}
                            {handRaised && (
                              <Badge variant="secondary" className="gap-1">
                                <Hand className="h-3 w-3" />
                                Hand Raised
                              </Badge>
                            )}
                            {hasPermission && !isSpeaking && (
                              <Badge variant="outline">Mic Enabled</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{participant.phone}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {!hasPermission && handRaised && (
                            <Button size="sm" onClick={() => grantMicPermission(participant)}>
                              Grant Mic
                            </Button>
                          )}
                          
                          {hasPermission && (
                            <>
                              {isMuted ? (
                                <Button size="sm" variant="outline" onClick={() => unmuteParticipant(participant)}>
                                  <MicOff className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => muteParticipant(participant)}>
                                  <Mic className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="destructive" onClick={() => denyMicPermission(participant)}>
                                Revoke
                              </Button>
                            </>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeParticipant(participant)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {participants.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No participants yet</p>
                      <p className="text-sm">Share the QR code to get started</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
