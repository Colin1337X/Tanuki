'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Brand from '@/components/Brand';
import StoryCard from '@/components/StoryCard';
import ThemeWrapper from '@/components/ThemeWrapper';
import ThemeSelector, { Theme, VALID_THEMES } from '@/components/ThemeSelector';
import { Story, LockableField, StoryDefaults, ClassroomConfig, GlobalSafetyConfig } from '@/lib/storage';
import { ReadingLevel, READING_LEVEL_VALUES } from '@/lib/reading-levels';
import {
  PREDEFINED_BLOCKED_TOPICS,
  MATURITY_LEVEL_INFO,
  MATURITY_LEVEL_MIN,
  MATURITY_LEVEL_MAX,
  MATURITY_LEVEL_DEFAULT,
} from '@/lib/safety';
import { confirmUnauthenticated, fetchWithAuthRetry } from '@/lib/client-auth';
import type { StudentAnalytics, AnalyticsSummary } from '@/app/api/admin/analytics/route';

const LOCKABLE_FIELDS: { key: LockableField; label: string }[] = [
  { key: 'chapterCount', label: 'Chapter count' },
  { key: 'readingComplexity', label: 'Reading complexity' },
  { key: 'vocabularyComplexity', label: 'Vocabulary complexity' },
  { key: 'genre', label: 'Genre' },
];

const GENRES = [
  'Fantasy', 'Adventure', 'Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Comedy', 'Historical',
  'Thriller', 'Non-Fiction', 'Fairy Tale', 'Mythology', 'Sports', 'Animals & Nature',
  'Science', 'Drama', 'Superhero', 'Poetry', 'Fable', 'Other',
];

type AdminTab = 'overview' | 'students' | 'classrooms' | 'safety' | 'config' | 'content';

interface UserConfig {
  lockedFields?: LockableField[];
  defaults?: StoryDefaults;
}

interface StudentInfo {
  username: string;
  readingLevel?: ReadingLevel;
  onboardingCompleted?: boolean;
  preferences?: { theme?: string; favoriteGenres?: string[] };
  contentMaturityLevel?: number;
  blockedTopics?: string[];
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [systemPrompt, setSystemPrompt] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [localModelId, setLocalModelId] = useState('');
  const [userConfigs, setUserConfigs] = useState<Record<string, UserConfig>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reading level range
  const [rlRangeMin, setRlRangeMin] = useState<ReadingLevel>('Pre-K');
  const [rlRangeMax, setRlRangeMax] = useState<ReadingLevel>('Doctorate');
  const [rlRangeError, setRlRangeError] = useState('');

  // Global safety
  const [globalSafety, setGlobalSafety] = useState<GlobalSafetyConfig>({});
  const [globalSafetySaving, setGlobalSafetySaving] = useState(false);
  const [globalSafetySaved, setGlobalSafetySaved] = useState(false);

  // Classrooms
  const [classrooms, setClassrooms] = useState<Record<string, ClassroomConfig>>({});
  const [newClassroomName, setNewClassroomName] = useState('');
  const [classroomsSaving, setClassroomsSaving] = useState(false);
  const [classroomsSaved, setClassroomsSaved] = useState(false);

  // Student management
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [newStudentUsername, setNewStudentUsername] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('');
  const [studentError, setStudentError] = useState('');
  const [studentSuccess, setStudentSuccess] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Teacher management
  interface TeacherInfo {
    username: string;
    managedClassroomIds: string[];
  }
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [newTeacherUsername, setNewTeacherUsername] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [newTeacherClassroomIds, setNewTeacherClassroomIds] = useState<string[]>([]);
  const [teacherError, setTeacherError] = useState('');
  const [teacherSuccess, setTeacherSuccess] = useState('');

