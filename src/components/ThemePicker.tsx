'use client';

import { useEffect, useState } from 'react';
import ThemeSelector, { Theme, VALID_THEMES } from './ThemeSelector';

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('studio');
  useEffect(() => {
    function sync() {
      const value = localStorage.getItem('tanuki_theme') as Theme;
      if (VALID_THEMES.includes(value)) setTheme(value);
    }
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <ThemeSelector current={theme} onChange={(value) => {
    localStorage.setItem('tanuki_theme', value);
    setTheme(value);
    window.dispatchEvent(new StorageEvent('storage', { key: 'tanuki_theme', newValue: value }));
  }} />;
}
