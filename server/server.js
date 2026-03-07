import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── FILE-BASED DATABASE ─────────────────────────────────────────────────────
const DB_FILE = join(__dirname, "db.json");

function readDB() {
    if (!existsSync(DB_FILE)) {
        const initial = { users: [], sessions: [] };
        writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    try {
        return JSON.parse(readFileSync(DB_FILE, "utf8"));
    } catch {
        return { users: [], sessions: [] };
    }
}

function writeDB(data) {
    writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─── SERVER SETUP ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT"] }
});

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} [${res.statusCode}] ${duration}ms`);
        if (res.statusCode === 400 && ["POST", "PUT"].includes(req.method)) {
            console.log("Failed Body:", JSON.stringify(req.body, null, 2));
        }
    });
    next();
});

const JWT_SECRET = process.env.JWT_SECRET || "blink_secret_key_2024";

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "Server running (file-based storage)" }));

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
// Grace period map: userId → timeout handle
// Participants who disconnect get a 30s window to reconnect before being removed.
const disconnectTimers = new Map();

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-session", (data) => {
        try {
            const { sessionId, userId, name, phone, email, isHost } = data;

            // Always join the socket room first so signaling works
            socket.join(sessionId);
            // Track for disconnect cleanup
            socket.data.sessionId = sessionId;
            socket.data.userId = userId;
            socket.data.isHost = !!isHost;

            // Cancel any pending grace-period removal for this user
            if (userId && disconnectTimers.has(userId)) {
                clearTimeout(disconnectTimers.get(userId));
                disconnectTimers.delete(userId);
                console.log(`Reconnect: cancelled removal timer for ${userId}`);
            }

            if (isHost) {
                console.log(`Host joined socket room for session ${sessionId}`);
                // Tell all participants the host is ready to receive WebRTC offers
                io.to(sessionId).emit("host-ready", { sessionId });
                return;
            }

            const db = readDB();
            const session = db.sessions.find(s => s.sessionId === sessionId);
            if (session) {
                const exists = session.participants.some(p =>
                    (userId && p.userId === userId) || (email && p.email === email)
                );
                if (!exists) {
                    session.participants.push({
                        id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        userId: userId || null,
                        name,
                        phone: phone || "",
                        email: email || "",
                        isConnected: 1,
                        hasMicPermission: 0,
                        isMuted: 0,
                        isSpeaking: 0,
                        handRaised: 0,
                        joinedAt: new Date().toISOString()
                    });
                    writeDB(db);
                    console.log(`Socket Join: Added ${name} to ${sessionId}`);
                }
            }
            io.to(sessionId).emit("participant-joined", { name, userId });
        } catch (err) {
            console.error("Socket error:", err.message);
        }
    });

    socket.on("webrtc-signaling", (data) => {
        io.to(data.sessionId).emit("webrtc-signaling", data);
    });

    socket.on("disconnect", () => {
        const { sessionId, userId, isHost } = socket.data || {};
        console.log(`Disconnect: socket=${socket.id}, session=${sessionId}, user=${userId}, isHost=${isHost}`);

        if (sessionId && userId && !isHost) {
            // Wait 30 seconds before removing the participant.
            // If they reconnect (e.g. returning from background), the timer is cancelled.
            const timer = setTimeout(() => {
                disconnectTimers.delete(userId);
                try {
                    const db = readDB();
                    const session = db.sessions.find(s => s.sessionId === sessionId);
                    if (session) {
                        const before = session.participants.length;
                        session.participants = session.participants.filter(p => p.userId !== userId);
                        if (session.participants.length !== before) {
                            writeDB(db);
                            console.log(`Grace period expired: removed ${userId} from ${sessionId}`);
                            io.to(sessionId).emit("participant-left", { userId });
                        }
                    }
                } catch (err) {
                    console.error("Disconnect cleanup error:", err.message);
                }
            }, 30000); // 30-second grace period

            disconnectTimers.set(userId, timer);
            console.log(`Disconnect grace period started for ${userId} (30s)`);
        }
    });
});


// ─── SIGNUP ──────────────────────────────────────────────────────────────────
app.post("/signup", async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const db = readDB();
        const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existing) {
            return res.status(400).json({ error: "Email already in use" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const newUser = {
            _id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            email: email.toLowerCase(),
            phone: phone || "",
            password: hashed,
            role: role || "participant",
            createdAt: new Date().toISOString()
        };
        db.users.push(newUser);
        writeDB(db);

        console.log(`User created: ${email}`);
        return res.json({ message: "User created", userId: newUser._id });
    } catch (err) {
        console.error("Signup error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const db = readDB();
        const user = db.users.find(u => u.email === email.toLowerCase());
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Wrong password" });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
        console.log(`User login successful: ${email}`);

        return res.json({
            token,
            user: {
                id: user._id,
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
app.put("/users/profile", async (req, res) => {
    try {
        const { id, name, phone, role, email: bodyEmail } = req.body;
        if (!id) return res.status(400).json({ error: "User ID is required" });

        const db = readDB();
        // Try multiple lookup strategies to handle different ID formats
        let user = db.users.find(u => u._id === id || u.id === id);

        // Fallback: if user not found by ID, try by email (handles old deployments)
        if (!user && bodyEmail) {
            user = db.users.find(u => u.email === bodyEmail.toLowerCase());
        }

        if (!user) {
            console.log(`Profile update failed: id=${id}, email=${bodyEmail}. DB has ${db.users.length} users.`);
            return res.status(404).json({ error: "User not found. Please log out and log in again." });
        }

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (role) user.role = role;
        writeDB(db);

        return res.json({
            message: "Profile updated",
            user: {
                id: user._id,
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SESSION CREATE ───────────────────────────────────────────────────────────
app.post("/sessions/create", async (req, res) => {
    try {
        const { sessionId, hostId, sessionCode } = req.body;
        const db = readDB();

        let session = db.sessions.find(s => s.sessionId === sessionId);
        if (!session) {
            session = {
                sessionId,
                sessionCode: sessionCode || "",
                hostId: hostId ? String(hostId) : "anonymous",
                participants: [],
                createdAt: new Date().toISOString()
            };
            db.sessions.push(session);
            writeDB(db);
        }

        res.json({ message: "Session indexed", session });
    } catch (err) {
        console.error("Session Create Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── LOOKUP SESSION ──────────────────────────────────────────────────────────
app.get("/sessions/lookup/:code", async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) return res.status(400).json({ error: "Code required" });

        const db = readDB();
        // Case-insensitive find
        const session = db.sessions.find(s => s.sessionCode && s.sessionCode.toUpperCase() === code.toUpperCase());

        if (!session) {
            console.log(`Session lookup failed for code: ${code}`);
            return res.status(404).json({ error: "Session not found" });
        }

        res.json({
            sessionId: session.sessionId,
            sessionCode: session.sessionCode
        });
    } catch (err) {
        console.error("Lookup Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── JOIN SESSION (REST) ──────────────────────────────────────────────────────
app.post("/sessions/join", async (req, res) => {
    try {
        const { sessionId, name, phone, email, userId } = req.body;
        if (!sessionId) return res.status(400).json({ error: "Missing sessionId", received: req.body });
        if (!name) return res.status(400).json({ error: "Missing name", received: req.body });

        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === sessionId);
        if (!session) {
            console.log(`Join Failed: Session ${sessionId} not found in db.json`);
            return res.status(404).json({ error: "Session not found" });
        }

        console.log(`Joining participant ${name} to session ${sessionId}`);

        // Check if participant already exists in this session
        const existing = session.participants.find(p =>
            (email && p.email === email) || (userId && p.userId === userId)
        );

        if (!existing) {
            const newParticipant = {
                id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                userId: userId || null,
                name,
                phone: phone || "",
                email: email || "",
                isConnected: 1,
                hasMicPermission: 0,
                isMuted: 0,
                isSpeaking: 0,
                handRaised: 0,
                joinedAt: new Date().toISOString()
            };
            session.participants.push(newParticipant);
            writeDB(db);
            console.log(`REST Join: Added ${name} to ${sessionId}`);
        }

        res.json({ message: "Joined successfully", sessionId: session.sessionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET PARTICIPANTS ─────────────────────────────────────────────────────────
app.get("/sessions/:sessionId/participants", async (req, res) => {
    try {
        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === req.params.sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });
        // Filter out the host (they join by userId === sessionId or name === 'Host')
        const participants = (session.participants || []).filter(p =>
            p.userId !== session.sessionId && p.name !== 'Host'
        );
        res.json({ participants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── RAISE HAND ───────────────────────────────────────────────────────────────
app.post("/sessions/:sessionId/hand-raise", async (req, res) => {
    try {
        const { participantId, name } = req.body;
        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === req.params.sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        const participant = session.participants.find(p => p.id === participantId || p.name === name);
        if (participant) {
            participant.handRaised = 1;
            participant.handRaisedAt = new Date().toISOString();
            writeDB(db);
        }

        // Broadcast via socket
        io.to(req.params.sessionId).emit("hand-raise", { participantId, name });
        res.json({ message: "Hand raised" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── LOWER HAND ───────────────────────────────────────────────────────────────
app.post("/sessions/:sessionId/hand-lower", async (req, res) => {
    try {
        const { participantId, name } = req.body;
        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === req.params.sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        const participant = session.participants.find(p => p.id === participantId || p.name === name);
        if (participant) {
            participant.handRaised = 0;
            participant.handRaisedAt = null;
            writeDB(db);
        }

        io.to(req.params.sessionId).emit("hand-lower", { participantId, name });
        res.json({ message: "Hand lowered" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── UPDATE PARTICIPANT STATE ────────────────────────────────────────────────
app.post("/sessions/:sessionId/participants/:participantId/update", async (req, res) => {
    try {
        const { sessionId, participantId } = req.params;
        const updates = req.body; // e.g., { hasMicPermission: 1, isMuted: 0 }

        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        const participant = session.participants.find(p => p.id === participantId);
        if (!participant) return res.status(404).json({ error: "Participant not found" });

        // Apply updates
        Object.keys(updates).forEach(key => {
            participant[key] = updates[key];
        });

        writeDB(db);

        // Broadcast the update to all clients in the session
        io.to(sessionId).emit("participant-updated", { participantId, updates });

        res.json({ message: "Participant updated", participant });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/sessions/:sessionId/participants/:participantId/remove", async (req, res) => {
    try {
        const { sessionId, participantId } = req.params;
        const db = readDB();
        const session = db.sessions.find(s => s.sessionId === sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.participants = session.participants.filter(p => p.id !== participantId);
        writeDB(db);

        io.to(sessionId).emit("participant-removed", { participantId });
        res.json({ message: "Participant removed" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
// Bind to 0.0.0.0 to ensure it accepts connections from the local network (LAN)
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT} — using file-based storage (db.json)`));
