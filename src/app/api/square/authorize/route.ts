import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// Square OAuth scopes needed for the application
const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ITEMS_READ',
  'ORDERS_READ',
  'PAYMENTS_READ',
].join(' ')

export async function GET() {
  try {
    // 1. Get the current user from Clerk
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look them up in the user table
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Check required environment variables
    const isProduction = process.env.NODE_ENV === 'production'
    const squareAppId = isProduction
      ? process.env.SQUARE_PRODUCTION_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (!squareAppId) {
      return NextResponse.json({ error: 'Square Application ID not configured' }, { status: 500 })
    }

    // 4. Generate a CSRF token (state) and store it temporarily
    // We'll include the org ID in the state for verification
    const csrfToken = crypto.randomBytes(32).toString('hex')
    const state = Buffer.from(JSON.stringify({
      csrf: csrfToken,
      orgId: user.clerk_organization_id,
      userId: user.clerk_user_id,
    })).toString('base64url')

    // 5. Build the Square authorization URL
    const baseUrl = isProduction
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com'

    const redirectUri = `${appUrl}/api/square/callback`

    const authUrl = new URL(`${baseUrl}/oauth2/authorize`)
    authUrl.searchParams.set('client_id', squareAppId)
    authUrl.searchParams.set('scope', SQUARE_SCOPES)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('redirect_uri', redirectUri)

    // 6. Return the authorization URL
    return NextResponse.json({ 
      authUrl: authUrl.toString(),
    })
  } catch (error) {
    console.error('Error generating Square authorization URL:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
