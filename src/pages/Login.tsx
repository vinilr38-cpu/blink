import { useState } from "react"
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
            const res = await api.post("/login", { email: email.toLowerCase(), password })
            localStorage.setItem("token", res.data.token)
            localStorage.setItem("user", JSON.stringify(res.data.user))
            toast.success("Welcome back!")
            window.location.href = redirectPath
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Login failed")
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
                                        type="password"
                                        placeholder="••••••••"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleLogin(e as any)}
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-14 rounded-xl text-lg font-black tracking-tight flex items-center justify-center gap-2 mt-4"
                            >
                                {loading ? "Signing In..." : "Login"}
                                <ArrowRight className="h-5 w-5" />
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
