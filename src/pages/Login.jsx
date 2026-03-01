import { useState } from "react";
import axios from "axios";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setError("");
        setLoading(true);
        try {
            const res = await axios.post("http://localhost:5001/login", { email, password });
            localStorage.setItem("token", res.data.token);
            localStorage.setItem("user", JSON.stringify(res.data.user));
            window.location.href = "/";
        } catch (err) {
            setError(err.response?.data?.error || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", background: "linear-gradient(-45deg,#F4F6F9,#EFF6FF)"
        }}>
            <div style={{
                background: "white", padding: "40px", borderRadius: "20px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.08)", width: "100%", maxWidth: "380px",
                display: "flex", flexDirection: "column", gap: "16px"
            }}>
                <h2 style={{ margin: 0, fontWeight: 900, fontSize: "28px" }}>Welcome back</h2>
                <p style={{ margin: 0, color: "#6b7280" }}>Sign in to your account</p>

                {error && (
                    <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: "10px", fontSize: "14px" }}>
                        {error}
                    </div>
                )}

                <input
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ padding: "12px 16px", borderRadius: "10px", border: "2px solid #E5E7EB", fontSize: "15px", outline: "none" }}
                />
                <input
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    style={{ padding: "12px 16px", borderRadius: "10px", border: "2px solid #E5E7EB", fontSize: "15px", outline: "none" }}
                />

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    style={{
                        background: "#10B981", color: "white", border: "none",
                        padding: "14px", borderRadius: "12px", fontWeight: 800,
                        fontSize: "15px", cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.7 : 1, transition: "0.2s"
                    }}
                >
                    {loading ? "Signing in..." : "Login"}
                </button>

                <p style={{ textAlign: "center", color: "#6b7280", margin: 0, fontSize: "14px" }}>
                    Don't have an account?{" "}
                    <a href="/signup" style={{ color: "#10B981", fontWeight: 700 }}>Sign up</a>
                </p>
            </div>
        </div>
    );
}
