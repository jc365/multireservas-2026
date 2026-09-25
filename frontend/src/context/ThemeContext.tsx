import { createContext, useContext, useState, useEffect } from 'react';

// ⚙️ CONFIGURACIÓN CENTRAL DE TEMAS
// Para agregar un nuevo tema: 
// 1. Agrega el nombre aquí
// 2. Agrega la clase CSS correspondiente en index.css
// 3. ¡Listo! El resto se actualiza automáticamente
const THEME_CONFIG = {
  themes: [
    { id: 'light', label: 'Light', cssClass: '' }, // '' = sin clase (default)
    { id: 'dark', label: 'Dark', cssClass: 'dark' },
    { id: 'ocean', label: 'Ocean', cssClass: 'theme-ocean' },
    { id: 'forest', label: 'Forest', cssClass: 'theme-forest' },
    { id: 'sunset', label: 'Sunset', cssClass: 'theme-sunset' },
    { id: 'night', label: 'Night', cssClass: 'theme-night' },
  ] as const,
};

// Tipos inferidos automáticamente
type ThemeId = typeof THEME_CONFIG.themes[number]['id'];
type ThemeConfig = typeof THEME_CONFIG;

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
  themes: ThemeConfig['themes'];
  getThemeLabel: (id: ThemeId) => string;
  getThemeClass: (id: ThemeId) => string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Helpers para acceder a la configuración
const getThemeLabel = (id: ThemeId): string => {
  const theme = THEME_CONFIG.themes.find(t => t.id === id);
  return theme?.label || id;
};

const getThemeClass = (id: ThemeId): string => {
  const theme = THEME_CONFIG.themes.find(t => t.id === id);
  return theme?.cssClass || '';
};

const isValidTheme = (id: string): id is ThemeId => {
  return THEME_CONFIG.themes.some(t => t.id === id);
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem('theme');
    if (stored && isValidTheme(stored)) return stored;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    // Limpiar TODAS las clases CSS posibles
    const allCssClasses = THEME_CONFIG.themes
      .map(t => t.cssClass)
      .filter(css => css !== ''); // Excluir '' (light)
    
    root.classList.remove(...allCssClasses);
    
    // Aplicar la clase del tema actual (si no es light)
    const currentClass = getThemeClass(theme);
    if (currentClass) {
      root.classList.add(currentClass);
    }
    
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = (next: ThemeId) => setThemeState(next);

  const toggleTheme = () => {
    const currentIndex = THEME_CONFIG.themes.findIndex(t => t.id === theme);
    const nextIndex = (currentIndex + 1) % THEME_CONFIG.themes.length;
    setThemeState(THEME_CONFIG.themes[nextIndex].id);
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      setTheme, 
      toggleTheme, 
      themes: THEME_CONFIG.themes,
      getThemeLabel,
      getThemeClass,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export type {ThemeId};