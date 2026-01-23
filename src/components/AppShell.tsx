'use client';

import { SignedIn, SignedOut } from '@clerk/nextjs';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOut>
        {children}
      </SignedOut>
      <SignedIn>
        <div className="flex min-h-screen bg-[var(--bg-primary)] transition-colors duration-200">
          <Sidebar />
          <main className="flex-1 ml-56">
            {children}
          </main>
        </div>
      </SignedIn>
    </>
  );
}
