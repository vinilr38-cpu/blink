import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '@/components/ui/badge'
import { blink } from '@/lib/blink'
import { WebRTCManager } from '@/lib/webrtc'
import { Participant, WebRTCMessage } from '@/types'
import { Mic, MicOff, UserX, Users } from 'lucide-react'
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
          where: { sessionId, isConnected: 1 },
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

              case 'participant-speaking':
                const id = message.data.id
                const status = message.data.status
                const el = document.getElementById(`user-${id}`)
                if (el) {
                  if (status) {
                    el.classList.add("success-border")
                  } else {
                    el.classList.remove("success-border")
                  }
                }
                // Also update state to keep it in sync and update badges
                updateSpeakingStatus(participantId, status)
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
        where: { sessionId, isConnected: 1 },
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
      // 1. Notify all participants
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

      // 2. Update session status
      await blink.db.sessions.update(sessionId!, {
        isActive: 0,
        endedAt: new Date().toISOString()
      })

      // 3. Disconnect all participants using object API
      const activeParticipants = participants.filter(p => Number(p.isConnected) === 1)
      for (const p of activeParticipants) {
        try {
          await blink.db.participants.update(p.id, { isConnected: 0 })
        } catch (e) {
          console.error(`Failed to disconnect participant ${p.id}:`, e)
        }
      }

      // 4. Cleanup resources
      webrtcRef.current?.cleanup()
      channelRef.current?.unsubscribe()

      toast.success('Session ended')
    } catch (error) {
      console.error('Failed to end session:', error)
      toast.error('Error during session end')
    } finally {
      // ALWAYS navigate back to home
      navigate('/')
    }
  }

  const connectedCount = participants.length
  const handRaisedCount = participants.filter(p => Number(p.handRaised) > 0).length
  const speakingCount = participants.filter(p => Number(p.isSpeaking) > 0).length

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <h2>Smart Audio</h2>
        <div className="space-y-4">
          <button className="primary-btn w-full" onClick={() => toast.info(`Session Code: ${sessionCode}`)}>
            Session: {sessionCode}
          </button>
          <div className="stat-card flex flex-col items-center">
            <h3 className="mb-4">Scan to Join</h3>
            <div className="bg-white p-2 rounded-lg">
              <QRCodeSVG value={joinUrl} size={160} />
            </div>
            <p className="text-[10px] mt-4 text-muted-foreground break-all text-center">{joinUrl}</p>
          </div>
          <button className="danger-btn w-full" onClick={endSession}>
            End Session
          </button>
        </div>
      </aside>

      <main className="main-content">
        <section className="stats">
          <div className="stat-card">
            <h3>Total Participants</h3>
            <p id="count">{connectedCount}</p>
          </div>

          <div className="stat-card">
            <h3>Active Speakers</h3>
            <p id="speakers">{speakingCount}</p>
          </div>

          <div className="stat-card">
            <h3>Hands Raised</h3>
            <p>{handRaisedCount}</p>
          </div>
        </section>

        <section className="participants-grid" id="participants">
          {participants.map((participant) => {
            const hasPermission = Number(participant.hasMicPermission) > 0
            const isMuted = Number(participant.isMuted) > 0
            const isSpeaking = Number(participant.isSpeaking) > 0
            const handRaised = Number(participant.handRaised) > 0

            return (
              <div
                key={participant.id}
                id={`user-${participant.id}`}
                className={`user-card ${isSpeaking ? 'success-border' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-foreground">{participant.name}</h4>
                    <p className="text-xs text-muted-foreground">{participant.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    {isSpeaking && (
                      <Badge className="bg-success">
                        Speaking
                      </Badge>
                    )}
                    {handRaised && (
                      <Badge className="bg-primary animate-pulse">
                        Raised Hand
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="controls">
                  {!hasPermission && handRaised && (
                    <button className="primary-btn" onClick={() => grantMicPermission(participant)}>
                      Grant Mic
                    </button>
                  )}

                  {hasPermission && (
                    <>
                      <button
                        className="primary-btn"
                        onClick={() => isMuted ? unmuteParticipant(participant) : muteParticipant(participant)}
                        style={{ background: isMuted ? 'hsl(var(--danger))' : 'hsl(var(--primary))' }}
                      >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </button>
                      <button className="danger-btn" onClick={() => denyMicPermission(participant)}>
                        Revoke
                      </button>
                    </>
                  )}

                  <button
                    className="danger-btn ml-auto"
                    onClick={() => removeParticipant(participant)}
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}

          {participants.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-xl border-2 border-dashed border-border">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-foreground font-medium">No participants yet</p>
              <p className="text-sm text-muted-foreground">Share the join link to start your session</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
