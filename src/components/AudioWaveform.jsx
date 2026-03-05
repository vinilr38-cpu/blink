import { useEffect, useRef } from "react";

export default function AudioWaveform({ stream }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!stream) return;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        source.connect(analyser);
        // Do NOT connect to destination here to avoid echo if the WebRTCManager is already playing it.
        // However, we MUST ensure the context is running.
        if (audioContext.state === 'suspended') {
            const resume = () => {
                if (audioContext.state === 'suspended') audioContext.resume();
            };
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('touchstart', resume, { once: true });
        }

        analyser.fftSize = 256; // Smaller fft for smoother waveform

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const draw = () => {
            requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray);

            ctx.fillStyle = "#F4F6F9";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.lineWidth = 2;
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, "#2563EB");
            gradient.addColorStop(1, "#10B981");
            ctx.strokeStyle = gradient;
            ctx.beginPath();

            const sliceWidth = canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        };

        draw();

        return () => {
            audioContext.close();
        };
    }, [stream]);

    return (
        <canvas
            ref={canvasRef}
            width={400}
            height={100}
            style={{
                borderRadius: "12px",
                background: "#ffffff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
            }}
        />
    );
}
