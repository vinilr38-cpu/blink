import { useState } from "react";
import axios from "axios";

export default function Signup() {
    const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSignup = async () => {
        setError("");
        setLoading(true);
        try {
            await axios.post("http://localhost:5001/signup", form);
            window.location.href = "/login";
        } catch (err) {
            setError(err.response?.data?.error || "Signup failed");
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
                <h2 style={{ margin: 0, fontWeight: 900, fontSize: "28px" }}>Create account</h2>
                <p style={{ margin: 0, color: "#6b7280" }}>Join Smart Audio Manager</p>

                {error && (
                    <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: "10px", fontSize: "14px" }}>
                        {error}
                    </div>
                )}

                {[
                    { field: "name", placeholder: "Full Name", type: "text" },
                    { field: "email", placeholder: "Email", type: "email" },
                    { field: "phone", placeholder: "Phone Number", type: "tel" },
                    { field: "password", placeholder: "Password", type: "password" }
                ].map(({ field, placeholder, type }) => (
                    <input
                        key={field}
                        placeholder={placeholder}
                        type={type}
                        value={form[field]}
                        onChange={update(field)}
                        style={{ padding: "12px 16px", borderRadius: "10px", border: "2px solid #E5E7EB", fontSize: "15px", outline: "none" }}
                    />
                ))}

                <button
                    onClick={handleSignup}
                    disabled={loading}
                    style={{
                        background: "#10B981", color: "white", border: "none",
                        padding: "14px", borderRadius: "12px", fontWeight: 800,
                        fontSize: "15px", cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.7 : 1, transition: "0.2s"
                    }}
                >
                    {loading ? "Creating account..." : "Sign Up"}
                </button>

                <p style={{ textAlign: "center", color: "#6b7280", margin: 0, fontSize: "14px" }}>
                    Already have an account?{" "}
                    <a href="/login" style={{ color: "#10B981", fontWeight: 700 }}>Login</a>
                </p>
            </div>
        </div>
    );
}
