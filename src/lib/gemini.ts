import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GOOGLE_GEMINI_API_KEY

if (!apiKey) {
  throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
}

export const gemini = new GoogleGenAI({ apiKey })
