import { useState, useEffect } from 'react'
import { Settings2, User, Phone, Mail, Shield, Save, LogOut, ArrowLeftRight, Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import api from '@/lib/api'
import { motion } from 'framer-motion'
import { useTheme } from '@/components/theme-provider'

export function Settings() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ name: '', phone: '', role: '' })
    const { theme, setTheme } = useTheme()

    useEffect(() => {
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
            const parsed = JSON.parse(storedUser)
            setUser(parsed)
            setForm({
                name: parsed.name || '',
                phone: parsed.phone || '',
                role: parsed.role || 'participant'
            })
        }
    }, [])

    const handleSave = async () => {
        if (!user) return
        setLoading(true)
        try {
            const res = await api.put('/users/profile', {
                id: user.id,
                ...form
            })
            const updatedUser = res.data.user
            localStorage.setItem('user', JSON.stringify(updatedUser))
            setUser(updatedUser)
            toast.success('Profile updated successfully!')
            // Force a reload to update sidebar/navigation if role changed
            if (form.role !== user.role) {
                window.location.reload()
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to update profile')
        } finally {
            setLoading(false)
        }
    }

    if (!user) return null

    return (
        <div className="w-full min-h-full p-8 bg-dot-pattern max-w-4xl mx-auto transition-theme pb-20">
            <header className="mb-12">
                <div className="flex items-center gap-4 mb-2">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Settings2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">Account Settings</h1>
                        <p className="text-muted-foreground font-medium">Manage your profile and application preferences</p>
                    </div>
                </div>
            </header>

            <div className="grid gap-8">
                {/* Visual Preference Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className="glass-morphism border-none shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="border-b border-primary/5 bg-primary/5 pb-8">
                            <CardTitle className="flex items-center gap-2">
                                <Sun className="h-5 w-5 text-primary" />
                                Appearance
                            </CardTitle>
                            <CardDescription>
                                Customize the look and feel of your dashboard
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { id: 'light', icon: Sun, label: 'Light' },
                                    { id: 'dark', icon: Moon, label: 'Dark' },
                                    { id: 'system', icon: Monitor, label: 'System' },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id as any)}
                                        className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === t.id
                                            ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/5'
                                            : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                                            }`}
                                    >
                                        <t.icon className={`h-6 w-6 ${theme === t.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="text-xs font-black uppercase tracking-tight">{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="glass-morphism border-none shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="border-b border-primary/5 bg-primary/5 pb-8">
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5 text-primary" />
                                Personal Information
                            </CardTitle>
                            <CardDescription>
                                Update your contact details and how you appear to others
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Full Name</Label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                        <Input
                                            value={form.name}
                                            onChange={e => setForm({ ...form, name: e.target.value })}
                                            className="h-12 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all font-medium"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Phone Number</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                        <Input
                                            value={form.phone}
                                            onChange={e => setForm({ ...form, phone: e.target.value })}
                                            className="h-12 pl-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest ml-1 text-muted-foreground">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        value={user.email}
                                        disabled
                                        className="h-12 pl-12 rounded-xl border-2 border-primary/5 font-medium opacity-50 bg-muted cursor-not-allowed"
                                    />
                                </div>
                                <p className="text-[10px] text-muted-foreground font-bold px-1">Email cannot be changed for security reasons</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="glass-morphism border-none shadow-xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="border-b border-primary/5 bg-primary/5 pb-8">
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-primary" />
                                Role & Permissions
                            </CardTitle>
                            <CardDescription>
                                Switch your account role to access different features
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex gap-4 items-start">
                                <ArrowLeftRight className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-black text-amber-900 dark:text-amber-200 mb-1">Role Switching Information</p>
                                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 leading-relaxed">
                                        Changing your role from **Participant** to **Host** will enable the session creation tools.
                                        If you switch to **Participant**, you will primarily join existing sessions.
                                    </p>
                                </div>
                            </div>

                            <RadioGroup
                                value={form.role}
                                onValueChange={v => setForm({ ...form, role: v })}
                                className="grid md:grid-cols-2 gap-4"
                            >
                                <div>
                                    <RadioGroupItem value="participant" id="participant" className="peer sr-only" />
                                    <Label
                                        htmlFor="participant"
                                        className="flex flex-col items-center justify-between rounded-2xl border-2 border-muted bg-popover p-6 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                                    >
                                        <User className="mb-3 h-8 w-8 text-muted-foreground peer-data-[state=checked]:text-primary" />
                                        <div className="text-center">
                                            <span className="block text-sm font-black uppercase tracking-tight mb-1">Participant</span>
                                            <span className="block text-[10px] text-muted-foreground font-medium">Join and interact in sessions</span>
                                        </div>
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="host" id="host" className="peer sr-only" />
                                    <Label
                                        htmlFor="host"
                                        className="flex flex-col items-center justify-between rounded-2xl border-2 border-muted bg-popover p-6 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                                    >
                                        <Shield className="mb-3 h-8 w-8 text-muted-foreground peer-data-[state=checked]:text-primary" />
                                        <div className="text-center">
                                            <span className="block text-sm font-black uppercase tracking-tight mb-1">Host</span>
                                            <span className="block text-[10px] text-muted-foreground font-medium">Create and manage audio sessions</span>
                                        </div>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </CardContent>
                    </Card>
                </motion.div>

                <div className="flex items-center justify-between pt-4">
                    <Button
                        variant="outline"
                        className="h-12 px-8 rounded-xl border-2 border-destructive/10 text-destructive font-black hover:bg-destructive/5"
                        onClick={() => {
                            localStorage.clear()
                            window.location.href = '/login'
                        }}
                    >
                        <LogOut className="mr-2 h-4 w-4" /> Sign Out
                    </Button>

                    <Button
                        disabled={loading}
                        className="h-12 px-12 rounded-xl font-black text-lg shadow-xl shadow-primary/20"
                        onClick={handleSave}
                    >
                        {loading ? 'Saving Changes...' : (
                            <>
                                <Save className="mr-2 h-5 w-5" /> Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
