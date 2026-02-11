import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'
import { elevenlabs } from '@/lib/elevenlabs'

const STORAGE_BUCKET = 'knowledge-base'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function getStoragePath(clerkOrganizationId: string, kbId: bigint | number, title: string): string {
  const slug = slugify(title) || 'untitled'
  return `${clerkOrganizationId}/${kbId}-${slug}.md`
}

// GET /api/knowledge-base - List all knowledge bases for the user's org
export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const knowledgeBases = await prisma.knowledge_base.findMany({
      where: { clerk_organization_id: user.clerk_organization_id },
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        title: true,
        source_url: true,
        agent_ids: true,
        elevenlabs_document_id: true,
        created_at: true,
        updated_at: true,
      },
    })

    // Serialize BigInt ids to strings
    const serialized = knowledgeBases.map((kb) => ({
      id: kb.id.toString(),
      title: kb.title,
      sourceUrl: kb.source_url,
      agentIds: kb.agent_ids,
      hasElevenLabsDoc: !!kb.elevenlabs_document_id,
      createdAt: kb.created_at,
      updatedAt: kb.updated_at,
    }))

    return NextResponse.json({ knowledgeBases: serialized })
  } catch (error) {
    console.error('[knowledge-base] Error listing knowledge bases:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/knowledge-base - Create a new knowledge base
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
      include: { organization: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { title, content, agentIds, sourceUrl } = body as {
      title: string
      content: string
      agentIds: string[]
      sourceUrl?: string
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'A document name is required' }, { status: 400 })
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (!agentIds || !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'Agent IDs array is required' }, { status: 400 })
    }

    const { clerk_organization_id } = user

    // Check for agent conflicts: each agent can only belong to one KB
    if (agentIds.length > 0) {
      const existingKbs = await prisma.knowledge_base.findMany({
        where: { clerk_organization_id },
        select: { id: true, title: true, agent_ids: true },
      })

      const conflicts: { agentId: string; kbTitle: string }[] = []
      for (const kb of existingKbs) {
        for (const agentId of agentIds) {
          if (kb.agent_ids.includes(agentId)) {
            conflicts.push({ agentId, kbTitle: kb.title })
          }
        }
      }

      if (conflicts.length > 0) {
        const detail = conflicts.map((c) => `"${c.agentId}" is already assigned to "${c.kbTitle}"`).join('; ')
        return NextResponse.json(
          { error: `Agent conflict: ${detail}. Each agent can only have one knowledge base.` },
          { status: 409 }
        )
      }
    }

    console.log('[knowledge-base] Creating KB for org:', clerk_organization_id, 'title:', title)

    // 1. Create the DB record first to get an ID for the storage path
    const kb = await prisma.knowledge_base.create({
      data: {
        clerk_organization_id,
        title: title.trim(),
        supabase_storage_path: '', // placeholder, will update below
        source_url: sourceUrl,
        agent_ids: agentIds,
      },
    })

    const storagePath = getStoragePath(clerk_organization_id, kb.id, title)

    // 2. Upload markdown to Supabase Storage
    const markdownBuffer = Buffer.from(content, 'utf-8')

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, markdownBuffer, {
        upsert: true,
        contentType: 'text/markdown',
      })

    if (uploadError) {
      console.error('[knowledge-base] Error uploading to Supabase:', uploadError)
      // Clean up the DB record
      await prisma.knowledge_base.delete({ where: { id: kb.id } })
      return NextResponse.json({ error: 'Failed to save knowledge base content' }, { status: 500 })
    }

    // 3. Create ElevenLabs KB document if agents are selected
    let elevenLabsDocumentId: string | null = null

    if (agentIds.length > 0) {
      try {
        const mdBlob = new Blob([content], { type: 'text/markdown' })
        const mdFile = new File([mdBlob], `${title.trim()}.md`, { type: 'text/markdown' })
        const doc = await elevenlabs.conversationalAi.knowledgeBase.documents.createFromFile({
          file: mdFile,
          name: title.trim(),
        })
        elevenLabsDocumentId = doc.id
        console.log('[knowledge-base] Created ElevenLabs KB document:', elevenLabsDocumentId)

        // Associate with selected agents
        for (const agentId of agentIds) {
          try {
            await elevenlabs.conversationalAi.agents.update(agentId, {
              conversationConfig: {
                agent: {
                  prompt: {
                    knowledgeBase: [
                      { type: 'file', name: title.trim(), id: elevenLabsDocumentId },
                    ],
                  },
                },
              },
            })
          } catch (err) {
            console.error(`[knowledge-base] Error updating agent ${agentId}:`, err)
          }
        }
      } catch (error) {
        console.error('[knowledge-base] Error creating ElevenLabs KB document:', error)
        // Non-fatal: KB is still saved in Supabase, just not synced to ElevenLabs yet
      }
    }

    // 4. Update the DB record with the storage path and ElevenLabs document ID
    await prisma.knowledge_base.update({
      where: { id: kb.id },
      data: {
        supabase_storage_path: storagePath,
        elevenlabs_document_id: elevenLabsDocumentId,
      },
    })

    console.log('[knowledge-base] KB created successfully, id:', kb.id.toString())

    return NextResponse.json({
      success: true,
      id: kb.id.toString(),
      documentId: elevenLabsDocumentId,
    })
  } catch (error) {
    console.error('[knowledge-base] Error creating knowledge base:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
