'use client';

import { useState, useEffect } from 'react';
import OrbBackground from './OrbBackground';
import { Theme, VALID_THEMES } from './ThemeSelector';

const themeClasses: Record<Theme, string> = {
  studio: '', classroom: '', focus: '',
  light: 'bg-white text-gray-900',
  dark: 'bg-gray-950 text-gray-100',
  sepia: 'bg-amber-50 text-amber-900',
  'orbs-white': 'bg-white text-gray-900',
  'orbs-black': 'bg-gray-950 text-gray-100',
  forest: 'bg-green-950 text-green-100',
  ocean: 'bg-sky-950 text-sky-100',
  sunset: 'bg-orange-950 text-orange-100',
  midnight: 'bg-slate-950 text-blue-100',
  candy: 'bg-pink-600 text-white',
  bubblegum: 'bg-fuchsia-100 text-fuchsia-900',
  neon: 'bg-black text-lime-300',
  lemon: 'bg-yellow-100 text-yellow-950',
  galaxy: 'bg-purple-950 text-purple-100',
  rose: 'bg-rose-50 text-rose-900',
  coffee: 'bg-amber-950 text-amber-100',
  arctic: 'bg-blue-50 text-blue-900',
  autumn: 'bg-orange-950 text-orange-100',
  emerald: 'bg-emerald-950 text-emerald-100',
  vapor: 'bg-fuchsia-950 text-pink-200',
  terminal: 'bg-black text-green-400',
  sakura: 'bg-pink-50 text-pink-900',
  lagoon: 'bg-teal-950 text-teal-100',
  desert: 'bg-amber-100 text-amber-950',
  lavender: 'bg-purple-100 text-purple-950',
  slate: 'bg-slate-800 text-slate-100',
  crimson: 'bg-red-950 text-red-100',
  meadow: 'bg-lime-50 text-lime-950',
  aurora: 'bg-indigo-950 text-indigo-100',
  coral: 'bg-orange-50 text-orange-950',
  storm: 'bg-slate-900 text-slate-100',
  mint: 'bg-emerald-50 text-emerald-950',
  'sunset-dunes': 'bg-amber-50 text-amber-950',
};

interface ThemeWrapperProps {
  children: React.ReactNode;
}

export default function ThemeWrapper({ children }: ThemeWrapperProps) {
  const [theme, setTheme] = useState<Theme>('studio');

  useEffect(() => {
    const saved = localStorage.getItem('tanuki_theme') as Theme | null;
    if (saved && VALID_THEMES.includes(saved)) setTheme(saved);
  }, []);

  // Listen for theme changes dispatched from page-level ThemeSelectors
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'tanuki_theme' && e.newValue && VALID_THEMES.includes(e.newValue as Theme)) {
        setTheme(e.newValue as Theme);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div data-theme={theme} className={`app-theme min-h-screen relative transition-colors duration-500 ${themeClasses[theme]}`}>
      {(theme === 'orbs-white' || theme === 'orbs-black') && (
        <OrbBackground variant={theme === 'orbs-white' ? 'white' : 'black'} />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
