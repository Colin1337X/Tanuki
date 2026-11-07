'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ThemeWrapper from '@/components/ThemeWrapper';
import StoryCard from '@/components/StoryCard';
import Brand from '@/components/Brand';
import OnboardingModal from '@/components/OnboardingModal';
import { Story, LockableField, StoryPlan } from '@/lib/storage';
import { ReadingLevel } from '@/lib/reading-levels';
import { MATURITY_LEVEL_INFO, MATURITY_LEVEL_DEFAULT, MATURITY_LEVEL_MAX } from '@/lib/safety';
import ThemeSelector, { Theme, VALID_THEMES } from '@/components/ThemeSelector';
import { confirmUnauthenticated, fetchWithAuthRetry } from '@/lib/client-auth';

const GENRES = [
  'Fantasy', 'Adventure', 'Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Comedy', 'Historical',
  'Thriller', 'Fairy Tale', 'Mythology', 'Sports', 'Animals & Nature',
  'Science', 'Drama', 'Superhero', 'Poetry', 'Fable',
  'Dystopian', 'Western', 'Crime', 'Steampunk', 'Pirate', 'Magic Realism',
  'Slice of Life', 'Graphic Novel', 'Other',
];

interface StoryOptions {
  title: string;
  chapterCount: number;
  readingComplexity: 'simple' | 'intermediate' | 'advanced';
  vocabularyComplexity: 'basic' | 'intermediate' | 'advanced';
  genre: string;
  plot: string;
}

const DEFAULT_OPTIONS: StoryOptions = {
  title: '',
  chapterCount: 1,
  readingComplexity: 'intermediate',
  vocabularyComplexity: 'intermediate',
  genre: '',
  plot: '',
};

interface OnboardingData {
  onboardingCompleted: boolean;
  readingLevel: ReadingLevel | null;
  preferences: { theme?: string; favoriteGenres?: string[]; coWriterMode?: boolean };
  allowedReadingLevels: ReadingLevel[];
}

