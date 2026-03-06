
export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  private iceQueues: Map<string, RTCIceCandidateInit[]> = new Map()
  private channelName: string
  private audioContainer: HTMLDivElement | null = null
  private audioContext: AudioContext | null = null

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
      // Force exact echo/noise cancellation — not just 'ideal' — for maximum suppression
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,      // Force ON (not ideal)
          noiseSuppression: true,       // Force ON
          autoGainControl: true,        // Force ON
          sampleRate: 48000,
          channelCount: 1,             // Mono is better for voice
          // @ts-ignore - Chrome-specific, ignored on other browsers
          googEchoCancellation: true,
          googEchoCancellation2: true,
          googAutoGainControl: true,
          googAutoGainControl2: true,
          googNoiseSuppression: true,
          googNoiseSuppression2: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googAudioMirroring: false
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

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    return this.audioContext
  }

  playRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId)

    if (!audio) {
      audio = new Audio()
      audio.autoplay = true
      audio.setAttribute('playsinline', 'true')
      audio.setAttribute('webkit-playsinline', 'true')
      if (this.audioContainer) {
        this.audioContainer.appendChild(audio)
      }
      this.audioElements.set(peerId, audio)
    }

    audio.srcObject = stream

    // Web Audio API pipeline: reduces loudness → prevents mic re-pickup (echo)
    try {
      const ctx = this.getAudioContext()
      const source = ctx.createMediaStreamSource(stream)

      // DynamicsCompressor prevents volume spikes from getting loud enough to echo
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-20, ctx.currentTime)
      compressor.knee.setValueAtTime(30, ctx.currentTime)
      compressor.ratio.setValueAtTime(8, ctx.currentTime)
      compressor.attack.setValueAtTime(0.003, ctx.currentTime)
      compressor.release.setValueAtTime(0.25, ctx.currentTime)

      // Keep output at 75% volume — audible but not loud enough to loop back into mic
      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0.75, ctx.currentTime)

      source.connect(compressor)
      compressor.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Silence the raw <audio> element — sound comes from Web Audio chain above
      audio.volume = 0
    } catch (e) {
      console.warn('Web Audio API unavailable, using direct playback:', e)
      audio.volume = 0.7
    }

    audio.play().catch(e => {
      console.warn('Autoplay blocked, waiting for user interaction:', e)
      const resume = () => {
        audio?.play().catch(() => { })
        document.removeEventListener('click', resume)
        document.removeEventListener('touchstart', resume)
      }
      document.addEventListener('click', resume)
      document.addEventListener('touchstart', resume)
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
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
  }
}
