
export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  private iceQueues: Map<string, RTCIceCandidateInit[]> = new Map()
  private channelName: string
  private audioContainer: HTMLDivElement | null = null
  private audioContext: AudioContext | null = null
  // Track noise gate intervals so we can clear them on cleanup
  private noiseGateIntervals: Map<string, number> = new Map()

  constructor(channelName: string) {
    this.channelName = channelName
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
      // Phase 1: Request stream with strict browser-level processing constraints
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Standard W3C constraints — enforced as exact where possible
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 1, // Mono: best for voice, lowest echo risk

          // Chrome/Chromium extended constraints for deeper suppression
          // @ts-ignore
          googEchoCancellation: true,
          googEchoCancellation2: true,
          googAutoGainControl: true,
          googAutoGainControl2: true,
          googNoiseSuppression: true,
          googNoiseSuppression2: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googAudioMirroring: false,
          googDAEchoCancellation: true, // Delay-agnostic echo cancellation
        },
        video: false
      })

      // Phase 2: Re-apply constraints after capture to ensure they stick
      // (Some mobile browsers accept but don't immediately apply constraints)
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        await audioTrack.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }).catch(() => {
          // Non-critical: some browsers don't support applyConstraints on audio
        })
      }

      return this.localStream
    } catch (error) {
      // Fallback: try without exact constraints if the browser rejects them
      console.warn('Strict audio constraints failed, retrying with ideal:', error)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      })
      return this.localStream
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

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate)
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote track for', peerId)
      let remoteStream = event.streams[0]
      if (!remoteStream) {
        remoteStream = new MediaStream([event.track])
      }

      if (onTrack) onTrack(remoteStream)
      this.playRemoteAudio(peerId, remoteStream)
    }

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
    // Clear any existing noise gate for this peer
    const existingInterval = this.noiseGateIntervals.get(peerId)
    if (existingInterval) {
      clearInterval(existingInterval)
      this.noiseGateIntervals.delete(peerId)
    }

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

    // Set srcObject so the browser plays the stream
    audio.srcObject = stream

    // Silence the raw <audio> element — all sound routing goes through
    // the Web Audio API pipeline below for processing
    audio.volume = 0

    try {
      const ctx = this.getAudioContext()
      const source = ctx.createMediaStreamSource(stream)

      // ─── Stage 1: Highpass Filter ─────────────────────────────────────────
      // Removes low-frequency rumble (handling noise, wind, HVAC hum)
      // Cutoff at 100Hz — human voice fundamental is 85Hz+, this is safe
      const highpass = ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.setValueAtTime(100, ctx.currentTime)
      highpass.Q.setValueAtTime(0.7, ctx.currentTime)

      // ─── Stage 2: Lowpass Filter ──────────────────────────────────────────
      // Removes high-frequency hiss and sibilance above 7500Hz
      // Voice intelligibility is 300Hz–3400Hz, so 7500Hz gives headroom
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.setValueAtTime(7500, ctx.currentTime)
      lowpass.Q.setValueAtTime(0.7, ctx.currentTime)

      // ─── Stage 3: Presence Boost ──────────────────────────────────────────
      // Peaking EQ at 3kHz — boosts voice clarity and intelligibility
      const presenceBoost = ctx.createBiquadFilter()
      presenceBoost.type = 'peaking'
      presenceBoost.frequency.setValueAtTime(3000, ctx.currentTime)
      presenceBoost.gain.setValueAtTime(4, ctx.currentTime) // +4dB boost
      presenceBoost.Q.setValueAtTime(1.0, ctx.currentTime)

      // ─── Stage 4: Dynamics Compressor ────────────────────────────────────
      // Aggressive compression to tame volume spikes.
      // High ratio ensures loud sounds don't get loud enough to cause echo
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-24, ctx.currentTime) // Start compressing at -24dB
      compressor.knee.setValueAtTime(10, ctx.currentTime)
      compressor.ratio.setValueAtTime(12, ctx.currentTime)      // 12:1 — heavy compression
      compressor.attack.setValueAtTime(0.002, ctx.currentTime)  // Fast attack (2ms)
      compressor.release.setValueAtTime(0.15, ctx.currentTime)  // Fast release (150ms)

      // ─── Stage 5: Noise Gate (AnalyserNode + GainNode) ───────────────────
      // Monitors audio level in real-time.
      // If the signal is below the threshold (no one is speaking), gain
      // drops to ~0 — eliminating background room noise completely.
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.8
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const noiseGateGain = ctx.createGain()
      noiseGateGain.gain.setValueAtTime(1, ctx.currentTime)

      // ─── Stage 6: Master Gain ─────────────────────────────────────────────
      // Volume at 0.85 — clearly audible but below the threshold that
      // causes acoustic echo to re-enter an open microphone nearby
      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.85, ctx.currentTime)

      // ─── Connect the pipeline ─────────────────────────────────────────────
      source.connect(highpass)
      highpass.connect(lowpass)
      lowpass.connect(presenceBoost)
      presenceBoost.connect(compressor)
      compressor.connect(analyser)
      analyser.connect(noiseGateGain)
      noiseGateGain.connect(masterGain)
      masterGain.connect(ctx.destination)

      // ─── Noise Gate Control Loop ──────────────────────────────────────────
      // Polls the analyser every 30ms and smoothly fades gain in/out
      // based on whether audio is above the silence threshold.
      const GATE_THRESHOLD = 8       // RMS value below which we consider it silence (0-255 scale)
      const GATE_OPEN_GAIN = 1.0     // Full gain when voice is detected
      const GATE_CLOSED_GAIN = 0.02  // ~2% gain when silent (not fully 0 to avoid clicks)
      const GATE_ATTACK_MS = 5       // How fast the gate opens (ms)
      const GATE_RELEASE_MS = 120    // How slowly the gate closes (ms, longer = less choppy)

      let gateState: 'open' | 'closed' = 'closed'
      let gateHoldCounter = 0
      const HOLD_FRAMES = Math.round(GATE_RELEASE_MS / 30) // ~4 frames hold before closing

      const gateInterval = setInterval(() => {
        if (ctx.state === 'closed') {
          clearInterval(gateInterval)
          return
        }
        analyser.getByteTimeDomainData(dataArray)

        // Compute RMS (Root Mean Square) of the buffer for accurate energy measurement
        let sumSquares = 0
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128 // Convert 0-255 to -1 to 1
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / bufferLength) * 255 // Back to 0-255 scale

        if (rms > GATE_THRESHOLD) {
          // Signal detected — open gate
          gateHoldCounter = HOLD_FRAMES
          if (gateState !== 'open') {
            gateState = 'open'
            noiseGateGain.gain.linearRampToValueAtTime(
              GATE_OPEN_GAIN,
              ctx.currentTime + GATE_ATTACK_MS / 1000
            )
          }
        } else {
          // Below threshold
          if (gateHoldCounter > 0) {
            // Hold the gate open briefly before closing (prevents choppy artifacts)
            gateHoldCounter--
          } else if (gateState !== 'closed') {
            gateState = 'closed'
            noiseGateGain.gain.linearRampToValueAtTime(
              GATE_CLOSED_GAIN,
              ctx.currentTime + GATE_RELEASE_MS / 1000
            )
          }
        }
      }, 30) as unknown as number

      this.noiseGateIntervals.set(peerId, gateInterval)

    } catch (e) {
      // Fallback: if Web Audio API fails, use direct playback at reduced volume
      console.warn('Web Audio API pipeline failed, using fallback:', e)
      audio.volume = 0.65 // Keep below echo threshold even on fallback
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
    // Clear noise gate for this peer
    const interval = this.noiseGateIntervals.get(peerId)
    if (interval) {
      clearInterval(interval)
      this.noiseGateIntervals.delete(peerId)
    }

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
    // Clear all noise gate intervals
    this.noiseGateIntervals.forEach((interval) => clearInterval(interval))
    this.noiseGateIntervals.clear()

    this.peerConnections.forEach((_, peerId) => {
      this.closePeerConnection(peerId)
    })
    this.stopLocalStream()
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
  }
}
