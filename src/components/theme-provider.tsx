'use client'

import { ThemeProvider as NextThemes, useTheme } from 'next-themes'
import { useEffect } from 'react'
import { themeBridge } from '@/features/theme-bridge'

/** Exposes the theme setter to non-React code (the command registry). */
function Bridge() {
  const { resolvedTheme, setTheme } = useTheme()
  useEffect(() => {
    themeBridge.current = { resolved: resolvedTheme, set: setTheme }
  }, [resolvedTheme, setTheme])
  return null
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Bridge />
      {children}
    </NextThemes>
  )
}
