import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// Simple encryption utilities for storing tokens
// In production, consider using a dedicated secrets manager
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'))
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

interface SquareTokenResponse {
  access_token: string
  token_type: string
  expires_at: string
  merchant_id: string
  refresh_token: string
  short_lived: boolean
}

interface SquareErrorResponse {
  message?: string
  type?: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const appUrl = process.env.APP_PRODUCTION_URL!

    // 1. Handle error responses from Square
    if (error) {
      console.error('Square OAuth error:', error, errorDescription)
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', error)
      redirectUrl.searchParams.set('square_error_description', errorDescription || 'Authorization was denied')
      return NextResponse.redirect(redirectUrl.toString())
    }

    // 2. Validate required parameters
    if (!code || !state) {
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', 'missing_params')
      redirectUrl.searchParams.set('square_error_description', 'Missing authorization code or state')
      return NextResponse.redirect(redirectUrl.toString())
    }

    // 3. Decode and validate state
    let stateData: { csrf: string; orgId: string; userId: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', 'invalid_state')
      redirectUrl.searchParams.set('square_error_description', 'Invalid state parameter')
      return NextResponse.redirect(redirectUrl.toString())
    }

    const { orgId, userId } = stateData

    // 4. Verify the user exists and belongs to the organization
    const user = await prisma.user.findFirst({
      where: {
        clerk_user_id: userId,
        clerk_organization_id: orgId,
      },
    })

    if (!user) {
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', 'user_not_found')
      redirectUrl.searchParams.set('square_error_description', 'User not found or session expired')
      return NextResponse.redirect(redirectUrl.toString())
    }

    // 5. Exchange authorization code for tokens
    // Use SQUARE_ENVIRONMENT to control sandbox vs production (independent of NODE_ENV)
    const useSquareProduction = process.env.SQUARE_ENVIRONMENT === 'production'
    const squareAppId = useSquareProduction
      ? process.env.SQUARE_PRODUCTION_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID
    const squareAppSecret = useSquareProduction
      ? process.env.SQUARE_PRODUCTION_ACCESS_TOKEN
      : process.env.SQUARE_SANDBOX_ACCESS_TOKEN

    if (!squareAppId || !squareAppSecret) {
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', 'config_error')
      redirectUrl.searchParams.set('square_error_description', 'Square credentials not configured')
      return NextResponse.redirect(redirectUrl.toString())
    }

    const baseUrl = useSquareProduction
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com'

    // For code flow, redirect_uri is not needed in token exchange
    const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: squareAppId,
        client_secret: squareAppSecret,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData: SquareErrorResponse = await tokenResponse.json()
      console.error('Square token exchange failed:', errorData)
      const redirectUrl = new URL(appUrl)
      redirectUrl.searchParams.set('square_error', 'token_exchange_failed')
      redirectUrl.searchParams.set('square_error_description', errorData.message || 'Failed to obtain access token')
      return NextResponse.redirect(redirectUrl.toString())
    }

    const tokenData: SquareTokenResponse = await tokenResponse.json()

    // 6. Encrypt the tokens
    const encryptedAccessToken = encrypt(tokenData.access_token)
    const encryptedRefreshToken = encrypt(tokenData.refresh_token)

    // 7. Check if merchant already exists for this organization
    const existingMerchant = await prisma.merchant.findUnique({
      where: { clerk_organization_id: orgId },
    })

    if (existingMerchant) {
      // Update existing merchant
      await prisma.merchant.update({
        where: { clerk_organization_id: orgId },
        data: {
          merchant_id: tokenData.merchant_id,
          square_access_token_encrypted: encryptedAccessToken,
          square_refresh_token_encrypted: encryptedRefreshToken,
          is_sandbox: !useSquareProduction,
          is_active: true,
          merchant_type: 'SQUARE',
          updated_at: new Date(),
        },
      })
    } else {
      // Create new merchant record
      await prisma.merchant.create({
        data: {
          merchant_id: tokenData.merchant_id,
          clerk_organization_id: orgId,
          square_access_token_encrypted: encryptedAccessToken,
          square_refresh_token_encrypted: encryptedRefreshToken,
          is_sandbox: !useSquareProduction,
          is_active: true,
          merchant_type: 'SQUARE',
        },
      })
    }

    // 8. Redirect back to the app with success
    const redirectUrl = new URL(appUrl)
    redirectUrl.searchParams.set('square_connected', 'true')
    return NextResponse.redirect(redirectUrl.toString())

  } catch (error) {
    console.error('Error in Square OAuth callback:', error)
    const appUrl = process.env.APP_PRODUCTION_URL || 'http://localhost:3000'
    const redirectUrl = new URL(appUrl)
    redirectUrl.searchParams.set('square_error', 'internal_error')
    redirectUrl.searchParams.set('square_error_description', 'An unexpected error occurred')
    return NextResponse.redirect(redirectUrl.toString())
  }
}
