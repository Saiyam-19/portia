'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <NextThemesProvider attribute="class" storageKey="plisto-appearance" defaultTheme="system" enableSystem disableTransitionOnChange forcedTheme={pathname.startsWith('/dashboard') ? undefined : 'light'}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </NextThemesProvider>
  )
}
