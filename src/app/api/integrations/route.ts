import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 1. Get the current user from Clerk
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look up the user and their organization
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
      include: {
        organization: {
          include: {
            merchant: true,
            location: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const merchant = user.organization?.merchant

    // 3. Build integration response
    const integrations = {
      square: merchant ? {
        connected: true,
        merchantId: merchant.merchant_id,
        isSandbox: merchant.is_sandbox,
        isActive: merchant.is_active,
        merchantType: merchant.merchant_type,
        locationsCount: user.organization?.location?.length || 0,
        connectedAt: merchant.created_at,
        updatedAt: merchant.updated_at,
      } : {
        connected: false,
      },
    }

    return NextResponse.json({ integrations })
  } catch (error) {
    console.error('Error fetching integrations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
