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
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

const JWT_SECRET = process.env.JWT_SECRET || "blink_secret_key_2024";

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "Server running (file-based storage)" }));

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-session", (data) => {
        try {
            const db = readDB();
            const session = db.sessions.find(s => s.sessionId === data.sessionId);
            if (session) {
                session.participants.push({
                    userId: data.userId || null,
                    name: data.name,
                    phone: data.phone,
                    email: data.email,
                    joinedAt: new Date().toISOString()
                });
                writeDB(db);
                console.log(`User ${data.name} joined session ${data.sessionId}`);
            }
            socket.join(data.sessionId);
            io.to(data.sessionId).emit("participant-joined", {
                name: data.name,
                userId: data.userId
            });
        } catch (err) {
            console.error("Socket error:", err.message);
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
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
        const { id, name, phone, role } = req.body;
        if (!id) return res.status(400).json({ error: "User ID is required" });

        const db = readDB();
        const user = db.users.find(u => u._id === id);
        if (!user) return res.status(404).json({ error: "User not found" });

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
        const db = readDB();
        const session = db.sessions.find(s => s.sessionCode === req.params.code.toUpperCase());
        if (!session) return res.status(404).json({ error: "Session not found" });
        res.json({ sessionId: session.sessionId });
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
        res.json({ participants: session.participants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} — using file-based storage (db.json)`));
