import { db } from '@/lib/firebase'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'

export function Participants() {
    const [participants, setParticipants] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const participantsRef = collection(db, 'participants')
        const q = query(participantsRef, orderBy('joinedAt', 'desc'))
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                joinedAt: doc.data().joinedAt?.toDate?.() || new Date()
            }))
            setParticipants(data)
            setLoading(false)
        }, (error) => {
            console.error('Firestore participants sync error:', error)
            toast.error('Failed to sync participants')
            setLoading(false)
        })

        return () => unsubscribe()
    }, [])

    const filtered = participants.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.email?.toLowerCase().includes(search.toLowerCase()) ||
        p.phone?.includes(search) ||
        p.sessionId?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="w-full min-h-full p-4 sm:p-8 bg-dot-pattern max-w-7xl mx-auto transition-theme pb-20">
            <header className="mb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner">
                            <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">Active Participants</h1>
                            <p className="text-muted-foreground font-medium">Directory of users across all active audio sessions</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group flex-1 md:w-80">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                            <Input
                                placeholder="Search by name, email, or session..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-11 h-12 rounded-xl border-2 border-primary/5 focus:border-primary transition-all font-medium"
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-xl border-2 border-primary/5 hover:border-primary/20"
                            onClick={fetchParticipants}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
            </header>

            {loading && participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 opacity-40">
                    <RefreshCw className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="font-bold text-lg">Loading participants list...</p>
                </div>
            ) : filtered.length === 0 ? (
                <Card className="glass-morphism border-none shadow-xl rounded-[2rem] overflow-hidden">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
                            <Search className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-black mb-2">No Participants Found</h3>
                        <p className="text-muted-foreground max-w-xs mx-auto">
                            {search ? `We couldn't find any results matching "${search}"` : "There are currently no active users in any audio session."}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.map((participant, index) => (
                        <motion.div
                            key={participant.id || index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <Card className="glass-morphism border-none shadow-xl rounded-[2rem] overflow-hidden group hover:bg-primary/[0.02] transition-colors border-2 border-transparent hover:border-primary/10">
                                <CardHeader className="pb-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl shadow-inner">
                                                {participant.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg font-black leading-tight">{participant.name}</CardTitle>
                                                <Badge variant="secondary" className="mt-1 text-[10px] font-black uppercase tracking-wider bg-primary/5 text-primary/70">
                                                    ID: {participant.userId || 'Guest'}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className={`h-3 w-3 rounded-full ${participant.isConnected ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-muted'}`} />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-0">
                                    <div className="grid gap-3">
                                        <div className="flex items-center gap-3 text-sm font-medium p-3 rounded-xl bg-card/50 border border-primary/5">
                                            <Mail className="h-4 w-4 text-primary/60 shrink-0" />
                                            <span className="truncate">{participant.email || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm font-medium p-3 rounded-xl bg-card/50 border border-primary/5">
                                            <Phone className="h-4 w-4 text-primary/60 shrink-0" />
                                            <span>{participant.phone || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm font-medium p-3 rounded-xl bg-primary/5 border border-primary/10">
                                            <Hash className="h-4 w-4 text-primary shrink-0" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Session Code</span>
                                                <span className="font-black tracking-tight">{participant.sessionId?.split('_').pop() || 'ACTIVE'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 pt-2">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3" />
                                            Joined {new Date(participant.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        {participant.handRaised === 1 && (
                                            <span className="flex items-center gap-1 text-primary animate-bounce">
                                                ✋ Hand Raised
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    )
}
