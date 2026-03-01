import { Users } from 'lucide-react'

export function Participants() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-12 opacity-60">
            <Users className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-black">Participants</h2>
            <p className="text-muted-foreground">All participants across sessions will appear here.</p>
        </div>
    )
}
