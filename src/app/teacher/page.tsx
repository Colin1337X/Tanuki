'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Brand from '@/components/Brand';
import ThemeWrapper from '@/components/ThemeWrapper';
import ThemePicker from '@/components/ThemePicker';
import { ClassroomConfig } from '@/lib/storage';
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

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentInfo {
  username: string;
  readingLevel?: ReadingLevel;
  onboardingCompleted?: boolean;
  preferences?: { theme?: string; favoriteGenres?: string[] };
  contentMaturityLevel?: number;
  blockedTopics?: string[];
}

type TeacherTab = 'overview' | 'students' | 'classrooms';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');

  // Classrooms (only the teacher's assigned ones)
  const [classrooms, setClassrooms] = useState<Record<string, ClassroomConfig>>({});
  const [classroomsSaving, setClassroomsSaving] = useState(false);
  const [classroomsSaved, setClassroomsSaved] = useState(false);

  // Students in managed classrooms
  const [students, setStudents] = useState<StudentInfo[]>([]);

  // Analytics
  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  // Per-student settings
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
    }
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
    const meData = meRes.ok ? await meRes.json() : null;
    const role = meData?.user?.role as string | undefined;
    if (role === 'admin') { router.push('/admin'); return; }
    if (role !== 'teacher') { router.push('/login'); return; }

    const cfg = await cfgRes.json();
    setClassrooms(cfg.classrooms ?? {});
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

  async function handleSaveClassrooms() {
    setClassroomsSaving(true);
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classrooms }),
    });
    setClassroomsSaving(false);
    setClassroomsSaved(true);
    setTimeout(() => setClassroomsSaved(false), 2000);
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

  const tabs: { id: TeacherTab; label: string; emoji: string }[] = [
    { id: 'overview', label: 'Overview', emoji: '📊' },
    { id: 'students', label: 'Students', emoji: '👥' },
    { id: 'classrooms', label: 'Classrooms', emoji: '🏫' },
  ];

  return (
    <ThemeWrapper><div className="educator-workspace min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-3 flex justify-between items-center backdrop-blur-sm bg-white/5">
        <div className="flex items-center gap-3">
          <Brand />
        </div>
        <div className="flex gap-2 items-center"><ThemePicker /><button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-white transition-colors border border-white/20 px-3 py-1.5 rounded-xl hover:bg-white/10"
        >
          Logout
        </button></div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-white/10 bg-white/[0.03] px-4">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-white/30'
              }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4">
        <section className="educator-welcome"><span className="eyebrow">TEACHING WORKSPACE</span><h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1><p className="muted">Big imaginations begin with a little encouragement.</p></section>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
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

            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span>📊</span> Student Activity
                </h2>
                <button
                  onClick={loadAnalytics}
                  className="text-xs text-gray-400 hover:text-white border border-white/20 px-2.5 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Refresh
                </button>
              </div>
              {analytics.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No student data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-white/10 bg-white/[0.02]">
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
          </div>
        )}

        {/* ── STUDENTS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
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
              <p className="text-gray-500 text-sm p-4">No students in your classrooms yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.04] overflow-y-auto max-h-[600px]">
                {students.map((s) => (
                  <StudentSettingsRow
                    key={s.username}
                    student={s}
                    saving={settingsSaving && editingSettings === s.username}
                    globalMin={MATURITY_LEVEL_MIN}
                    globalMax={MATURITY_LEVEL_MAX}
                    onSave={(rl, reset, maturityLevel, blockedTopics) => {
                      setEditingSettings(s.username);
                      handleSaveStudentSettings(s.username, rl, reset, maturityLevel, blockedTopics);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CLASSROOMS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'classrooms' && (
          <div className="space-y-4">
            {Object.keys(classrooms).length === 0 ? (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-8 text-center text-gray-500 text-sm">
                No classrooms assigned to your account yet. Ask your administrator to assign you classrooms.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(classrooms).map(([id, cfg]) => (
                  <ClassroomRow
                    key={id}
                    id={id}
                    config={cfg}
                    allStudents={students.map((s) => s.username)}
                    globalMin={MATURITY_LEVEL_MIN}
                    globalMax={MATURITY_LEVEL_MAX}
                    onChange={(patch) => updateClassroom(id, patch)}
                    canDelete={false}
                  />
                ))}
              </div>
            )}

            {Object.keys(classrooms).length > 0 && (
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
            )}
          </div>
        )}

      </main>
    </div></ThemeWrapper>
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
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{emoji}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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

// ── Classroom row ─────────────────────────────────────────────────────────────

interface ClassroomRowProps {
  id: string;
  config: ClassroomConfig;
  allStudents: string[];
  globalMin: number;
  globalMax: number;
  onChange: (patch: Partial<ClassroomConfig>) => void;
  onDelete?: () => void;
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
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
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
              <p className="text-xs text-gray-500">No students in your classrooms yet.</p>
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

// ── Per-student settings row ──────────────────────────────────────────────────

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
