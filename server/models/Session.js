import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, unique: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        phone: String,
        email: String,
        joinedAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model("Session", sessionSchema);
