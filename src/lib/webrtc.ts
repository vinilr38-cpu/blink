import { blink } from './blink'

export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  private channelName: string

  constructor(channelName: string) {
    this.channelName = channelName
  }

  async initLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      return this.localStream
    } catch (error) {
      console.error('Failed to get local stream:', error)
      throw error
    }
  }

  async createPeerConnection(
    peerId: string,
    isInitiator: boolean,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack?: (stream: MediaStream) => void
  ): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(configuration)
    this.peerConnections.set(peerId, pc)

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate)
      }
    }

    // Handle remote track
    if (onTrack) {
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        onTrack(remoteStream)
        this.playRemoteAudio(peerId, remoteStream)
      }
    }

    // Add local stream tracks if available
    if (this.localStream && isInitiator) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!)
      })
    }

    return pc
  }

  playRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId)
    
    if (!audio) {
      audio = new Audio()
      audio.autoplay = true
      this.audioElements.set(peerId, audio)
    }

    audio.srcObject = stream
    audio.play().catch(e => console.error('Error playing audio:', e))
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    return offer
  }

  async createAnswer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return answer
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    
    // Add local stream tracks after setting remote description
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!)
      })
    }
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    await pc.setRemoteDescription(new RTCSessionDescription(answer))
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  muteLocalAudio() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = false
      })
    }
  }

  unmuteLocalAudio() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true
      })
    }
  }

  closePeerConnection(peerId: string) {
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(peerId)
    }

    const audio = this.audioElements.get(peerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      this.audioElements.delete(peerId)
    }
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
  }

  cleanup() {
    this.peerConnections.forEach((pc, peerId) => {
      this.closePeerConnection(peerId)
    })
    this.stopLocalStream()
  }
}
