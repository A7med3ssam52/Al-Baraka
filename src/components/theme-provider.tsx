import { createContext, useContext, useEffect, useState } from 'react'

export type ThemeId = 'default' | 'dark' | 'emerald' | 'rose' | 'slate'

export interface ThemeOption {
  id: ThemeId
  name: string
  description: string
  swatch: string
}

export const THEMES: ThemeOption[] = [
  { id: 'default', name: 'البركة', description: 'كحلي وذهبي — الهوية الأصلية', swatch: '#0b1f33' },
  { id: 'dark', name: 'الليل', description: 'وضع داكن مريح للعين', swatch: '#0f172a' },
  { id: 'emerald', name: 'النخيل', description: 'أخضر هادئ وطبيعي', swatch: '#047857' },
  { id: 'rose', name: 'الورد', description: 'وردي دافئ وأنيق', swatch: '#be123c' },
  { id: 'slate', name: 'السحاب', description: 'محايد وعصري', swatch: '#4f46e5' },
]

const STORAGE_KEY = 'albaraka-theme'

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === 'undefined') return 'default'
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null
    return stored && THEMES.some((t) => t.id === stored) ? stored : 'default'
  })

  useEffect(() => {
    const root = document.documentElement
    THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`))
    if (theme !== 'default') root.classList.add(`theme-${theme}`)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (id: ThemeId) => setThemeState(id)

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}