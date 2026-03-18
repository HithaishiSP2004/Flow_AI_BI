import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FLOW — AI Business Intelligence',
  description: 'Ask your data anything. Get instant charts and insights.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
