import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// Simple decryption utility matching the encryption in callback
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!

function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export async function POST() {
  try {
    // 1. Get the current user from Clerk
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look up the user and their organization's merchant
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
      include: {
        organization: {
          include: {
            merchant: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const merchant = user.organization?.merchant

    if (!merchant) {
      return NextResponse.json({ error: 'No Square integration found' }, { status: 404 })
    }

    // 3. Revoke the token with Square API
    const useSquareProduction = process.env.SQUARE_ENVIRONMENT === 'production'
    const squareAppId = useSquareProduction
      ? process.env.SQUARE_PRODUCTION_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID
    const squareAppSecret = useSquareProduction
      ? process.env.SQUARE_PRODUCTION_APPLICATION_SECRET
      : process.env.SQUARE_SANDBOX_APPLICATION_SECRET

    if (!squareAppId || !squareAppSecret) {
      return NextResponse.json({ error: 'Square credentials not configured' }, { status: 500 })
    }

    const baseUrl = useSquareProduction
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com'

    // Decrypt the access token
    let accessToken: string
    try {
      accessToken = decrypt(merchant.square_access_token_encrypted)
    } catch {
      // If decryption fails, just delete the merchant record
      console.error('Failed to decrypt access token, proceeding with deletion')
      accessToken = ''
    }

    // Revoke the token if we have one
    if (accessToken) {
      try {
        const revokeResponse = await fetch(`${baseUrl}/oauth2/revoke`, {
          method: 'POST',
          headers: {
            'Square-Version': '2024-01-18',
            'Content-Type': 'application/json',
            'Authorization': `Client ${squareAppSecret}`,
          },
          body: JSON.stringify({
            client_id: squareAppId,
            access_token: accessToken,
          }),
        })

        if (!revokeResponse.ok) {
          const errorData = await revokeResponse.json()
          console.error('Square revoke failed:', errorData)
          // Continue with deletion even if revoke fails
        }
      } catch (revokeError) {
        console.error('Error revoking Square token:', revokeError)
        // Continue with deletion even if revoke fails
      }
    }

    // 4. Delete the merchant record
    await prisma.merchant.delete({
      where: { id: merchant.id },
    })

    return NextResponse.json({ success: true, message: 'Square integration disconnected' })
  } catch (error) {
    console.error('Error disconnecting Square:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
