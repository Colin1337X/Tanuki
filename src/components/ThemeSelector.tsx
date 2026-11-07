'use client';

export type Theme = 'studio' | 'classroom' | 'focus' | 'light' | 'dark' | 'sepia' | 'orbs-white' | 'orbs-black' | 'forest' | 'ocean' | 'sunset' | 'midnight' | 'candy' | 'bubblegum' | 'neon' | 'lemon' | 'galaxy' | 'rose' | 'coffee' | 'arctic' | 'autumn' | 'emerald' | 'vapor' | 'terminal' | 'sakura' | 'lagoon' | 'desert' | 'lavender' | 'slate' | 'crimson' | 'meadow' | 'aurora' | 'coral' | 'storm' | 'mint' | 'sunset-dunes';

export const VALID_THEMES: Theme[] = ['studio', 'classroom', 'focus', 'light', 'dark', 'sepia', 'orbs-white', 'orbs-black', 'forest', 'ocean', 'sunset', 'midnight', 'candy', 'bubblegum', 'neon', 'lemon', 'galaxy', 'rose', 'coffee', 'arctic', 'autumn', 'emerald', 'vapor', 'terminal', 'sakura', 'lagoon', 'desert', 'lavender', 'slate', 'crimson', 'meadow', 'aurora', 'coral', 'storm', 'mint', 'sunset-dunes'];

interface ThemeSelectorProps {
  current: Theme;
  onChange: (theme: Theme) => void;
}

export const themes: { id: Theme; label: string; icon: string }[] = [
  { id: 'studio', label: 'Studio', icon: '◒' },
  { id: 'classroom', label: 'Classroom', icon: '✳' },
  { id: 'focus', label: 'Focus', icon: '◻' },
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'sepia', label: 'Sepia', icon: '📜' },
  { id: 'orbs-white', label: 'Orbs / White', icon: '🔮' },
  { id: 'orbs-black', label: 'Orbs / Black', icon: '✨' },
  { id: 'forest', label: 'Forest', icon: '🌿' },
  { id: 'ocean', label: 'Ocean', icon: '🌊' },
  { id: 'sunset', label: 'Sunset', icon: '🌅' },
  { id: 'midnight', label: 'Midnight', icon: '🌌' },
  { id: 'candy', label: 'Candy', icon: '🍬' },
  { id: 'bubblegum', label: 'Bubblegum', icon: '🫧' },
  { id: 'neon', label: 'Neon', icon: '⚡' },
  { id: 'lemon', label: 'Lemon', icon: '🍋' },
  { id: 'galaxy', label: 'Galaxy', icon: '🪐' },
  { id: 'rose', label: 'Rose', icon: '🌹' },
  { id: 'coffee', label: 'Coffee', icon: '☕' },
  { id: 'arctic', label: 'Arctic', icon: '🧊' },
  { id: 'autumn', label: 'Autumn', icon: '🍂' },
  { id: 'emerald', label: 'Emerald', icon: '💎' },
  { id: 'vapor', label: 'Vapor', icon: '🌫️' },
  { id: 'terminal', label: 'Terminal', icon: '🖥️' },
  { id: 'sakura', label: 'Sakura', icon: '🌸' },
  { id: 'lagoon', label: 'Lagoon', icon: '🏝️' },
  { id: 'desert', label: 'Desert', icon: '🏜️' },
  { id: 'lavender', label: 'Lavender', icon: '💜' },
  { id: 'slate', label: 'Slate', icon: '🪨' },
  { id: 'crimson', label: 'Crimson', icon: '🍷' },
  { id: 'meadow', label: 'Meadow', icon: '🌾' },
  { id: 'aurora', label: 'Aurora', icon: '🌈' },
  { id: 'coral', label: 'Coral', icon: '🪸' },
  { id: 'storm', label: 'Storm', icon: '⛈️' },
  { id: 'mint', label: 'Mint', icon: '🌱' },
  { id: 'sunset-dunes', label: 'Dunes', icon: '🏖️' },
];

export default function ThemeSelector({ current, onChange }: ThemeSelectorProps) {
  return (
    <div className="relative">
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as Theme)}
        className="appearance-none w-full bg-white/10 border border-white/20 rounded-xl pl-3 pr-8 py-2 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 hover:bg-white/20 transition-colors"
        aria-label="Select theme"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.icon} {t.label}
          </option>
        ))}
      </select>
      {/* Custom chevron */}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-60">
        ▾
      </span>
    </div>
  );
}
