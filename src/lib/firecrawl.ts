import Firecrawl from '@mendable/firecrawl-js'

const apiKey = process.env.FIRECRAWL_API_KEY

if (!apiKey) {
  throw new Error('FIRECRAWL_API_KEY environment variable is not set')
}

export const firecrawl = new Firecrawl({ apiKey })
