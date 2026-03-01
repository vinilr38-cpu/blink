import { Settings2 } from 'lucide-react'

export function Settings() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-12 opacity-60">
            <Settings2 className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-black">Settings</h2>
            <p className="text-muted-foreground">App configuration and preferences will appear here.</p>
        </div>
    )
}
