'use client';

import { useState, useRef, useCallback } from 'react';
import { ReadingLevel } from '@/lib/reading-levels';

const GENRES = [
  'Fantasy', 'Adventure', 'Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Comedy', 'Historical',
  'Thriller', 'Fairy Tale', 'Mythology', 'Sports', 'Animals & Nature',
  'Science', 'Drama', 'Superhero', 'Poetry', 'Fable',
  'Dystopian', 'Western', 'Crime', 'Steampunk', 'Pirate', 'Magic Realism',
  'Slice of Life', 'Graphic Novel', 'Other',
];

const READING_LEVEL_ICONS: Record<ReadingLevel, string> = {
  'Pre-K': '🌱',
  'Kindergarten': '🎒',
  'Elementary': '📚',
  'Middle School': '✏️',
  'High School': '🏫',
  'College': '🎓',
  'Graduate': '🔬',
  'Doctorate': '🎖️',
};

/** Per-level color tokens — used for the State of Mind slider. */
const READING_LEVEL_COLORS: Record<
  ReadingLevel,
  { hex: string; glow: string; label: string }
> = {
  'Pre-K':        { hex: '#10b981', glow: 'rgba(16,185,129,0.55)',  label: 'Gentle stories for very young readers'     },
  'Kindergarten': { hex: '#06b6d4', glow: 'rgba(6,182,212,0.55)',   label: 'Simple words and short sentences'          },
  'Elementary':   { hex: '#3b82f6', glow: 'rgba(59,130,246,0.55)',  label: 'Basic stories for early readers'           },
  'Middle School':{ hex: '#6366f1', glow: 'rgba(99,102,241,0.55)',  label: 'Moderate complexity for preteens'          },
  'High School':  { hex: '#8b5cf6', glow: 'rgba(139,92,246,0.55)',  label: 'Richer vocabulary for teenage readers'     },
  'College':      { hex: '#a855f7', glow: 'rgba(168,85,247,0.55)',  label: 'Advanced prose and complex ideas'          },
  'Graduate':     { hex: '#ec4899', glow: 'rgba(236,72,153,0.55)',  label: 'Sophisticated academic writing'            },
  'Doctorate':    { hex: '#f59e0b', glow: 'rgba(245,158,11,0.55)',  label: 'Expert-level depth and nuance'             },
};

