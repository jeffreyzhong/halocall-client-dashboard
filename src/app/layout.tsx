import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { DM_Sans, Nunito } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import AppShell from '@/components/AppShell'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HaloCall Dashboard',
  description: 'AI Voice Agent Dashboard - Monitor and manage your voice agents',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${dmSans.variable} ${nunito.variable} antialiased font-sans`}>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
