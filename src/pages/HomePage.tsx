import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { blink } from '@/lib/blink'
import { Mic, Users, Radio, Headphones } from 'lucide-react'
import { toast } from 'sonner'

export function HomePage() {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)

  const createSession = async () => {
    setIsCreating(true)
    
    try {
      // Generate unique session code
      const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      
      // Create session
      const session = await blink.db.sessions.create({
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        hostId: `host_${Date.now()}`,
        sessionCode,
        isActive: 1
      })

      toast.success('Session created successfully!')
      navigate(`/host/${session.id}`)
    } catch (error) {
      console.error('Failed to create session:', error)
      toast.error('Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
        
        <div className="relative max-w-7xl mx-auto px-4 py-16 lg:py-24">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm font-medium text-primary">
              <Radio className="h-4 w-4" />
              Live Audio Q&A Platform
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground">
              Interactive Audio
              <span className="block text-primary">Session Manager</span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Host live audio Q&A sessions with real-time participant management, 
              WebRTC audio streaming, and seamless control over who can speak.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" onClick={createSession} disabled={isCreating}>
                <Mic className="h-5 w-5 mr-2" />
                {isCreating ? 'Creating Session...' : 'Create Session'}
              </Button>
              <Button size="lg" variant="outline" onClick={() => {
                toast.info('Scan QR code from host to join a session')
              }}>
                <Users className="h-5 w-5 mr-2" />
                Join Session
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Mic className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Real-Time Audio</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                WebRTC-powered low-latency audio streaming from participants to host device
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Participant Control</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Grant or deny mic access, mute anyone instantly, and manage up to 10+ participants
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Radio className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>QR Code Join</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Participants join instantly by scanning QR code with any mobile device
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Headphones className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Hand Raise System</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Participants request to speak by raising hand, host approves before they can talk
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-muted/50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                1
              </div>
              <h3 className="text-xl font-semibold">Host Creates Session</h3>
              <p className="text-muted-foreground">
                Click "Create Session" to generate a unique QR code and session link
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                2
              </div>
              <h3 className="text-xl font-semibold">Participants Join</h3>
              <p className="text-muted-foreground">
                Scan QR code with phone, enter name and phone number to join the session
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                3
              </div>
              <h3 className="text-xl font-semibold">Live Audio Q&A</h3>
              <p className="text-muted-foreground">
                Participants raise hands, host grants permission, audio streams in real-time
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
