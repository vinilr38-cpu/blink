import { useState } from "react"
import { auth, db } from "@/lib/firebase"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { useNavigate } from "react-router-dom"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { UserPlus, Mail, Phone, Lock, ArrowRight, UserCircle, Briefcase } from "lucide-react"
import { toast } from "sonner"
import { motion } from "framer-motion"

export default function Signup() {
    const navigate = useNavigate()
    const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "participant" })
    const [loading, setLoading] = useState(false)

    const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name || !form.email || !form.phone || !form.password) {
            toast.error("Please fill in all fields")
            return
        }

        setLoading(true)
        try {
            // 1. Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password)
            const user = userCredential.user

            // 2. Store metadata in Firestore
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: form.name,
                email: form.email,
                phone: form.phone,
                role: form.role,
                createdAt: new Date().toISOString()
            })

            // 3. Optional: Still notify the backend if needed for other logic
            // await api.post("/signup", { ...form, firebaseUid: user.uid })

            toast.success("Account created successfully!")
            navigate("/login")
        } catch (err: any) {
            console.error("Signup error:", err)
            if (err.code === "auth/email-already-in-use") {
                toast.error("This email is already registered. Please login instead.")
            } else {
                toast.error(err.message || "Signup failed")
            }
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
                    <CardHeader className="text-center pt-8">
                        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <UserPlus className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle className="text-3xl font-black tracking-tight">Create Account</CardTitle>
                        <CardDescription className="text-muted-foreground font-medium">
                            Join the Smart Audio Manager community
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-8 pb-10">
                        <form onSubmit={handleSignup} className="space-y-5">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Full Name</Label>
                                <div className="relative">
                                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        placeholder="John Doe"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={form.name}
                                        onChange={e => update("name", e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="john@example.com"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={form.email}
                                        onChange={e => update("email", e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Phone Number</Label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        type="tel"
                                        placeholder="+91 00000 00000"
                                        className="h-14 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all text-lg font-medium"
                                        value={form.phone}
                                        onChange={e => update("phone", e.target.value)}
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
                                        value={form.password}
                                        onChange={e => update("password", e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 pt-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Select Role</Label>
                                <RadioGroup
                                    defaultValue="participant"
                                    className="grid grid-cols-2 gap-4"
                                    onValueChange={v => update("role", v)}
                                >
                                    <div>
                                        <RadioGroupItem value="participant" id="participant" className="peer sr-only" />
                                        <Label
                                            htmlFor="participant"
                                            className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                                        >
                                            <UserCircle className="mb-2 h-6 w-6" />
                                            <span className="text-xs font-black uppercase tracking-tight">Participant</span>
                                        </Label>
                                    </div>
                                    <div>
                                        <RadioGroupItem value="host" id="host" className="peer sr-only" />
                                        <Label
                                            htmlFor="host"
                                            className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                                        >
                                            <Briefcase className="mb-2 h-6 w-6" />
                                            <span className="text-xs font-black uppercase tracking-tight">Host</span>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <Button
                                id="signupBtn"
                                type="submit"
                                disabled={loading}
                                className="w-full h-14 rounded-xl text-lg font-black tracking-tight flex items-center justify-center gap-2 mt-4"
                            >
                                {loading ? "Creating Account..." : "Sign Up"}
                                <ArrowRight className="h-5 w-5" />
                            </Button>

                            <p className="text-center text-sm font-medium text-muted-foreground pt-4">
                                Already have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => navigate("/login")}
                                    className="text-primary font-black hover:underline underline-offset-4"
                                >
                                    Login
                                </button>
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
