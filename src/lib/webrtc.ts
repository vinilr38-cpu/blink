
export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  private iceQueues: Map<string, RTCIceCandidateInit[]> = new Map()
  private channelName: string
  private audioContainer: HTMLDivElement | null = null

  constructor(channelName: string) {
    this.channelName = channelName
    // Create a hidden container for audio elements to ensure they stay in the DOM
    if (typeof document !== 'undefined') {
      const id = 'webrtc-audio-container'
      let container = document.getElementById(id) as HTMLDivElement
      if (!container) {
        container = document.createElement('div')
        container.id = id
        container.style.display = 'none'
        document.body.appendChild(container)
      }
      this.audioContainer = container
    }
  }

  async initLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // @ts-ignore - Chrome specific constraints
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true
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
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(configuration)
    this.peerConnections.set(peerId, pc)
    this.iceQueues.set(peerId, [])

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate)
      }
    }

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('Received remote track for', peerId)
      let remoteStream = event.streams[0]
      if (!remoteStream) {
        remoteStream = new MediaStream([event.track])
      }

      if (onTrack) onTrack(remoteStream)
      this.playRemoteAudio(peerId, remoteStream)
    }

    // Add local stream tracks if available
    if (this.localStream) {
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
      // Enable background play
      audio.setAttribute('playsinline', 'true')
      audio.setAttribute('webkit-playsinline', 'true')

      if (this.audioContainer) {
        this.audioContainer.appendChild(audio)
      }

      this.audioElements.set(peerId, audio)
    }

    audio.srcObject = stream
    audio.play().catch(e => {
      console.warn('Click required to play audio:', e)
      // Attempt to play on next user interaction if blocked
      const resume = () => {
        audio?.play().catch(() => { })
        document.removeEventListener('click', resume)
      }
      document.addEventListener('click', resume)
    })
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
    await this.processIceQueue(peerId)
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(peerId)
    if (!pc) throw new Error('No peer connection found')

    await pc.setRemoteDescription(new RTCSessionDescription(answer))
    await this.processIceQueue(peerId)
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId)
    if (!pc) return

    if (!pc.remoteDescription) {
      this.iceQueues.get(peerId)?.push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (e) {
      console.error('Error adding ICE candidate:', e)
    }
  }

  private async processIceQueue(peerId: string) {
    const pc = this.peerConnections.get(peerId)
    const queue = this.iceQueues.get(peerId)
    if (!pc || !pc.remoteDescription || !queue) return

    while (queue.length > 0) {
      const candidate = queue.shift()
      if (candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error)
      }
    }
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
      audio.remove()
      this.audioElements.delete(peerId)
    }

    this.iceQueues.delete(peerId)
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
