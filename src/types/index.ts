export interface Session {
  id: string
  hostId: string
  sessionCode: string
  isActive: string | number
  createdAt: string
  endedAt?: string
}

export interface Participant {
  id: string
  sessionId: string
  name: string
  phone: string
  peerId?: string
  isConnected: string | number
  hasMicPermission: string | number
  isMuted: string | number
  isSpeaking: string | number
  handRaised: string | number
  handRaisedAt?: string
  joinedAt: string
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'mic-permission' | 'mute' | 'unmute' | 'remove' | 'hand-raise' | 'hand-lower' | 'participant-speaking'
  from: string
  to: string
  data?: any
}
