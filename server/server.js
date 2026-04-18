import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── SERVER SETUP ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} [${res.statusCode}] ${duration}ms`);
    });
    next();
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "Blink Signaling Server Running (Stateless)" }));

// ─── SOCKET.IO SIGNALLING ─────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("Trace: Client connected:", socket.id);

    socket.on("join-session", (data) => {
        const { sessionId, userId, name, isHost } = data;
        socket.join(sessionId);
        socket.data.sessionId = sessionId;
        socket.data.userId = userId;
        socket.data.isHost = !!isHost;

        if (isHost) {
            console.log(`Trace: Host ${userId} joined room ${sessionId}`);
            io.to(sessionId).emit("host-ready", { sessionId });
        } else {
            console.log(`Trace: Participant ${name} (${userId}) joined room ${sessionId}`);
            io.to(sessionId).emit("participant-joined", { name, userId });
        }
    });

    socket.on("webrtc-signaling", (data) => {
        // Broadcast signaling messages to the specific session room
        // data should contain { type, from, to, sessionId, data }
        io.to(data.sessionId).emit("webrtc-signaling", data);
    });

    socket.on("hand-raise", (data) => {
        io.to(data.sessionId).emit("hand-raise", data);
    });

    socket.on("hand-lower", (data) => {
        io.to(data.sessionId).emit("hand-lower", data);
    });

    socket.on("participant-updated", (data) => {
        io.to(data.sessionId).emit("participant-updated", data);
    });

    socket.on("disconnect", () => {
        const { sessionId, userId, name } = socket.data || {};
        if (sessionId) {
            console.log(`Trace: Client ${userId || socket.id} disconnected from session ${sessionId}`);
            // We don't auto-remove from Firestore here; the host or explicit leave action does that.
            // But we can broadcast a transient disconnect if needed.
            io.to(sessionId).emit("participant-socket-disconnected", { userId, name });
        }
    });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\x1b[32m%s\x1b[0m`, `✔ Blink Signaling Server is live on port ${PORT}`);
    console.log(`\x1b[36m%s\x1b[0m`, `ℹ Database: Firebase Firestore (External)`);
    console.log(`\x1b[36m%s\x1b[0m`, `ℹ Mode: Stateless Real-time Signaling`);
});