export default function StudentPage() {
  const router = useRouter();
  const [request, setRequest] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryKind, setLibraryKind] = useState('all');
  const [options, setOptions] = useState<StoryOptions>(DEFAULT_OPTIONS);
  const [lockedFields, setLockedFields] = useState<LockableField[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [error, setError] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  // Info Mode toggle
  const [infoMode, setInfoMode] = useState(false);

  // Custom genre input (shown when "Custom..." is selected)
  const [customGenreInput, setCustomGenreInput] = useState('');
  const [isCustomGenre, setIsCustomGenre] = useState(false);

  // Co-writer mode (loaded from student config)
  const [coWriterMode, setCoWriterMode] = useState(false);

  // Planning stage state
  type PlanningStage = 'idle' | 'planning' | 'editing' | 'starting';
  const [planningStage, setPlanningStage] = useState<PlanningStage>('idle');
  const [editedPlan, setEditedPlan] = useState<StoryPlan | null>(null);

  // Theme state (synced with ThemeWrapper via localStorage + StorageEvent)
  const [theme, setThemeState] = useState<Theme>('studio');

  // Maturity state
  const [maturityRange, setMaturityRange] = useState<{ min: number; max: number }>({ min: 1, max: 6 });
  const [contentMaturityLevel, setContentMaturityLevel] = useState<number>(MATURITY_LEVEL_DEFAULT);

  // Onboarding state
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const loadStories = useCallback(async () => {
    // On iOS/iPadOS the httpOnly session cookie written by the login fetch
    // may not be flushed to the cookie jar before the first in-page requests
    // fire after navigation; fetchWithAuthRetry retries transient 401s.
    const res = await fetchWithAuthRetry('/api/stories', undefined, { retryStatuses: [401] });
    if (res.status === 401) {
      if (await confirmUnauthenticated()) router.push('/login');
      return;
    }
    if (!res.ok) { setError('Failed to load stories. Please refresh the page.'); return; }
    const data = await res.json();
    setStories(Array.isArray(data) ? data : []);
  }, [router]);

  const loadStudentConfig = useCallback(async () => {
    const res = await fetch('/api/student/config');
    if (!res.ok) return;
    const cfg = await res.json();
    const locked: LockableField[] = cfg.lockedFields ?? [];
    const defaults: Record<string, unknown> = cfg.defaults ?? {};
    setLockedFields(locked);
    if (cfg.maturityRange) setMaturityRange(cfg.maturityRange);
    if (typeof cfg.contentMaturityLevel === 'number') setContentMaturityLevel(cfg.contentMaturityLevel);
    if (typeof cfg.coWriterMode === 'boolean') setCoWriterMode(cfg.coWriterMode);
    setOptions((prev) => {
      const next = { ...prev };
      for (const field of locked) {
        const val = defaults[field];
        if (val !== undefined) {
          (next as Record<string, unknown>)[field] = val;
        }
      }
      return next;
    });
  }, []);

  const loadOnboarding = useCallback(async () => {
    const res = await fetch('/api/student/onboarding');
    if (!res.ok) return;
    const data: OnboardingData = await res.json();
    setOnboardingData(data);
    if (!data.onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    loadStories();
    loadStudentConfig();
    loadOnboarding();
  }, [loadStories, loadStudentConfig, loadOnboarding]);

  // Initialise theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('tanuki_theme') as Theme | null;
    if (saved && VALID_THEMES.includes(saved)) setThemeState(saved);
  }, []);

  function handleThemeChange(t: Theme) {
    setThemeState(t);
    localStorage.setItem('tanuki_theme', t);
    // Dispatch a StorageEvent so ThemeWrapper (same window) reacts immediately
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'tanuki_theme',
      newValue: t,
      storageArea: localStorage,
    }));
  }

  function isLocked(field: LockableField) {
    return lockedFields.includes(field);
  }

  function setOpt<K extends keyof StoryOptions>(key: K, value: StoryOptions[K]) {
    if (isLocked(key as LockableField)) return;
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  async function handleGenerate() {
    if (!request.trim()) return;

    // Info mode: use old direct generate flow (no planning stage)
    if (infoMode) {
      setGenerating(true);
      setError('');
      setCurrentStory(null);
      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request,
          title: options.title || undefined,
          chapterCount: options.chapterCount,
          readingComplexity: options.readingComplexity,
          vocabularyComplexity: options.vocabularyComplexity,
          contentMaturityLevel,
          infoMode: true,
        }),
      });
      const data = await res.json();
      setGenerating(false);
      if (!res.ok) { setError(data.error || 'Generation failed'); return; }
      setCurrentStory(data);
      setRequest('');
      loadStories();
      return;
    }

    // Story mode: planning stage
    setError('');
    setCurrentStory(null);
    setPlanningStage('planning');
    setEditedPlan(null);

    const planBody = {
      request,
      title: options.title || undefined,
      chapterCount: options.chapterCount,
      readingComplexity: options.readingComplexity,
      vocabularyComplexity: options.vocabularyComplexity,
      genre: options.genre || undefined,
      plot: options.plot || undefined,
      contentMaturityLevel,
    };

    const planRes = await fetch('/api/stories/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planBody),
    });

    if (!planRes.ok) {
      const data = await planRes.json();
      setError(data.error || 'Plan generation failed');
      setPlanningStage('idle');
      return;
    }

    const { plan } = await planRes.json();
    setEditedPlan({ ...plan });

    if (coWriterMode) {
      // Show the plan editor — user will click "Generate Story" after editing
      setPlanningStage('editing');
    } else {
      // Skip editor; immediately start story
      await startStoryWithPlan(plan);
    }
  }

  async function startStoryWithPlan(plan: StoryPlan) {
    setPlanningStage('starting');
    setError('');

    const startBody = {
      request,
      plan,
      title: options.title || undefined,
      chapterCount: options.chapterCount,
      readingComplexity: options.readingComplexity,
      vocabularyComplexity: options.vocabularyComplexity,
      genre: options.genre || undefined,
      plot: options.plot || undefined,
      contentMaturityLevel,
    };

    const startRes = await fetch('/api/stories/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startBody),
    });

    if (!startRes.ok) {
      const data = await startRes.json();
      setError(data.error || 'Failed to start story');
      setPlanningStage('idle');
      return;
    }

    const storyRecord = await startRes.json();
    setPlanningStage('idle');
    setEditedPlan(null);
    setRequest('');
    loadStories();
    router.push(`/student/reader/${storyRecord.id}`);
  }

  function handleStoryUpdated(updated: Story) {
    setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (currentStory?.id === updated.id) setCurrentStory(updated);
  }

  async function handleOnboardingComplete(data: {
    readingLevel: ReadingLevel;
    preferences: { theme: string; favoriteGenres: string[]; coWriterMode: boolean };
  }) {
    await fetch('/api/student/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    // Apply theme to localStorage; ThemeWrapper listens for storage events
    if (data.preferences.theme) {
      setThemeState(data.preferences.theme as Theme);
      localStorage.setItem('tanuki_theme', data.preferences.theme);
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'tanuki_theme',
        newValue: data.preferences.theme,
        storageArea: localStorage,
      }));
    }
    setCoWriterMode(data.preferences.coWriterMode ?? false);
    setOnboardingData((prev) => prev ? { ...prev, ...data, onboardingCompleted: true } : null);
    setShowOnboarding(false);
  }

  const lockBadge = (field: LockableField) =>
    isLocked(field) ? (
      <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-400/30 px-2 py-0.5 rounded-full">
        🔒 locked
      </span>
    ) : null;

  return (
    <ThemeWrapper>
      {showOnboarding && onboardingData && (
        <OnboardingModal
          allowedReadingLevels={onboardingData.allowedReadingLevels}
          initialReadingLevel={onboardingData.readingLevel}
          initialPreferences={{ ...onboardingData.preferences, theme, coWriterMode }}
          dismissable={onboardingData.onboardingCompleted}
          onComplete={handleOnboardingComplete}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-white/10 px-4 sm:px-6 py-3.5 flex justify-between items-center gap-3 bg-white/[0.06] backdrop-blur-xl"
          style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.18)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Brand />
            {onboardingData?.readingLevel && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full whitespace-nowrap hidden sm:inline">
                {onboardingData.readingLevel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeSelector current={theme} onChange={handleThemeChange} />
            <span className="mx-1 h-6 border-l border-current/20 hidden sm:block" aria-hidden="true" />
            <button
              onClick={() => setShowOnboarding(true)}
              title="Settings"
              aria-label="Settings"
              className="text-sm opacity-60 hover:opacity-100 transition-opacity border border-current/20 min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl hover:bg-black/10 flex items-center justify-center"
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              className="text-sm opacity-60 hover:opacity-100 transition-opacity border border-current/20 min-h-[44px] px-4 py-2 rounded-xl hover:bg-black/10"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <span className="eyebrow">YOUR SPACE</span>
          <a href="#create" className="sidebar-link">✳ <span>Create a story</span><span>↗</span></a>
          <a href="#library" className="sidebar-link">▤ <span>My library</span><span>{stories.length}</span></a>
          <button onClick={() => setShowOnboarding(true)} className="sidebar-link">⚙ <span>Reading preferences</span></button>
          <div className="sidebar-note"><span className="note-spark">✦</span><h3>A little idea goes a long way.</h3><p>Start with a character, a place, or one wonderfully strange question.</p></div>
          <div className="sidebar-bottom">MADE FOR YOUR IMAGINATION</div>
        </aside>
        <main className="student-workspace" id="main-content">
          <section className="workspace-welcome"><div><span className="eyebrow">LET CURIOSITY LEAD THE WAY</span><h1>What will you imagine today?</h1><p className="muted">A world to discover. A story to make your own.</p></div><span className="welcome-emblem" aria-hidden="true">✳</span></section>
          <div className="workspace-meta"><span>YOUR CREATIVE STUDIO</span><span>{stories.length} {stories.length === 1 ? 'story' : 'stories'} in your library</span></div>
          <section id="create" className="composer glass-shimmer relative bg-white/[0.07] backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl"
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 8px 32px rgba(0,0,0,0.2)' }}
          >
            {/* top highlight */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-3xl" />

            {/* Mode toggle — segmented control */}
            <div className="flex items-center gap-1 mb-5 bg-black/15 rounded-2xl p-1 w-full sm:w-fit border border-current/10">
              <button
                type="button"
                onClick={() => setInfoMode(false)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  !infoMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'opacity-60 hover:opacity-90'
                }`}
              >
                ✨ Story Mode
              </button>
              <button
                type="button"
                onClick={() => setInfoMode(true)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  infoMode ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/40' : 'opacity-60 hover:opacity-90'
                }`}
              >
                🔍 Info Mode
              </button>
            </div>

            {infoMode && (
              <div className="mb-4 text-xs bg-teal-500/10 border border-teal-400/20 rounded-xl px-4 py-2 text-teal-300">
                Info Mode searches the local knowledge base and the web, then asks the AI to write a factual nonfiction article.
              </div>
            )}

            <h2 className="text-lg font-semibold mb-4">
              {infoMode ? 'Follow your curiosity' : 'Every story starts with an idea'}
            </h2>
            <textarea
              id="story-idea" aria-label={infoMode ? "Topic to research" : "Your story idea"}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={4}
              className="w-full bg-black/5 border border-current/20 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-current/40"
              placeholder={
                infoMode
                  ? 'Enter a topic to research… e.g. "The water cycle" or "The history of ancient Egypt"'
                  : 'Describe the story you want… e.g. \'A brave fox who discovers a hidden treasure in the forest\''
              }
            />

            {!infoMode && !request && <div className="idea-prompts"><span>Try a little inspiration</span>{['A fox who collects lost stars', 'A secret door in the school library', 'An underwater city of inventors'].map((idea) => <button key={idea} type="button" onClick={() => { setRequest(idea); document.getElementById('story-idea')?.focus(); }}>{idea} <span aria-hidden="true">↗</span></button>)}</div>}
            {/* Options toggle */}
            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              className="mt-3 text-sm opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
            >
              <span>{showOptions ? '▾' : '▸'}</span> {infoMode ? 'Article options' : 'Story options'}
            </button>

            {showOptions && (
              <div className="mt-4 space-y-4 border-t border-current/10 pt-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">Title (optional)</label>
                  <input
                    type="text"
                    value={options.title}
                    onChange={(e) => setOpt('title', e.target.value)}
                    placeholder="Leave blank to let the AI choose"
                    className="w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-current/30"
                  />
                </div>

                {/* Genre — hidden in Info Mode */}
                {!infoMode && (
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">
                    Genre {lockBadge('genre')}
                  </label>
                  <select
                    value={isCustomGenre ? '__custom__' : options.genre}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomGenre(true);
                      } else {
                        setIsCustomGenre(false);
                        setCustomGenreInput('');
                        setOpt('genre', e.target.value);
                      }
                    }}
                    disabled={isLocked('genre')}
                    className="w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                  >
                    <option value="">Any</option>
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {isCustomGenre && (
                    <input
                      type="text"
                      value={customGenreInput}
                      onChange={(e) => {
                        setCustomGenreInput(e.target.value);
                        setOpt('genre', e.target.value);
                      }}
                      placeholder="Type your genre…"
                      className="mt-2 w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-current/30"
                    />
                  )}
                </div>
                )}

                {/* Chapter / section count */}
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">
                    {infoMode ? 'Sections' : 'Chapters'} {lockBadge('chapterCount')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={options.chapterCount}
                    onChange={(e) => setOpt('chapterCount', Math.max(1, Number(e.target.value) || 1))}
                    disabled={isLocked('chapterCount')}
                    className="w-24 bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                  />
                </div>

                {/* Reading complexity */}
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">
                    Reading complexity {lockBadge('readingComplexity')}
                  </label>
                  <div className="flex gap-2">
                    {(['simple', 'intermediate', 'advanced'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        disabled={isLocked('readingComplexity')}
                        onClick={() => setOpt('readingComplexity', lvl)}
                        className={`flex-1 py-1.5 rounded-xl text-sm border transition-colors disabled:opacity-50 ${
                          options.readingComplexity === lvl
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-current/20 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vocabulary complexity */}
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">
                    Vocabulary complexity {lockBadge('vocabularyComplexity')}
                  </label>
                  <div className="flex gap-2">
                    {(['basic', 'intermediate', 'advanced'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        disabled={isLocked('vocabularyComplexity')}
                        onClick={() => setOpt('vocabularyComplexity', lvl)}
                        className={`flex-1 py-1.5 rounded-xl text-sm border transition-colors disabled:opacity-50 ${
                          options.vocabularyComplexity === lvl
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-current/20 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plot outline — hidden in Info Mode */}
                {!infoMode && (
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-80">Plot outline (optional)</label>
                  <textarea
                    value={options.plot}
                    onChange={(e) => setOpt('plot', e.target.value)}
                    rows={3}
                    placeholder="Describe the main plot points or arc…"
                    className="w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-current/30"
                  />
                </div>
                )}

                {/* Content maturity */}
                {(maturityRange.max > maturityRange.min || maturityRange.max === MATURITY_LEVEL_MAX) && (
                  <div>
                    <label className="block text-sm font-medium mb-2 opacity-80">Content maturity</label>
                    {maturityRange.max > maturityRange.min ? (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-purple-300">
                            {MATURITY_LEVEL_INFO[contentMaturityLevel]?.emoji}{' '}
                            {MATURITY_LEVEL_INFO[contentMaturityLevel]?.label}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={maturityRange.min}
                          max={maturityRange.max}
                          step={1}
                          value={contentMaturityLevel}
                          onChange={(e) => setContentMaturityLevel(Number(e.target.value))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                        <div className="flex justify-between mt-1">
                          {Array.from({ length: maturityRange.max - maturityRange.min + 1 }, (_, i) => maturityRange.min + i).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setContentMaturityLevel(n)}
                              className={`text-xs text-center transition-colors ${contentMaturityLevel === n ? 'text-purple-300 font-semibold' : 'opacity-40 hover:opacity-70'}`}
                              style={{ width: `${100 / (maturityRange.max - maturityRange.min + 1)}%` }}
                              title={MATURITY_LEVEL_INFO[n]?.label}
                              aria-label={MATURITY_LEVEL_INFO[n]?.label}
                            >
                              {MATURITY_LEVEL_INFO[n]?.emoji}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-xs opacity-50">{MATURITY_LEVEL_INFO[contentMaturityLevel]?.description}</p>
                      </>
                    ) : (
                      // min === max === MATURITY_LEVEL_MAX: admin has set unrestricted mode
                      <div className="flex items-center gap-2 py-2 px-3 bg-purple-500/10 border border-purple-400/20 rounded-xl">
                        <span className="text-lg">🔓</span>
                        <div>
                          <p className="text-sm font-medium text-purple-300">None</p>
                          <p className="text-xs opacity-50">No content safety restrictions applied</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
            <button
              onClick={handleGenerate}
              disabled={generating || planningStage !== 'idle' || !request.trim()}
              className={`mt-5 w-full text-white font-semibold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.99] ${
                infoMode
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 shadow-teal-900/30'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-900/30'
              }`}
            >
              {planningStage === 'planning' ? (
                <><span className="animate-spin">⟳</span> Creating story plan…</>
              ) : planningStage === 'starting' ? (
                <><span className="animate-spin">⟳</span> Starting story…</>
              ) : generating ? (
                infoMode
                  ? <><span className="animate-spin">⟳</span> Researching &amp; writing…</>
                  : <><span className="animate-spin">⟳</span> Generating your story…</>
              ) : (
                infoMode ? '🔍 Research &amp; Generate Article' : '✨ Generate Story'
              )}
            </button>
          </section>

          {/* Planning stage — shown only in co-writer mode after plan is ready */}
          {planningStage === 'editing' && editedPlan && (
            <section className="glass-shimmer relative bg-white/[0.07] backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 8px 32px rgba(0,0,0,0.2)' }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-3xl" />
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                📝 Story Plan
                <span className="text-xs font-normal bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full">Co-writer mode</span>
              </h2>
              <p className="text-sm opacity-60 mb-5">Review and edit the story outline below, then click Generate to start writing.</p>

              {(
                [
                  { key: 'exposition' as const, label: '🌅 Exposition', hint: 'Introduce characters and the world' },
                  { key: 'risingAction' as const, label: '⬆️ Rising Action', hint: 'The challenge that builds tension' },
                  { key: 'climax' as const, label: '⚡ Climax', hint: 'The peak dramatic moment' },
                  { key: 'fallingAction' as const, label: '⬇️ Falling Action', hint: 'Aftermath of the climax' },
                  { key: 'resolution' as const, label: '🌈 Resolution', hint: 'How it all ends' },
                ] as { key: keyof StoryPlan; label: string; hint: string }[]
              ).map(({ key, label, hint }) => (
                <div key={key} className="mb-4">
                  <label className="block text-sm font-medium mb-1 opacity-80">{label}</label>
                  <p className="text-xs opacity-40 mb-1">{hint}</p>
                  <textarea
                    value={editedPlan[key]}
                    onChange={(e) => setEditedPlan((p) => p ? { ...p, [key]: e.target.value } : p)}
                    rows={2}
                    className="w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              ))}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => { setPlanningStage('idle'); setEditedPlan(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-current/20 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => editedPlan && startStoryWithPlan(editedPlan)}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                >
                  ✨ Generate Story
                </button>
              </div>
            </section>
          )}

          {currentStory && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {currentStory.infoMode ? '📰 Your Article' : '📖 Your Story'}
              </h2>
              <StoryCard story={currentStory} onUpdated={handleStoryUpdated} />
            </section>
          )}

          <section id="library" className="library-section">
            <div className="section-heading"><div><span className="eyebrow">COLLECTED ADVENTURES</span><h2>My library <span className="count-badge">{stories.length}</span></h2></div></div>
            <div className="library-toolbar"><input aria-label="Search your library" type="search" placeholder="Search titles, ideas, or genres…" value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} /><select aria-label="Filter library" value={libraryKind} onChange={(e) => setLibraryKind(e.target.value)}><option value="all">All writing</option><option value="stories">Stories</option><option value="articles">Articles</option></select></div>
            {stories.length === 0 ? <div className="empty-library"><span aria-hidden="true">▤</span><h3>Your bookshelf starts here.</h3><p>Create your first story above. You can come back to it whenever you like.</p><a href="#create">Start imagining →</a></div> : <div className="library-grid">{stories.filter((story) => (libraryKind === 'all' || (libraryKind === 'articles' ? story.infoMode : !story.infoMode)) && `${story.title ?? ''} ${story.request} ${story.options?.genre ?? ''}`.toLowerCase().includes(libraryQuery.toLowerCase())).map((story) => <StoryCard key={story.id} story={story} onUpdated={handleStoryUpdated} />)}</div>}
            {stories.length > 0 && !stories.some((story) => (libraryKind === 'all' || (libraryKind === 'articles' ? story.infoMode : !story.infoMode)) && `${story.title ?? ''} ${story.request} ${story.options?.genre ?? ''}`.toLowerCase().includes(libraryQuery.toLowerCase())) && <p className="empty-library">No matches yet. Try another search or choose all writing.</p>}
          </section>
        </main>
        </div>
      </div>
    </ThemeWrapper>
  );
}
