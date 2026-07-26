'use client'

import * as React from 'react'

type Theme = 'dark' | 'light'

type ThemeContextValue = {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('dark')

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      root.classList.remove('dark', 'light')
      root.classList.add(t)
    }
  }, [])

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  React.useEffect(() => {
    // Default to dark mode
    const root = document.documentElement
    if (!root.classList.contains('dark') && !root.classList.contains('light')) {
      root.classList.add('dark')
    }
  }, [])

  const value = React.useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    // Safe fallback so components never crash if used outside provider
    return {
      theme: 'dark' as Theme,
      toggleTheme: () => {},
      setTheme: () => {},
    }
  }
  return ctx
}
