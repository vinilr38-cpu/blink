import { useState } from "react"
import { auth } from "@/lib/firebase"
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"
import api from "@/lib/api"
import { useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogIn, Mail, Lock, ArrowRight, UserPlus, QrCode } from "lucide-react"
import { toast } from "sonner"
import { motion } from "framer-motion"

export default function Login() {
    const navigate = useNavigate()
    const location = useLocation()
    const redirectPath = new URLSearchParams(location.search).get('redirect') || '/'
    const isFromQR = redirectPath.startsWith('/join/')
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            toast.error("Please fill in all fields")
            return
        }

        setLoading(true)
        try {
            // 1. Sign in with Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase(), password)
            const user = userCredential.user

            // 2. Fetch specific token if needed by the backend or store user info
            // For now, we mimic the existing logic by storing the UID as token or getting a custom token
            localStorage.setItem("token", await user.getIdToken())
            localStorage.setItem("user", JSON.stringify({
                uid: user.uid,
                email: user.email
            }))

            toast.success("Welcome back!")
            window.location.href = redirectPath
        } catch (err: any) {
            console.error("Login error:", err)
            toast.error(err.message || "Login failed")
        } finally {
            setLoading(false)
        }
    }

    const handleForgotPassword = async () => {
        if (!email) {
            toast.error("Please enter your email address first")
            return
        }
        try {
            await sendPasswordResetEmail(auth, email)
            toast.success("Password reset email sent!")
        } catch (err: any) {
            toast.error(err.message || "Failed to send reset email")
        }
    }

    const handleGoogleSignIn = async () => {
        setLoading(true)
        try {
            const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth")
            const provider = new GoogleAuthProvider()
            const result = await signInWithPopup(auth, provider)
            const user = result.user

            localStorage.setItem("token", await user.getIdToken())
            localStorage.setItem("user", JSON.stringify({
                uid: user.uid,
                email: user.email,
                name: user.displayName
            }))

            toast.success("Google Sign-In successful!")
            window.location.href = redirectPath
        } catch (err: any) {
            console.error("Google login error:", err)
            toast.error(err.message || "Google login failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background bg-dot-pattern flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md"
            >
                <Card className="glass-morphism border-none shadow-2xl rounded-3xl overflow-hidden">
                    <div className="h-2 bg-primary w-full" />
                    {isFromQR && (
                        <div className="flex items-center gap-3 px-8 py-4 bg-primary/5 border-b border-primary/10">
                            <QrCode className="h-5 w-5 text-primary shrink-0" />
                            <p className="text-sm font-bold text-primary">
                                Login required to join the session. Sign in below and you'll be redirected automatically.
                            </p>
                        </div>
                    )}
                    <CardHeader className="text-center pt-8">
                        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <LogIn className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle className="text-3xl font-black tracking-tight">Welcome Back</CardTitle>
                        <CardDescription className="text-muted-foreground font-medium">
                            {isFromQR ? 'Sign in to join the session' : 'Sign in to your account to continue'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-8 pb-10">
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="john@example.com"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleLogin(e as any)}
                                    />
                                </div>
                                <div className="flex justify-end pt-1">
                                    <button
                                        id="forgotBtn"
                                        type="button"
                                        onClick={handleForgotPassword}
                                        className="text-xs font-black uppercase tracking-tight text-primary hover:underline underline-offset-4"
                                    >
                                        Forgot Password?
                                    </button>
                                </div>
                            </div>

                            <Button
                                id="loginBtn"
                                type="submit"
                                disabled={loading}
                                className="w-full h-14 rounded-xl text-lg font-black tracking-tight flex items-center justify-center gap-2 mt-4"
                            >
                                {loading ? "Signing In..." : "Login"}
                                <ArrowRight className="h-5 w-5" />
                            </Button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-muted-foreground/20"></span>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-4 text-muted-foreground font-black tracking-widest">Or continue with</span>
                                </div>
                            </div>

                            <Button
                                id="googleBtn"
                                type="button"
                                variant="outline"
                                disabled={loading}
                                onClick={handleGoogleSignIn}
                                className="w-full h-14 rounded-xl text-lg font-black tracking-tight flex items-center justify-center gap-3 border-2 border-primary/10 hover:border-primary transition-all"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Google
                            </Button>

                            <p className="text-center text-sm font-medium text-muted-foreground pt-4">
                                Don't have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => navigate("/signup")}
                                    className="text-primary font-black hover:underline underline-offset-4"
                                >
                                    Sign Up
                                </button>
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