  // Analytics
  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  // Recordings
  interface RecordingInfo {
    id: string;
    storyId: string;
    username: string;
    pageNumber: number;
    filename: string;
    createdAt: string;
  }
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);

  // Theme (synced with ThemeWrapper via localStorage + StorageEvent)
  const [theme, setThemeState] = useState<Theme>('studio');

  useEffect(() => {
    const saved = localStorage.getItem('tanuki_theme') as Theme | null;
    if (saved && VALID_THEMES.includes(saved)) setThemeState(saved);
  }, []);

  function handleThemeChange(t: Theme) {
    setThemeState(t);
    localStorage.setItem('tanuki_theme', t);
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'tanuki_theme',
      newValue: t,
      storageArea: localStorage,
    }));
  }

  // Student settings management (per-user)
  const [editingSettings, setEditingSettings] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const loadStudents = useCallback(async () => {
    const res = await fetch('/api/admin/students');
    if (!res.ok) return;
    const data = await res.json();
    setStudents(Array.isArray(data) ? data : []);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const res = await fetch('/api/admin/analytics');
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object' && 'students' in data) {
      setAnalytics(Array.isArray(data.students) ? data.students : []);
      setSummary(data.summary ?? null);
    } else if (Array.isArray(data)) {
      // Backwards-compatible: old API returned plain array
      setAnalytics(data);
    }
  }, []);

  const loadRecordings = useCallback(async (storyList: Story[]) => {
    if (storyList.length === 0) return;
    const results = await Promise.all(
      storyList.map((s) =>
        fetch(`/api/stories/${s.id}/recordings`).then((r) => r.ok ? r.json() : []),
      ),
    );
    setRecordings(results.flat());
  }, []);

  const load = useCallback(async () => {
    // Retry on transient 401/403 — Safari/iPadOS cookie jar lags after login.
    let [cfgRes, meRes] = await Promise.all([
      fetch('/api/admin/config'),
      fetch('/api/auth/me'),
    ]);
    if (cfgRes.status === 403 || cfgRes.status === 401 || meRes.status === 401) {
      [cfgRes, meRes] = await Promise.all([
        fetchWithAuthRetry('/api/admin/config'),
        fetchWithAuthRetry('/api/auth/me', undefined, { retryStatuses: [401] }),
      ]);
      if (cfgRes.status === 403 || cfgRes.status === 401 || meRes.status === 401) {
        if (await confirmUnauthenticated()) router.push('/login');
        return;
      }
    }
    const cfg = await cfgRes.json();
    const meData = meRes.ok ? await meRes.json() : null;
    const userRole = meData?.user?.role as string | undefined;
    if (userRole === 'teacher') { router.push('/teacher'); return; }
    setSystemPrompt(cfg.systemPrompt ?? '');
    setApiBaseUrl(cfg.apiBaseUrl ?? '');
    setModel(cfg.model ?? '');
    setLocalModelId(cfg.localModelId ?? '');
    setUserConfigs(cfg.userConfigs ?? {});
    if (cfg.readingLevelRange) {
      setRlRangeMin(cfg.readingLevelRange.min ?? 'Pre-K');
      setRlRangeMax(cfg.readingLevelRange.max ?? 'Doctorate');
    }
    setGlobalSafety(cfg.globalSafety ?? {});
    setClassrooms(cfg.classrooms ?? {});

    const [storyRes, teachersRes] = await Promise.all([
      fetch('/api/stories'),
      fetch('/api/admin/teachers'),
    ]);
    const storiesData = storyRes.ok ? await storyRes.json() : [];
    const storyList = Array.isArray(storiesData) ? storiesData : [];
    setStories(storyList);
    if (teachersRes.ok) {
      const data = await teachersRes.json();
      setTeachers(Array.isArray(data) ? data : []);
    }
    if (storyList.length > 0) {
      const results = await Promise.all(
        storyList.map((s: Story) =>
          fetch(`/api/stories/${s.id}/recordings`).then((r) => r.ok ? r.json() : []),
        ),
      );
      setRecordings(results.flat());
    }
  }, [router]);

  useEffect(() => {
    load();
    loadStudents();
    loadAnalytics();
  }, [load, loadStudents, loadAnalytics]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  async function handleSave() {
    setSaving(true);
    setRlRangeError('');
    const minIdx = READING_LEVEL_VALUES.indexOf(rlRangeMin);
    const maxIdx = READING_LEVEL_VALUES.indexOf(rlRangeMax);
    if (maxIdx < minIdx) {
      setRlRangeError('Maximum level must be greater than or equal to minimum level.');
      setSaving(false);
      return;
    }
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        model: model.trim() || undefined,
        localModelId: localModelId.trim() || undefined,
        userConfigs,
        readingLevelRange: { min: rlRangeMin, max: rlRangeMax },
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveGlobalSafety() {
    setGlobalSafetySaving(true);
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, globalSafety }),
    });
    setGlobalSafetySaving(false);
    setGlobalSafetySaved(true);
    setTimeout(() => setGlobalSafetySaved(false), 2000);
  }

  async function handleSaveClassrooms() {
    setClassroomsSaving(true);
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, classrooms }),
    });
    setClassroomsSaving(false);
    setClassroomsSaved(true);
    setTimeout(() => setClassroomsSaved(false), 2000);
  }

  function handleAddClassroom() {
    const name = newClassroomName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setClassrooms((prev) => ({ ...prev, [id]: { name, members: [] } }));
    setNewClassroomName('');
  }

  function handleDeleteClassroom(id: string) {
    if (!confirm(`Delete classroom "${classrooms[id]?.name}"?`)) return;
    setClassrooms((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateClassroom(id: string, patch: Partial<ClassroomConfig>) {
    setClassrooms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSaveStudentSettings(
    username: string,
    readingLevel: ReadingLevel | null,
    resetOnboarding: boolean,
    contentMaturityLevel: number,
    blockedTopics: string[],
  ) {
    setSettingsSaving(true);
    setSettingsMsg('');
    const res = await fetch(`/api/admin/students/${encodeURIComponent(username)}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readingLevel: readingLevel ?? null,
        contentMaturityLevel,
        blockedTopics,
        ...(resetOnboarding ? { onboardingCompleted: false } : {}),
      }),
    });
    setSettingsSaving(false);
    if (res.ok) {
      setSettingsMsg('Saved!');
      setTimeout(() => setSettingsMsg(''), 2000);
      loadStudents();
      loadAnalytics();
    } else {
      const d = await res.json().catch(() => ({}));
      setSettingsMsg(d.error ?? 'Save failed');
    }
  }

  function getUserCfg(username: string): UserConfig {
    return userConfigs[username] ?? {};
  }

  function toggleLock(username: string, field: LockableField) {
    const cfg = getUserCfg(username);
    const locked = cfg.lockedFields ?? [];
    const next = locked.includes(field)
      ? locked.filter((f) => f !== field)
      : [...locked, field];
    setUserConfigs((prev) => ({
      ...prev,
      [username]: { ...cfg, lockedFields: next },
    }));
  }

  function setDefaultValue(username: string, field: LockableField, value: unknown) {
    const cfg = getUserCfg(username);
    setUserConfigs((prev) => ({
      ...prev,
      [username]: {
        ...cfg,
        defaults: { ...(cfg.defaults ?? {}), [field]: value },
      },
    }));
  }

  const adminUsernames = new Set(
    (process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? 'admin')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean),
  );
  const studentUsernames = Array.from(
    new Set([
      ...students.map((s) => s.username),
      ...stories.map((s) => s.username),
    ]),
  ).filter((u) => !adminUsernames.has(u));

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setStudentError('');
    setStudentSuccess('');
    if (!newStudentUsername.trim() || !newStudentPassword.trim()) {
      setStudentError('Username and password are required.');
      return;
    }
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newStudentUsername.trim(), password: newStudentPassword.trim() }),
    });
    if (!res.ok) {
      const d = await res.json();
      setStudentError(d.error ?? 'Failed to add student.');
      return;
    }
    setNewStudentUsername('');
    setNewStudentPassword('');
    setStudentSuccess('Student added.');
    setTimeout(() => setStudentSuccess(''), 2000);
    loadStudents();
  }

  async function handleDeleteStudent(username: string) {
    if (!confirm(`Delete student "${username}"?`)) return;
    await fetch(`/api/admin/students/${encodeURIComponent(username)}`, { method: 'DELETE' });
    loadStudents();
  }

  async function handleCsvImport() {
    if (!csvText.trim()) return;
    setCsvImporting(true);
    setStudentError('');
    setStudentSuccess('');
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText }),
    });
    const d = await res.json();
    setCsvImporting(false);
    if (!res.ok) { setStudentError(d.error ?? 'Import failed.'); return; }
    setCsvText('');
    setStudentSuccess(`Imported ${d.imported} student(s).`);
    setTimeout(() => setStudentSuccess(''), 3000);
    loadStudents();
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  }

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    setTeacherError('');
    setTeacherSuccess('');
    if (!newTeacherUsername.trim() || !newTeacherPassword.trim()) {
      setTeacherError('Username and password are required.');
      return;
    }
    const res = await fetch('/api/admin/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newTeacherUsername.trim(),
        password: newTeacherPassword.trim(),
        managedClassroomIds: newTeacherClassroomIds,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setTeacherError(d.error ?? 'Failed to add teacher.');
      return;
    }
    setNewTeacherUsername('');
    setNewTeacherPassword('');
    setNewTeacherClassroomIds([]);
    setTeacherSuccess('Teacher added.');
    setTimeout(() => setTeacherSuccess(''), 2000);
    const refreshed = await fetch('/api/admin/teachers');
    if (refreshed.ok) setTeachers(await refreshed.json());
  }

  async function handleDeleteTeacher(username: string) {
    if (!confirm(`Delete teacher "${username}"?`)) return;
    await fetch(`/api/admin/students/${encodeURIComponent(username)}`, { method: 'DELETE' });
    const refreshed = await fetch('/api/admin/teachers');
    if (refreshed.ok) setTeachers(await refreshed.json());
  }

  async function handleUpdateTeacherClassrooms(username: string, classroomIds: string[]) {
    await fetch(`/api/admin/students/${encodeURIComponent(username)}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managedClassroomIds: classroomIds }),
    });
    const refreshed = await fetch('/api/admin/teachers');
    if (refreshed.ok) setTeachers(await refreshed.json());
  }

  const effectiveGlobalMin = globalSafety.maturityLevelRange?.min ?? MATURITY_LEVEL_MIN;
  const effectiveGlobalMax = globalSafety.maturityLevelRange?.max ?? MATURITY_LEVEL_MAX;

  // Tabs available for admin
  const adminTabs: { id: AdminTab; label: string; emoji: string }[] = [
    { id: 'overview', label: 'Overview', emoji: '📊' },
    { id: 'students', label: 'Students', emoji: '👥' },
    { id: 'classrooms', label: 'Classrooms', emoji: '🏫' },
    { id: 'safety', label: 'Safety', emoji: '🛡️' },
    { id: 'config', label: 'Config', emoji: '🔌' },
    { id: 'content', label: 'Content', emoji: '📚' },
  ];

  return (
    <ThemeWrapper>
    <div className="educator-workspace min-h-screen" style={{ ['--header-height' as string]: '57px' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 px-4 sm:px-6 py-3 flex justify-between items-center gap-3 backdrop-blur-xl bg-white/[0.06]"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.20)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Brand />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeSelector current={theme} onChange={handleThemeChange} />
          <button
            onClick={handleLogout}
            className="text-sm opacity-70 hover:opacity-100 transition-opacity border border-current/20 min-h-[44px] px-4 py-2 rounded-xl hover:bg-black/10"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tab navigation — horizontally scrollable so it never clips on iPad.
          Uses --header-height set on the root div so the offset stays in sync. */}
      <div className="sticky top-[var(--header-height,57px)] z-30 border-b border-white/10 backdrop-blur-xl bg-white/[0.04]">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {adminTabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent opacity-60 hover:opacity-100 hover:border-white/30'
              }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <section className="educator-welcome"><span className="eyebrow">SCHOOL WORKSPACE</span><h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1><p className="muted">A thoughtful space to help every reader grow.</p></section>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Summary stat cards */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  emoji="👥"
                  label="Total Students"
                  value={summary.totalStudents}
                  sub={`${summary.onboardedStudents} onboarded`}
                  color="blue"
                />
                <StatCard
                  emoji="⚡"
                  label="Active (7 days)"
                  value={summary.activeStudents7Days}
                  sub={summary.totalStudents > 0 ? `${Math.round((summary.activeStudents7Days / summary.totalStudents) * 100)}% of students` : '—'}
                  color="green"
                />
                <StatCard
                  emoji="📖"
                  label="Stories (30 days)"
                  value={summary.storiesLast30Days}
                  sub={`${summary.storiesLast7Days} this week`}
                  color="purple"
                />
                <StatCard
                  emoji="✅"
                  label="Onboarding Rate"
                  value={summary.totalStudents > 0 ? `${Math.round((summary.onboardedStudents / summary.totalStudents) * 100)}%` : '—'}
                  sub={`${summary.onboardedStudents}/${summary.totalStudents} students`}
                  color="amber"
                />
              </div>
            )}

            {/* Two-column layout: analytics table + sidebar charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Analytics table */}
              <div className="lg:col-span-2 glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <span>📊</span> Student Activity
                  </h2>
                  <button
                    onClick={loadAnalytics}
                    className="text-xs opacity-70 hover:opacity-100 border border-current/20 px-2.5 py-1 rounded-lg hover:bg-black/10 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
                {analytics.length === 0 ? (
                  <p className="opacity-50 text-sm p-4">No student data yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left opacity-60 border-b border-white/10 bg-white/[0.02]">
                          <th className="px-3 py-2.5 font-medium">Student</th>
                          <th className="px-3 py-2.5 font-medium">Level</th>
                          <th className="px-3 py-2.5 font-medium text-center">Status</th>
                          <th className="px-3 py-2.5 font-medium text-center">Total</th>
                          <th className="px-3 py-2.5 font-medium text-center">7d</th>
                          <th className="px-3 py-2.5 font-medium text-center">30d</th>
                          <th className="px-3 py-2.5 font-medium">Activity</th>
                          <th className="px-3 py-2.5 font-medium">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {analytics.map((a) => {
                          const maxStories = Math.max(...analytics.map((x) => x.totalStories), 1);
                          const pct = Math.round((a.totalStories / maxStories) * 100);
                          return (
                            <tr key={a.username} className="hover:bg-white/[0.04] transition-colors">
                              <td className="px-3 py-2 font-medium text-gray-200">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-gray-500">👤</span>
                                  {a.username}
                                </span>
                                {a.favoriteGenres && a.favoriteGenres.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {a.favoriteGenres.slice(0, 2).map((g) => (
                                      <span key={g} className="text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded-full leading-none">{g}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {a.readingLevel ? (
                                  <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap">
                                    {a.readingLevel}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {a.onboardingCompleted ? (
                                  <span className="text-green-400 text-[10px]">✓</span>
                                ) : (
                                  <span className="text-yellow-500 text-[10px]">⏳</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center font-mono text-gray-200">{a.totalStories}</td>
                              <td className="px-3 py-2 text-center font-mono">
                                <span className={a.storiesLast7Days > 0 ? 'text-green-400' : 'text-gray-600'}>
                                  {a.storiesLast7Days}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center font-mono">
                                <span className={a.storiesLast30Days > 0 ? 'text-blue-400' : 'text-gray-600'}>
                                  {a.storiesLast30Days}
                                </span>
                              </td>
                              <td className="px-3 py-2 w-20">
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden w-full">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                {a.lastActiveAt ? new Date(a.lastActiveAt).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sidebar: reading level distribution + top genres */}
              <div className="space-y-4">
                {summary && Object.keys(summary.readingLevelDistribution).length > 0 && (
                  <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-4 shadow-xl">
                    <h3 className="text-sm font-semibold mb-3 opacity-90">Reading Levels</h3>
                    <div className="space-y-2">
                      {READING_LEVEL_VALUES.filter((lvl) => summary.readingLevelDistribution[lvl] > 0).map((lvl) => {
                        const count = summary.readingLevelDistribution[lvl];
                        const pct = Math.round((count / summary.totalStudents) * 100);
                        return (
                          <div key={lvl}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-400 truncate">{lvl}</span>
                              <span className="text-gray-300 ml-2 font-mono">{count}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {summary && summary.topGenres.length > 0 && (
                  <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-4 shadow-xl">
                    <h3 className="text-sm font-semibold mb-3 opacity-90">Top Genres</h3>
                    <div className="space-y-2">
                      {summary.topGenres.map(({ genre, count }) => {
                        const pct = Math.round((count / summary.topGenres[0].count) * 100);
                        return (
                          <div key={genre}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-400 truncate">{genre}</span>
                              <span className="text-gray-300 ml-2 font-mono">{count}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-purple-500/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quick stats */}
                {summary && (
                  <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-4 space-y-2 shadow-xl">
                    <h3 className="text-sm font-semibold mb-2 opacity-90">All Time</h3>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60">Total stories</span>
                      <span className="font-mono font-semibold">{summary.totalStories}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60">Active students (30d)</span>
                      <span className="font-mono font-semibold">{summary.activeStudents30Days}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-60">Avg stories/student</span>
                      <span className="font-mono font-semibold">
                        {summary.totalStudents > 0 ? (summary.totalStories / summary.totalStudents).toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STUDENTS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Management */}
            <div className="space-y-4">
              <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-5 space-y-4 shadow-xl">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span>👥</span> Manage Students
                </h2>

                {/* Student list */}
                {students.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Enrolled ({students.length})</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {students.map((s) => (
                        <li key={s.username} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-1.5 border border-white/10">
                          <span className="text-xs flex items-center gap-1.5">
                            👤 {s.username}
                            {s.readingLevel && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded-full leading-none">
                                {s.readingLevel}
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => handleDeleteStudent(s.username)}
                            className="text-[10px] text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-0.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Add student form */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Add student</p>
                  <form onSubmit={handleAddStudent} className="flex gap-2">
                    <input
                      type="text"
                      value={newStudentUsername}
                      onChange={(e) => setNewStudentUsername(e.target.value)}
                      placeholder="Username"
                      className="flex-1 bg-white/5 border border-white/20 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                    />
                    <input
                      type="password"
                      value={newStudentPassword}
                      onChange={(e) => setNewStudentPassword(e.target.value)}
                      placeholder="Password"
                      className="flex-1 bg-white/5 border border-white/20 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                    />
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-xl transition-colors text-xs whitespace-nowrap"
                    >
                      Add
                    </button>
                  </form>
                </div>

                {/* CSV import */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Import CSV <span className="text-gray-600">(username,password,reading_level)</span></p>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      onChange={handleCsvFileChange}
                      className="text-xs text-gray-400 file:mr-2 file:py-0.5 file:px-2 file:rounded-lg file:border file:border-white/20 file:bg-white/5 file:text-gray-300 file:text-xs hover:file:bg-white/10"
                    />
                  </div>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={3}
                    placeholder={"alice,pass123,Elementary\nbob,pass456,Middle School"}
                    className="w-full bg-white/5 border border-white/20 rounded-xl p-2.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500 font-mono"
                  />
                  <button
                    onClick={handleCsvImport}
                    disabled={csvImporting || !csvText.trim()}
                    className="mt-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-1.5 rounded-xl transition-colors disabled:opacity-50 text-xs"
                  >
                    {csvImporting ? 'Importing…' : 'Import CSV'}
                  </button>
                </div>

                {studentError && <p className="text-red-400 text-xs">{studentError}</p>}
                {studentSuccess && <p className="text-green-400 text-xs">✓ {studentSuccess}</p>}
              </div>

              {/* Teacher management (admin only) */}
              <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-5 space-y-4 shadow-xl">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span>👩‍🏫</span> Teachers
                </h2>

                {teachers.length > 0 && (
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {teachers.map((t) => (
                      <li key={t.username} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">👩‍🏫 {t.username}</span>
                          <button
                            onClick={() => handleDeleteTeacher(t.username)}
                            className="text-[10px] text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-0.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        {Object.keys(classrooms).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(classrooms).map(([id, cfg]) => (
                              <label key={id} className="flex items-center gap-1 text-[10px] cursor-pointer select-none text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={t.managedClassroomIds.includes(id)}
                                  onChange={() => {
                                    const next = t.managedClassroomIds.includes(id)
                                      ? t.managedClassroomIds.filter((c) => c !== id)
                                      : [...t.managedClassroomIds, id];
                                    handleUpdateTeacherClassrooms(t.username, next);
                                  }}
                                  className="w-3 h-3 rounded accent-indigo-400"
                                />
                                {cfg.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={handleAddTeacher} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTeacherUsername}
                      onChange={(e) => setNewTeacherUsername(e.target.value)}
                      placeholder="Username"
                      className="flex-1 bg-white/5 border border-white/20 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                    />
                    <input
                      type="password"
                      value={newTeacherPassword}
                      onChange={(e) => setNewTeacherPassword(e.target.value)}
                      placeholder="Password"
                      className="flex-1 bg-white/5 border border-white/20 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                    />
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-xl transition-colors text-xs whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                  {Object.keys(classrooms).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(classrooms).map(([id, cfg]) => (
                        <label key={id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-gray-300">
                          <input
                            type="checkbox"
                            checked={newTeacherClassroomIds.includes(id)}
                            onChange={() =>
                              setNewTeacherClassroomIds((prev) =>
                                prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
                              )
                            }
                            className="w-3.5 h-3.5 rounded accent-indigo-400"
                          />
                          {cfg.name}
                        </label>
                      ))}
                    </div>
                  )}
                </form>

                {teacherError && <p className="text-red-400 text-xs">{teacherError}</p>}
                {teacherSuccess && <p className="text-green-400 text-xs">✓ {teacherSuccess}</p>}
              </div>
            </div>

            {/* Right: Student onboarding settings */}
            <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 overflow-hidden shadow-xl">
              <div className="px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span>🎓</span> Student Settings
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Override reading level, maturity, and blocked topics per student.</p>
              </div>
              {settingsMsg && (
                <p className={`text-xs px-4 pt-2 ${settingsMsg.includes('fail') || settingsMsg.includes('must') ? 'text-red-400' : 'text-green-400'}`}>
                  {settingsMsg.includes('fail') || settingsMsg.includes('must') ? settingsMsg : `✓ ${settingsMsg}`}
                </p>
              )}
              {students.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No students enrolled yet.</p>
              ) : (
                <div className="divide-y divide-white/[0.04] overflow-y-auto max-h-[600px]">
                  {students.map((s) => (
                    <StudentSettingsRow
                      key={s.username}
                      student={s}
                      saving={settingsSaving && editingSettings === s.username}
                      globalMin={effectiveGlobalMin}
                      globalMax={effectiveGlobalMax}
                      onSave={(rl, reset, maturityLevel, blockedTopics) => {
                        setEditingSettings(s.username);
                        handleSaveStudentSettings(s.username, rl, reset, maturityLevel, blockedTopics);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CLASSROOMS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'classrooms' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={newClassroomName}
                onChange={(e) => setNewClassroomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddClassroom(); } }}
                placeholder="New classroom name"
                className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
              />
              <button
                onClick={handleAddClassroom}
                disabled={!newClassroomName.trim()}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                Add Classroom
              </button>
            </div>

            {Object.keys(classrooms).length === 0 ? (
              <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-8 text-center opacity-60 text-sm shadow-xl">
                No classrooms yet.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(classrooms).map(([id, cfg]) => (
                  <ClassroomRow
                    key={id}
                    id={id}
                    config={cfg}
                    allStudents={students.map((s) => s.username)}
                    globalMin={effectiveGlobalMin}
                    globalMax={effectiveGlobalMax}
                    onChange={(patch) => updateClassroom(id, patch)}
                    onDelete={() => handleDeleteClassroom(id)}
                    canDelete={true}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveClassrooms}
                disabled={classroomsSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {classroomsSaving ? 'Saving…' : 'Save Classrooms'}
              </button>
              {classroomsSaved && <span className="text-green-400 text-sm">✓ Saved!</span>}
            </div>
          </div>
        )}

        {/* ── SAFETY TAB ───────────────────────────────────────────────── */}
        {activeTab === 'safety' && (
          <div className="max-w-2xl space-y-5">
            <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-5 space-y-5 shadow-xl">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span>🛡️</span> Global Safety Defaults
              </h2>
              <p className="text-xs text-gray-400">
                School-wide defaults for content maturity and topic blocking. These apply to every student unless overridden by a classroom or per-student setting.
              </p>

              <div>
                <h3 className="text-xs font-medium text-gray-400 mb-2">Allowed maturity level range</h3>
                <MaturityRangePicker
                  min={globalSafety.maturityLevelRange?.min ?? MATURITY_LEVEL_MIN}
                  max={globalSafety.maturityLevelRange?.max ?? MATURITY_LEVEL_MAX}
                  onChange={(min, max) =>
                    setGlobalSafety((prev) => ({ ...prev, maturityLevelRange: { min, max } }))
                  }
                />
              </div>

              <div>
                <h3 className="text-xs font-medium text-gray-400 mb-2">Default maturity level</h3>
                <MaturitySlider
                  value={globalSafety.contentMaturityLevel ?? MATURITY_LEVEL_DEFAULT}
                  min={globalSafety.maturityLevelRange?.min ?? MATURITY_LEVEL_MIN}
                  max={globalSafety.maturityLevelRange?.max ?? MATURITY_LEVEL_MAX}
                  onChange={(v) => setGlobalSafety((prev) => ({ ...prev, contentMaturityLevel: v }))}
                />
              </div>

              <div>
                <h3 className="text-xs font-medium text-gray-400 mb-2">Globally blocked topics</h3>
                <BlockedTopicsPicker
                  value={globalSafety.blockedTopics ?? []}
                  onChange={(topics) => setGlobalSafety((prev) => ({ ...prev, blockedTopics: topics }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveGlobalSafety}
                  disabled={globalSafetySaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {globalSafetySaving ? 'Saving…' : 'Save Safety Settings'}
                </button>
                {globalSafetySaved && <span className="text-green-400 text-sm">✓ Saved!</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── CONFIG TAB (admin only) ───────────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* API Configuration */}
            <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-5 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span>🔌</span> API Configuration
              </h2>

              <div>
                <label className="block text-xs text-gray-400 mb-1">OpenAI-compatible base URL <span className="text-gray-600">(blank = api.openai.com)</span></label>
                <input
                  type="url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Model <span className="text-gray-600">(blank = gpt-4o-mini)</span></label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Local .safetensors model <span className="text-gray-600">(overrides API when set)</span></label>
                <input
                  type="text"
                  value={localModelId}
                  onChange={(e) => setLocalModelId(e.target.value)}
                  placeholder="e.g. facebook/opt-125m  or  /data/models/my-llm"
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
                  placeholder="Enter the system prompt for story generation…"
                />
              </div>

              <div>
                <h3 className="text-xs font-medium text-gray-400 mb-2">Onboarding reading level range</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Minimum</label>
                    <select
                      value={rlRangeMin}
                      onChange={(e) => setRlRangeMin(e.target.value as ReadingLevel)}
                      className="bg-white/10 border border-white/20 rounded-xl px-2 py-1.5 text-xs"
                    >
                      {READING_LEVEL_VALUES.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-500 text-sm">→</span>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Maximum</label>
                    <select
                      value={rlRangeMax}
                      onChange={(e) => setRlRangeMax(e.target.value as ReadingLevel)}
                      className="bg-white/10 border border-white/20 rounded-xl px-2 py-1.5 text-xs"
                    >
                      {READING_LEVEL_VALUES.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {rlRangeError && <p className="text-red-400 text-xs mt-1">{rlRangeError}</p>}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
                {saved && <span className="text-green-400 text-sm">✓ Saved!</span>}
              </div>
            </div>

            {/* Student Config Locks */}
            <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 p-5 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span>🔒</span> Student Configuration Locks
              </h2>
              <p className="text-xs text-gray-400">Lock story options for individual students.</p>

              {studentUsernames.length === 0 ? (
                <p className="text-gray-500 text-xs">No students yet.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {studentUsernames.map((username) => {
                    const cfg = getUserCfg(username);
                    const locked = cfg.lockedFields ?? [];
                    const defaults = cfg.defaults ?? {};

                    return (
                      <div key={username} className="border border-white/10 rounded-xl p-3 space-y-2">
                        <h3 className="text-xs font-medium">👤 {username}</h3>
                        <div className="grid grid-cols-1 gap-1.5">
                          {LOCKABLE_FIELDS.map(({ key, label }) => {
                            const isLocked = locked.includes(key);
                            return (
                              <div key={key} className="flex items-center gap-3 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer min-w-[160px]">
                                  <input
                                    type="checkbox"
                                    checked={isLocked}
                                    onChange={() => toggleLock(username, key)}
                                    className="w-3.5 h-3.5 rounded accent-yellow-400"
                                  />
                                  <span className="text-xs text-gray-300">{label}</span>
                                </label>

                                {isLocked && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-500">Default:</span>
                                    {key === 'chapterCount' && (
                                      <input
                                        type="number"
                                        min={1}
                                        value={(defaults.chapterCount as number | undefined) ?? 1}
                                        onChange={(e) => setDefaultValue(username, key, Number(e.target.value))}
                                        className="w-14 bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-xs text-center"
                                      />
                                    )}
                                    {key === 'readingComplexity' && (
                                      <select
                                        value={defaults.readingComplexity ?? 'intermediate'}
                                        onChange={(e) => setDefaultValue(username, key, e.target.value)}
                                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-xs"
                                      >
                                        <option value="simple">Simple</option>
                                        <option value="intermediate">Intermediate</option>
                                        <option value="advanced">Advanced</option>
                                      </select>
                                    )}
                                    {key === 'vocabularyComplexity' && (
                                      <select
                                        value={defaults.vocabularyComplexity ?? 'intermediate'}
                                        onChange={(e) => setDefaultValue(username, key, e.target.value)}
                                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-xs"
                                      >
                                        <option value="basic">Basic</option>
                                        <option value="intermediate">Intermediate</option>
                                        <option value="advanced">Advanced</option>
                                      </select>
                                    )}
                                    {key === 'genre' && (
                                      <select
                                        value={defaults.genre ?? ''}
                                        onChange={(e) => setDefaultValue(username, key, e.target.value)}
                                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-xs"
                                      >
                                        <option value="">Any</option>
                                        {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Locks'}
                </button>
                {saved && <span className="text-green-400 text-sm">✓ Saved!</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTENT TAB (admin only) ──────────────────────────────────── */}
        {activeTab === 'content' && (
          <div className="space-y-5">
            {/* Recordings */}
            <div className="glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 overflow-hidden shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span>🎙️</span> Reading Recordings ({recordings.length})
                </h2>
                <button
                  onClick={() => loadRecordings(stories)}
                  className="text-xs text-gray-400 hover:text-white border border-white/20 px-2.5 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Refresh
                </button>
              </div>
              {recordings.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No recordings yet. Students record themselves reading in the book reader.</p>
              ) : (
                <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
                  {Object.entries(
                    recordings.reduce<Record<string, typeof recordings>>((acc, r) => {
                      if (!acc[r.username]) acc[r.username] = [];
                      acc[r.username].push(r);
                      return acc;
                    }, {}),
                  ).map(([username, recs]) => (
                    <div key={username}>
                      <div className="px-4 py-2 bg-white/[0.03] text-xs font-medium text-gray-300 flex items-center gap-2">
                        👤 {username}
                        <span className="text-gray-500">{recs.length} recording{recs.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="px-4 pb-3 pt-2 space-y-1.5">
                        {recs.map((rec) => {
                          const story = stories.find((s) => s.id === rec.storyId);
                          return (
                            <div key={rec.id} className="flex flex-wrap items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-1.5 border border-white/10">
                              <div className="text-xs text-gray-400 space-y-0.5 flex-shrink-0">
                                <p className="font-medium text-gray-200 truncate max-w-[180px]">
                                  {story?.title || story?.request.slice(0, 35) || rec.storyId.slice(0, 8)}
                                </p>
                                <p>Page {rec.pageNumber + 1} · {new Date(rec.createdAt).toLocaleDateString()}</p>
                              </div>
                              <audio
                                src={`/api/stories/${rec.storyId}/recordings/${rec.id}`}
                                controls
                                className="flex-1 h-7 min-w-[160px]"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All stories */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span>📚</span> All Generated Stories ({stories.length})
              </h2>
              {stories.length === 0 ? (
                <div className="opacity-60 text-center py-12 glass-shimmer relative bg-white/[0.05] backdrop-blur-xl rounded-3xl border border-white/15 shadow-xl">
                  No stories yet. Students will generate them from their dashboard.
                </div>
              ) : (
                <div className="space-y-3">
                  {stories.map((s) => (
                    <StoryCard
                      key={s.id}
                      story={s}
                      showUser
                      onUpdated={(updated) =>
                        setStories((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
    </ThemeWrapper>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  emoji,
  label,
  value,
  sub,
  color,
}: {
  emoji: string;
  label: string;
  value: number | string;
  sub: string;
  color: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colorMap = {
    blue: 'from-blue-500/15 to-blue-500/5 border-blue-400/25 text-blue-300',
    green: 'from-emerald-500/15 to-emerald-500/5 border-emerald-400/25 text-emerald-300',
    purple: 'from-purple-500/15 to-purple-500/5 border-purple-400/25 text-purple-300',
    amber: 'from-amber-500/15 to-amber-500/5 border-amber-400/25 text-amber-300',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">{emoji}</span>
        <span className="text-xs opacity-70 font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="text-xs opacity-60 mt-1">{sub}</div>
    </div>
  );
}

// ── Reusable sub-components ─────────────────────────────────────────────────

const MATURITY_LEVEL_COLORS: Record<number, string> = {
  1: '#4ade80',
  2: '#34d399',
  3: '#60a5fa',
  4: '#818cf8',
  5: '#c084fc',
  6: '#f87171',
};

function MaturitySlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const info = MATURITY_LEVEL_INFO[value] ?? MATURITY_LEVEL_INFO[MATURITY_LEVEL_DEFAULT];
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const color = MATURITY_LEVEL_COLORS[value] ?? '#818cf8';
  const thumbPct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const gradientStops = ticks
    .map((n) => `${MATURITY_LEVEL_COLORS[n] ?? '#818cf8'} ${((n - min) / Math.max(max - min, 1)) * 100}%`)
    .join(', ');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full transition-colors duration-200"
          style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
        >
          {info.emoji} {info.label}
        </span>
        {value === MATURITY_LEVEL_MAX && (
          <span className="text-xs bg-red-500/20 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-full">
            No restrictions
          </span>
        )}
      </div>

      <div className="relative h-10 flex items-center">
        <div
          className="absolute inset-x-0 h-3 rounded-full pointer-events-none"
          style={{ background: `linear-gradient(to right, ${gradientStops})` }}
        />
        <div
          className="absolute right-0 h-3 rounded-r-full bg-black/50 pointer-events-none transition-all duration-150"
          style={{ left: `${thumbPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-x-0 w-full h-3 opacity-0 cursor-pointer z-10"
          style={{ height: '40px', top: 0 }}
        />
        <div
          className="absolute w-6 h-6 rounded-full bg-white shadow-lg pointer-events-none -translate-x-1/2 transition-all duration-150"
          style={{
            left: `${thumbPct}%`,
            boxShadow: `0 0 0 3px ${color}, 0 4px 12px ${color}80`,
          }}
        />
      </div>

      <div className={`flex mt-1 ${ticks.length > 1 ? 'justify-between' : 'justify-start'}`}>
        {ticks.map((n) => {
          const isSelected = value === n;
          const c = MATURITY_LEVEL_COLORS[n] ?? '#818cf8';
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="flex flex-col items-center gap-0.5 transition-all duration-150 focus:outline-none"
              style={{ flex: '1 1 0', minWidth: 0 }}
            >
              <span
                className="text-base leading-none transition-all duration-150"
                style={isSelected ? { filter: `drop-shadow(0 0 4px ${c})`, transform: 'scale(1.25)' } : { opacity: 0.5 }}
              >
                {MATURITY_LEVEL_INFO[n]?.emoji}
              </span>
              <span
                className="text-[10px] leading-tight text-center transition-colors duration-150 mt-0.5"
                style={isSelected ? { color: c, fontWeight: 700 } : { color: 'rgba(255,255,255,0.35)' }}
              >
                {MATURITY_LEVEL_INFO[n]?.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">{info.description}</p>
    </div>
  );
}

function MaturityRangePicker({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const minInfo = MATURITY_LEVEL_INFO[min];
  const maxInfo = MATURITY_LEVEL_INFO[max];
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs text-gray-400 mb-1">
          Minimum allowed: <span className="text-purple-300">{minInfo?.emoji} {minInfo?.label}</span>
        </label>
        <input
          type="range"
          min={MATURITY_LEVEL_MIN}
          max={max}
          step={1}
          value={min}
          onChange={(e) => onChange(Number(e.target.value), max)}
          className="w-full accent-purple-500 cursor-pointer"
        />
      </div>
      <span className="text-gray-500 text-sm">→</span>
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs text-gray-400 mb-1">
          Maximum allowed: <span className="text-purple-300">{maxInfo?.emoji} {maxInfo?.label}</span>
          {max === MATURITY_LEVEL_MAX && (
            <span className="ml-1 text-red-400">(includes None)</span>
          )}
        </label>
        <input
          type="range"
          min={min}
          max={MATURITY_LEVEL_MAX}
          step={1}
          value={max}
          onChange={(e) => onChange(min, Number(e.target.value))}
          className="w-full accent-purple-500 cursor-pointer"
        />
      </div>
    </div>
  );
}

function BlockedTopicsPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (topics: string[]) => void;
}) {
  const predefinedSet = new Set(PREDEFINED_BLOCKED_TOPICS as readonly string[]);
  const customTopics = value.filter((t) => !predefinedSet.has(t));
  const [customInput, setCustomInput] = useState(customTopics.join(', '));

  function toggleTopic(topic: string) {
    const next = value.includes(topic) ? value.filter((t) => t !== topic) : [...value, topic];
    onChange(next);
  }

  function handleCustomChange(raw: string) {
    setCustomInput(raw);
    const custom = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const predefined = value.filter((t) => predefinedSet.has(t));
    onChange([...predefined, ...custom]);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PREDEFINED_BLOCKED_TOPICS.map((topic) => (
          <label key={topic} className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={value.includes(topic)}
              onChange={() => toggleTopic(topic)}
              className="w-4 h-4 rounded accent-red-400"
            />
            <span>{topic}</span>
          </label>
        ))}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Additional custom topics (comma-separated)</label>
        <input
          type="text"
          value={customInput}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="e.g. Astrology, Crypto, Social Drama"
          className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-100 placeholder-gray-500"
        />
      </div>
    </div>
  );
}

// ── Classroom row ────────────────────────────────────────────────────────────

interface ClassroomRowProps {
  id: string;
  config: ClassroomConfig;
  allStudents: string[];
  globalMin: number;
  globalMax: number;
  onChange: (patch: Partial<ClassroomConfig>) => void;
  onDelete: () => void;
  canDelete?: boolean;
}

function ClassroomRow({ config, allStudents, globalMin, globalMax, onChange, onDelete, canDelete = true }: ClassroomRowProps) {
  const [expanded, setExpanded] = useState(false);
  const effectiveMin = Math.max(globalMin, config.maturityLevelRange?.min ?? globalMin);
  const effectiveMax = Math.min(globalMax, config.maturityLevelRange?.max ?? globalMax);

  function toggleMember(username: string) {
    const members = config.members.includes(username)
      ? config.members.filter((m) => m !== username)
      : [...config.members, username];
    onChange({ members });
  }

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          🏫 <span className="font-bold">{config.name}</span>
          <span className="text-xs text-gray-400">
            {config.members.length} student{config.members.length !== 1 ? 's' : ''}
          </span>
          {config.contentMaturityLevel !== undefined && (
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded-full">
              {MATURITY_LEVEL_INFO[config.contentMaturityLevel]?.emoji} {MATURITY_LEVEL_INFO[config.contentMaturityLevel]?.label}
            </span>
          )}
          {config.blockedTopics && config.blockedTopics.length > 0 && (
            <span className="text-xs bg-red-500/20 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-full">
              🚫 {config.blockedTopics.length} blocked
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 space-y-5 border-t border-white/10 pt-4">
          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">Members</h4>
            {allStudents.length === 0 ? (
              <p className="text-xs text-gray-500">No students enrolled yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allStudents.map((username) => (
                  <label key={username} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input
                      type="checkbox"
                      checked={config.members.includes(username)}
                      onChange={() => toggleMember(username)}
                      className="w-4 h-4 rounded accent-indigo-400"
                    />
                    <span>👤 {username}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">Allowed maturity range</h4>
            <MaturityRangePicker
              min={effectiveMin}
              max={effectiveMax}
              onChange={(min, max) => {
                const clampedMin = Math.max(globalMin, min);
                const clampedMax = Math.min(globalMax, max);
                onChange({ maturityLevelRange: { min: clampedMin, max: clampedMax } });
              }}
            />
          </div>

          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">Default maturity level</h4>
            <MaturitySlider
              value={config.contentMaturityLevel ?? effectiveMin}
              min={effectiveMin}
              max={effectiveMax}
              onChange={(v) => onChange({ contentMaturityLevel: v })}
            />
          </div>

          <div>
            <h4 className="text-xs font-medium text-gray-400 mb-2">Blocked topics</h4>
            <BlockedTopicsPicker
              value={config.blockedTopics ?? []}
              onChange={(topics) => onChange({ blockedTopics: topics })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-student settings row ─────────────────────────────────────────────────

interface StudentSettingsRowProps {
  student: StudentInfo;
  saving: boolean;
  globalMin: number;
  globalMax: number;
  onSave: (
    readingLevel: ReadingLevel | null,
    resetOnboarding: boolean,
    contentMaturityLevel: number,
    blockedTopics: string[],
  ) => void;
}

function StudentSettingsRow({ student, saving, globalMin, globalMax, onSave }: StudentSettingsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [readingLevel, setReadingLevel] = useState<ReadingLevel | ''>(student.readingLevel ?? '');
  const [resetOnboarding, setResetOnboarding] = useState(false);
  const [maturityLevel, setMaturityLevel] = useState<number>(
    Math.min(Math.max(student.contentMaturityLevel ?? MATURITY_LEVEL_DEFAULT, globalMin), globalMax),
  );
  const [blockedTopics, setBlockedTopics] = useState<string[]>(student.blockedTopics ?? []);

  const maturityInfo = MATURITY_LEVEL_INFO[maturityLevel] ?? MATURITY_LEVEL_INFO[MATURITY_LEVEL_DEFAULT];

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium flex-wrap">
          <span className="text-gray-500">👤</span>
          <span className="text-gray-200">{student.username}</span>
          {student.readingLevel && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded-full leading-none">
              {student.readingLevel}
            </span>
          )}
          <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-400/30 px-1.5 py-0.5 rounded-full leading-none">
            {maturityInfo.emoji} {maturityInfo.label}
          </span>
          {blockedTopics.length > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-400/30 px-1.5 py-0.5 rounded-full leading-none">
              🚫 {blockedTopics.length}
            </span>
          )}
          {student.onboardingCompleted ? (
            <span className="text-[10px] text-green-400">✓</span>
          ) : (
            <span className="text-[10px] text-yellow-400">⏳</span>
          )}
        </span>
        <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Override reading level</label>
              <select
                value={readingLevel}
                onChange={(e) => setReadingLevel(e.target.value as ReadingLevel | '')}
                className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs"
              >
                <option value="">(keep current)</option>
                {READING_LEVEL_VALUES.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-5">
              <input
                type="checkbox"
                checked={resetOnboarding}
                onChange={(e) => setResetOnboarding(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-yellow-400"
              />
              Reset onboarding
            </label>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Content maturity</label>
            <MaturitySlider
              value={maturityLevel}
              min={globalMin}
              max={globalMax}
              onChange={setMaturityLevel}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Additional blocked topics <span className="text-gray-600">(merged with classroom &amp; global)</span>
            </label>
            <BlockedTopicsPicker value={blockedTopics} onChange={setBlockedTopics} />
          </div>

          <button
            onClick={() => onSave(readingLevel || null, resetOnboarding, maturityLevel, blockedTopics)}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-1.5 rounded-xl transition-colors disabled:opacity-50 text-xs"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
