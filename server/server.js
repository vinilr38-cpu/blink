import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import User from "./models/User.js";
import Session from "./models/Session.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT"]
    }
});

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Connect to MongoDB
if (!process.env.MONGO_URL) {
    console.error("FATAL: MONGO_URL not found in environment variables.");
}
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("MongoDB connected successfully"))
    .catch(err => {
        console.error("MongoDB connection error:", err);
        process.exit(1); // Exit if DB connection fails in production
    });

const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

// ❤️ Health check
app.get("/", (req, res) => res.json({ status: "Server running" }));

// 🌐 SOCKET.IO LOGIC
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-session", async (data) => {
        try {
            const session = await Session.findOne({ sessionId: data.sessionId });
            if (!session) return;

            session.participants.push({
                userId: data.userId,
                name: data.name,
                phone: data.phone,
                email: data.email,
                joinedAt: new Date()
            });

            await session.save();
            console.log(`User ${data.name} joined session ${data.sessionId}`);

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

// 🔐 SIGNUP
app.post("/signup", async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        if (!email || !password || !name) return res.status(400).json({ error: "Missing required fields" });
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(400).json({ error: "Email already in use" });

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            phone,
            password: hashed,
            role: role || "participant"
        });

        return res.json({ message: "User created", userId: user._id });
    } catch (err) {
        console.error("Signup error:", err);
        return res.status(500).json({ error: err.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Missing fields" });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Wrong password" });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET
        );

        console.log(`User login successful: ${email}`);
        return res.json({
            token,
            user: {
                id: user._id,
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

// 👤 UPDATE PROFILE
app.put("/users/profile", async (req, res) => {
    try {
        const { id, name, phone, role } = req.body;
        if (!id) return res.status(400).json({ error: "User ID is required" });
        const user = await User.findByIdAndUpdate(
            id,
            { name, phone, role },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            message: "Profile updated",
            user: {
                id: user._id,
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

// 🎙️ SESSION CREATE
app.post("/sessions/create", async (req, res) => {
    try {
        const { sessionId, hostId } = req.body;
        let session = await Session.findOne({ sessionId });
        if (!session) {
            session = await Session.create({
                sessionId,
                hostId: hostId ? String(hostId) : "anonymous",
                participants: []
            });
        }
        res.json({ message: "Session indexed", session });
    } catch (err) {
        console.error("Session Create Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 📋 GET ALL PARTICIPANTS (for Participants page)
app.get("/sessions/:sessionId/participants", async (req, res) => {
    try {
        const session = await Session.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ error: "Session not found" });
        res.json({ participants: session.participants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
