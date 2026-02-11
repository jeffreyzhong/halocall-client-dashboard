import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

const apiKey = process.env.ELEVENLABS_API_KEY

if (!apiKey) {
  throw new Error('ELEVENLABS_API_KEY environment variable is not set')
}

export const elevenlabs = new ElevenLabsClient({ apiKey })
