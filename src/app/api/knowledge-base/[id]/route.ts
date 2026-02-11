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

function getStoragePath(clerkOrganizationId: string, kbId: string, title: string): string {
  const slug = slugify(title) || 'untitled'
  return `${clerkOrganizationId}/${kbId}-${slug}.md`
}

// GET /api/knowledge-base/[id] - Fetch a single knowledge base with its content
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    const kb = await prisma.knowledge_base.findFirst({
      where: {
        id: BigInt(id),
        clerk_organization_id: user.clerk_organization_id,
      },
    })

    if (!kb) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
    }

    // Download markdown content from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(kb.supabase_storage_path)

    if (downloadError) {
      console.error('[knowledge-base] Error downloading from Supabase:', downloadError)
      return NextResponse.json({ error: 'Failed to retrieve knowledge base content' }, { status: 500 })
    }

    const content = await fileData.text()

    return NextResponse.json({
      id: kb.id.toString(),
      title: kb.title,
      content,
      agentIds: kb.agent_ids,
      sourceUrl: kb.source_url,
      elevenLabsDocumentId: kb.elevenlabs_document_id,
      updatedAt: kb.updated_at,
    })
  } catch (error) {
    console.error('[knowledge-base] Error fetching knowledge base:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/knowledge-base/[id] - Update a knowledge base
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const { clerk_organization_id } = user

    const existingKb = await prisma.knowledge_base.findFirst({
      where: {
        id: BigInt(id),
        clerk_organization_id,
      },
    })

    if (!existingKb) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
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

    // Check for agent conflicts: each agent can only belong to one KB
    if (agentIds.length > 0) {
      const otherKbs = await prisma.knowledge_base.findMany({
        where: {
          clerk_organization_id,
          id: { not: BigInt(id) },
        },
        select: { id: true, title: true, agent_ids: true },
      })

      const conflicts: { agentId: string; kbTitle: string }[] = []
      for (const kb of otherKbs) {
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

    const storagePath = getStoragePath(clerk_organization_id, id, title)
    const oldStoragePath = existingKb.supabase_storage_path

    console.log('[knowledge-base] Updating KB:', id, 'title:', title)

    // 1. Upload markdown to Supabase Storage
    const markdownBuffer = Buffer.from(content, 'utf-8')

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, markdownBuffer, {
        upsert: true,
        contentType: 'text/markdown',
      })

    if (uploadError) {
      console.error('[knowledge-base] Error uploading to Supabase:', uploadError)
      return NextResponse.json({ error: 'Failed to save knowledge base content' }, { status: 500 })
    }

    // Clean up old file if the storage path changed (e.g. title was renamed)
    if (oldStoragePath && oldStoragePath !== storagePath) {
      try {
        await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([oldStoragePath])
        console.log('[knowledge-base] Removed old storage file:', oldStoragePath)
      } catch (err) {
        console.error('[knowledge-base] Error removing old storage file:', err)
        // Non-fatal: old file is orphaned but new file is already saved
      }
    }

    // 2. Handle ElevenLabs sync
    const oldDocumentId = existingKb.elevenlabs_document_id
    const oldAgentIds = existingKb.agent_ids || []
    let newDocumentId: string | null = null

    if (agentIds.length > 0) {
      try {
        const mdBlob = new Blob([content], { type: 'text/markdown' })
        const mdFile = new File([mdBlob], `${title.trim()}.md`, { type: 'text/markdown' })
        const doc = await elevenlabs.conversationalAi.knowledgeBase.documents.createFromFile({
          file: mdFile,
          name: title.trim(),
        })
        newDocumentId = doc.id
        console.log('[knowledge-base] Created ElevenLabs KB document:', newDocumentId)
      } catch (error) {
        console.error('[knowledge-base] Error creating ElevenLabs KB document:', error)
        return NextResponse.json({ error: 'Failed to sync knowledge base to ElevenLabs' }, { status: 500 })
      }

      // Associate with selected agents
      for (const agentId of agentIds) {
        try {
          await elevenlabs.conversationalAi.agents.update(agentId, {
            conversationConfig: {
              agent: {
                prompt: {
                  knowledgeBase: [
                    { type: 'file' as const, name: title.trim(), id: newDocumentId! },
                  ],
                },
              },
            },
          })
        } catch (error) {
          console.error(`[knowledge-base] Error updating agent ${agentId}:`, error)
        }
      }
    }

    // 3. Remove KB from agents that were previously associated but now aren't
    const removedAgentIds = oldAgentIds.filter((aid: string) => !agentIds.includes(aid))

    for (const agentId of removedAgentIds) {
      try {
        await elevenlabs.conversationalAi.agents.update(agentId, {
          conversationConfig: {
            agent: {
              prompt: {
                knowledgeBase: [],
              },
            },
          },
        })
        console.log('[knowledge-base] Removed KB from agent:', agentId)
      } catch (error) {
        console.error(`[knowledge-base] Error removing KB from agent ${agentId}:`, error)
      }
    }

    // 4. Delete old ElevenLabs document
    if (oldDocumentId && newDocumentId && oldDocumentId !== newDocumentId) {
      try {
        await elevenlabs.conversationalAi.knowledgeBase.documents.delete(oldDocumentId)
        console.log('[knowledge-base] Deleted old ElevenLabs document:', oldDocumentId)
      } catch (error) {
        console.error('[knowledge-base] Error deleting old ElevenLabs document:', error)
      }
    }

    // 5. Update the DB record
    await prisma.knowledge_base.update({
      where: { id: BigInt(id) },
      data: {
        title: title.trim(),
        supabase_storage_path: storagePath,
        elevenlabs_document_id: newDocumentId || existingKb.elevenlabs_document_id,
        source_url: sourceUrl ?? existingKb.source_url,
        agent_ids: agentIds,
        updated_at: new Date(),
      },
    })

    console.log('[knowledge-base] KB updated successfully, id:', id)

    return NextResponse.json({
      success: true,
      documentId: newDocumentId,
    })
  } catch (error) {
    console.error('[knowledge-base] Error updating knowledge base:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
