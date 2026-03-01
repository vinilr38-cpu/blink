import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: 'live-audio-session-manager-5marpymc',
  authRequired: false,
  auth: { mode: 'managed' }
})
