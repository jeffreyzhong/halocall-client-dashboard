import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gemini } from '@/lib/gemini'

const SUMMARIZE_PROMPT = `You are an expert business analyst. You have been given the crawled content of a business website (a spa, salon, or similar service business). Your job is to create a comprehensive knowledge base document that an AI voice agent can use to answer phone calls on behalf of this business.

Analyze ALL of the provided website pages and extract every piece of useful information. Organize it into a clear, well-structured markdown document with the following sections (include only sections where you found relevant information):

## Business Overview
Name, description, mission statement, brand identity, what makes them unique.

## Location & Contact Information
Full address, phone number, email, directions, parking info, multiple locations if applicable.

## Hours of Operation
Regular hours for each day of the week, holiday hours, special seasonal hours.

## Services
Complete list of all services offered with descriptions and pricing. Group by category (e.g., Hair Services, Nail Services, Spa Treatments, etc.)

## Products
Any retail products sold, brands carried, product lines.

## Staff & Team
Staff members, their specialties, qualifications, bios.

## Booking & Appointments
How to book, online booking availability, walk-in policy, appointment duration info.

## Policies
Cancellation policy, no-show policy, refund policy, late arrival policy, age restrictions, health requirements.

## Payment
Accepted payment methods, gift cards, membership/package deals, tipping policy.

## Frequently Asked Questions
Common questions and their answers based on the website content.

## Additional Information
Any other relevant details (events, promotions, loyalty programs, accessibility info, COVID protocols, etc.)

IMPORTANT GUIDELINES:
- Write in a factual, informative tone suitable for an AI agent to reference when answering caller questions.
- Include specific details: exact prices, exact hours, exact addresses -- do not be vague.
- If information is not available on the website, do NOT make it up. Simply omit that section.
- Use markdown formatting: ## for sections, ### for subsections, - for bullet lists, **bold** for emphasis.
- Do NOT include any HTML tags.
- Do NOT include any commentary about the document itself -- just the business information.
- Do NOT wrap the output in code fences (no \`\`\`markdown or \`\`\` blocks). Output raw markdown directly.
`

interface CrawledPage {
  markdown: string
  url: string
  title?: string
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verify user exists
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Parse request body
    const body = await request.json()
    const { crawledPages } = body as { crawledPages: CrawledPage[] }

    if (!crawledPages || !Array.isArray(crawledPages) || crawledPages.length === 0) {
      return NextResponse.json({ error: 'Crawled pages data is required' }, { status: 400 })
    }

    console.log('[knowledge-base/summarize] Summarizing', crawledPages.length, 'pages for org:', user.clerk_organization_id)

    // 4. Prepare the content for Gemini
    // Concatenate all pages with source URLs for context, truncate if too long
    const maxCharsPerPage = 10000
    const pageContents = crawledPages.map((page, index) => {
      const truncatedMarkdown = page.markdown.length > maxCharsPerPage
        ? page.markdown.substring(0, maxCharsPerPage) + '\n\n[Content truncated...]'
        : page.markdown

      return `--- PAGE ${index + 1}: ${page.url} ---\n${page.title ? `Title: ${page.title}\n` : ''}${truncatedMarkdown}`
    }).join('\n\n')

    const fullPrompt = `${SUMMARIZE_PROMPT}\n\nHere are the crawled website pages:\n\n${pageContents}`

    // 5. Generate summary using Gemini SDK
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: fullPrompt,
    })

    let content = response.text

    if (!content) {
      return NextResponse.json({ error: 'Failed to generate summary - empty response' }, { status: 500 })
    }

    // Strip markdown code fences that Gemini sometimes wraps around the output
    content = content.replace(/^```(?:markdown)?\s*\n?/, '').replace(/\n?```\s*$/, '')

    console.log('[knowledge-base/summarize] Generated summary, length:', content.length, 'chars')

    return NextResponse.json({ content })
  } catch (error) {
    console.error('[knowledge-base/summarize] Error summarizing content:', error)
    return NextResponse.json({ error: 'Failed to summarize website content' }, { status: 500 })
  }
}