/** Apple State-of-Mind–inspired horizontal segmented slider for reading level. */
function ReadingLevelSlider({
  levels,
  value,
  onChange,
}: {
  levels: ReadingLevel[];
  value: ReadingLevel | null;
  onChange: (level: ReadingLevel) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  /** Map a pointer X position on the track to the nearest level index. */
  const levelFromX = useCallback(
    (clientX: number): ReadingLevel | null => {
      const el = trackRef.current;
      if (!el || levels.length === 0) return null;
      const { left, width } = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - left) / width));
      const idx = Math.round(pct * (levels.length - 1));
      return levels[idx] ?? null;
    },
    [levels],
  );

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const lvl = levelFromX(e.clientX);
    if (lvl) onChange(lvl);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.buttons === 0) return;
    const lvl = levelFromX(e.clientX);
    if (lvl) onChange(lvl);
  }

  const selectedIndex = value ? levels.indexOf(value) : -1;
  const thumbPct = levels.length > 1 ? (selectedIndex / (levels.length - 1)) * 100 : 0;

  // Build gradient stops for the track
  const gradientStops = levels
    .map((l, i) => `${READING_LEVEL_COLORS[l].hex} ${(i / Math.max(levels.length - 1, 1)) * 100}%`)
    .join(', ');

  return (
    <div className="space-y-4 select-none">
      {/* Prominent selected level display */}
      <div
        className="flex items-center justify-center gap-3 py-4 px-5 rounded-2xl transition-all duration-300"
        style={
          value
            ? {
                background: `${READING_LEVEL_COLORS[value].hex}22`,
                boxShadow: `0 0 0 1px ${READING_LEVEL_COLORS[value].hex}55, 0 4px 24px -4px ${READING_LEVEL_COLORS[value].glow}`,
              }
            : { background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)' }
        }
      >
        {value ? (
          <>
            <span className="text-4xl leading-none">{READING_LEVEL_ICONS[value]}</span>
            <div>
              <div className="text-lg font-bold leading-tight" style={{ color: READING_LEVEL_COLORS[value].hex }}>
                {value}
              </div>
              <div className="text-xs text-white/60 mt-0.5">{READING_LEVEL_COLORS[value].label}</div>
            </div>
          </>
        ) : (
          <span className="text-sm text-white/40 italic">Slide or tap to pick your reading level</span>
        )}
      </div>

      {/* Gradient track + draggable thumb */}
      <div
        ref={trackRef}
        className="relative h-10 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={levels.length - 1}
        aria-valuenow={selectedIndex >= 0 ? selectedIndex : 0}
        aria-valuetext={value ?? undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (selectedIndex > 0) onChange(levels[selectedIndex - 1]);
            else if (selectedIndex === -1 && levels.length) onChange(levels[0]);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (selectedIndex < levels.length - 1) onChange(levels[selectedIndex + 1]);
            else if (selectedIndex === -1 && levels.length) onChange(levels[0]);
          }
        }}
      >
        {/* Coloured track */}
        <div
          className="absolute inset-x-0 h-3 rounded-full"
          style={{ background: `linear-gradient(to right, ${gradientStops})` }}
        />
        {/* Dimmed right portion */}
        {value && (
          <div
            className="absolute right-0 h-3 rounded-r-full bg-black/40 transition-all duration-200"
            style={{ left: `${thumbPct}%` }}
          />
        )}
        {/* Thumb */}
        {value && (
          <div
            className="absolute w-7 h-7 rounded-full bg-white shadow-xl transition-all duration-200 -translate-x-1/2 pointer-events-none"
            style={{
              left: `${thumbPct}%`,
              boxShadow: `0 0 0 3px ${READING_LEVEL_COLORS[value].hex}, 0 4px 12px ${READING_LEVEL_COLORS[value].glow}`,
            }}
          />
        )}
      </div>

      {/* Emoji tick marks */}
      <div className="flex justify-between px-0">
        {levels.map((level) => {
          const isSelected = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className="flex flex-col items-center gap-0.5 transition-all duration-200 focus:outline-none"
              style={{ flex: '1 1 0', minWidth: 0 }}
            >
              <span
                className="text-xl leading-none transition-all duration-200"
                style={
                  isSelected
                    ? { filter: `drop-shadow(0 0 6px ${READING_LEVEL_COLORS[level].glow})`, transform: 'scale(1.35)' }
                    : { opacity: 0.45 }
                }
              >
                {READING_LEVEL_ICONS[level]}
              </span>
              <span
                className="text-[9px] leading-tight text-center transition-all duration-200 truncate w-full"
                style={isSelected ? { color: READING_LEVEL_COLORS[level].hex, fontWeight: 700 } : { color: 'rgba(255,255,255,0.35)' }}
              >
                {level.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { themes as THEME_OPTIONS } from './ThemeSelector';

interface OnboardingModalProps {
  allowedReadingLevels: ReadingLevel[];
  initialReadingLevel?: ReadingLevel | null;
  initialPreferences?: { theme?: string; favoriteGenres?: string[]; coWriterMode?: boolean };
  /** Whether the student can skip/close (false = required first-time onboarding). */
  dismissable: boolean;
  onComplete: (data: {
    readingLevel: ReadingLevel;
    preferences: { theme: string; favoriteGenres: string[]; coWriterMode: boolean };
  }) => void;
  onDismiss?: () => void;
}

export default function OnboardingModal({
  allowedReadingLevels,
  initialReadingLevel,
  initialPreferences,
  dismissable,
  onComplete,
  onDismiss,
}: OnboardingModalProps) {
  const [step, setStep] = useState<'reading-level' | 'preferences'>('reading-level');
  const [readingLevel, setReadingLevel] = useState<ReadingLevel | null>(initialReadingLevel ?? null);
  const [theme, setTheme] = useState<string>(initialPreferences?.theme ?? 'studio');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(
    initialPreferences?.favoriteGenres ?? [],
  );
  const [coWriterMode, setCoWriterMode] = useState<boolean>(
    initialPreferences?.coWriterMode ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [customGenreInput, setCustomGenreInput] = useState('');
  const [showCustomGenreInput, setShowCustomGenreInput] = useState(false);

  function toggleGenre(genre: string) {
    setFavoriteGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }

  function addCustomGenre() {
    const trimmed = customGenreInput.trim();
    if (trimmed && !favoriteGenres.includes(trimmed)) {
      setFavoriteGenres((prev) => [...prev, trimmed]);
    }
    setCustomGenreInput('');
    setShowCustomGenreInput(false);
  }

  function handleCustomGenreKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomGenre();
    } else if (e.key === 'Escape') {
      setShowCustomGenreInput(false);
      setCustomGenreInput('');
    }
  }

  async function handleFinish() {
    if (!readingLevel) return;
    setSaving(true);
    onComplete({ readingLevel, preferences: { theme, favoriteGenres, coWriterMode } });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Reading preferences" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="glass-shimmer relative w-full max-w-lg bg-white/[0.07] backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 text-white overflow-hidden"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 80px -20px rgba(139,92,246,0.3)' }}
      >

        {dismissable && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors text-xl"
            aria-label="Close settings"
          >
            ✕
          </button>
        )}

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="text-5xl mb-3">🦝</div>
          <h2 className="text-2xl font-bold">
            {dismissable ? 'My Settings' : 'Welcome to Tanuki Stories!'}
          </h2>
          {!dismissable && (
            <p className="text-purple-200 mt-2 text-sm">
              Let&rsquo;s personalise your reading experience before you begin.
            </p>
          )}
          {/* Step indicator */}
          <div className="flex justify-center gap-2 mt-4">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${step === 'reading-level' ? 'bg-white' : 'bg-white/30'}`}
            />
            <span
              className={`w-2 h-2 rounded-full transition-colors ${step === 'preferences' ? 'bg-white' : 'bg-white/30'}`}
            />
          </div>
        </div>

        {/* Step 1: Reading level */}
        {step === 'reading-level' && (
          <div className="px-8 pb-8 space-y-4">
            <h3 className="font-semibold text-lg">📖 Choose your reading level</h3>
            <p className="text-purple-200 text-sm">
              Slide or tap to set the right complexity. You can change it any time.
            </p>
            <ReadingLevelSlider
              levels={allowedReadingLevels}
              value={readingLevel}
              onChange={setReadingLevel}
            />
            <button
              onClick={() => setStep('preferences')}
              disabled={!readingLevel}
              className="w-full mt-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 'preferences' && (
          <div className="px-8 pb-8 space-y-5">
            {/* Theme */}
            <div>
              <h3 className="font-semibold text-lg mb-2">🎨 Choose a theme</h3>
              <div className="relative">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="appearance-none w-full bg-white/10 border border-white/20 rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 hover:bg-white/20 transition-colors"
                  aria-label="Select theme"
                >
                  {THEME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id} className="bg-gray-900 text-white">
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-60">
                  ▾
                </span>
              </div>
            </div>

            {/* Favourite genres */}
            <div>
              <h3 className="font-semibold text-lg mb-2">🎭 Favourite genres <span className="text-sm font-normal text-purple-200">(optional)</span></h3>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                      favoriteGenres.includes(g)
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : 'bg-white/10 border-white/30 hover:bg-white/20'
                    }`}
                  >
                    {g}
                  </button>
                ))}
                {/* Custom genres already added */}
                {favoriteGenres.filter((g) => !GENRES.includes(g)).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all border bg-purple-600 text-white border-purple-600 shadow-md"
                  >
                    {g} ✕
                  </button>
                ))}
                {/* Add custom genre button */}
                {showCustomGenreInput ? (
                  <div className="flex items-center gap-1 w-full mt-1">
                    <input
                      type="text"
                      value={customGenreInput}
                      onChange={(e) => setCustomGenreInput(e.target.value)}
                      onKeyDown={handleCustomGenreKeyDown}
                      placeholder="Type a genre…"
                      autoFocus
                      className="flex-1 bg-white/10 border border-white/30 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-white/40"
                    />
                    <button
                      type="button"
                      onClick={addCustomGenre}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-purple-600 text-white border border-purple-600 hover:bg-purple-700 transition-all"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCustomGenreInput(false); setCustomGenreInput(''); }}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 border border-white/30 hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomGenreInput(true)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all border bg-white/10 border-white/30 hover:bg-white/20 border-dashed"
                  >
                    + Custom
                  </button>
                )}
              </div>
            </div>

            {/* Co-writer mode */}
            <div>
              <h3 className="font-semibold text-lg mb-1">✍️ Co-writer mode</h3>
              <p className="text-purple-200 text-sm mb-3">
                When enabled, you can review and edit the AI&rsquo;s story plan before it writes each chapter.
              </p>
              <button
                type="button"
                onClick={() => setCoWriterMode((v) => !v)}
                className={`relative inline-flex items-center gap-3 px-4 py-3 rounded-2xl border w-full transition-all ${
                  coWriterMode
                    ? 'bg-indigo-600/30 border-indigo-400/60 text-indigo-200'
                    : 'bg-white/10 border-white/20 opacity-70 hover:opacity-100'
                }`}
              >
                <span className="text-xl">{coWriterMode ? '🤝' : '🤖'}</span>
                <span className="text-sm font-medium">
                  {coWriterMode ? 'Co-writer mode is ON' : 'Co-writer mode is OFF'}
                </span>
                <span className={`ml-auto w-10 h-5 rounded-full transition-colors flex-shrink-0 ${coWriterMode ? 'bg-indigo-500' : 'bg-white/20'}`}>
                  <span className={`block w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform ${coWriterMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('reading-level')}
                className="flex-1 py-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
              >
                ← Back
              </button>
              <button
                onClick={handleFinish}
                disabled={saving || !readingLevel}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-40"
              >
                {saving ? 'Saving…' : dismissable ? '✓ Save Settings' : '🚀 Get Started!'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
