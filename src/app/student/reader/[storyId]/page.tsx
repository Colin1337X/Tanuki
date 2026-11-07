'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ThemeWrapper from '@/components/ThemeWrapper';
import ThemeSelector, { Theme, VALID_THEMES } from '@/components/ThemeSelector';
import { Story, StoryPlan } from '@/lib/storage';
import { confirmUnauthenticated } from '@/lib/client-auth';

interface Recording {
  id: string;
  storyId: string;
  username: string;
  pageNumber: number;
  filename: string;
  createdAt: string;
}

/** Counts words in a string. */
function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/** Splits story text into pages of roughly `wordsPerPage` words, breaking at paragraphs. */
function paginateStory(text: string, wordsPerPage = 450): string[] {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const pages: string[] = [];
  let current = '';
  let currentWords = 0;
  for (const para of paragraphs) {
    const paraWords = countWords(para);
    if (current && currentWords + paraWords > wordsPerPage) {
      pages.push(current.trim());
      current = para;
      currentWords = paraWords;
    } else {
      current = current ? `${current}\n\n${para}` : para;
      currentWords += paraWords;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages.length > 0 ? pages : [text];
}


const PLAN_LABELS: { key: keyof StoryPlan; label: string }[] = [
  { key: 'exposition',    label: '🌅 Exposition' },
  { key: 'risingAction',  label: '⬆️ Rising Action' },
  { key: 'climax',        label: '⚡ Climax' },
  { key: 'fallingAction', label: '⬇️ Falling Action' },
  { key: 'resolution',    label: '🌈 Resolution' },
];

export default function ReaderPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const router = useRouter();

  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Theme state
  const [theme, setThemeState] = useState<Theme>('studio');

  // Recording state
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Chapter-based streaming state
  type StreamState = 'idle' | 'streaming' | 'done';
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [streamError, setStreamError] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Track pages length before a new chapter starts so we can jump to it
  const pagesLenBeforeStreamRef = useRef(0);
  // Stable ref to the latest streamNextChapter function (avoids stale closures in effects)
  const streamNextChapterRef = useRef<(revision?: string) => Promise<void>>(() => Promise.resolve());
  // How many more chapters should auto-stream after the current one finishes
  const autoAdvanceRef = useRef(0);

  // Extend-story state
  const [extendCount, setExtendCount] = useState(1);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState('');

  const isChapterBased = (s: Story) => Array.isArray(s.chapters);

  const loadStory = useCallback(async () => {
    setLoading(true);
    setError('');
    let res = await fetch(`/api/stories/${storyId}`);
    if (res.status === 401) {
      // On iOS/iPadOS the httpOnly session cookie written by the login fetch
      // may not be flushed to the cookie jar before the first in-page requests
      // fire after window.location.replace. Retry once after a brief delay.
      await new Promise((r) => setTimeout(r, 500));
      res = await fetch(`/api/stories/${storyId}`);
      if (res.status === 401) {
        if (await confirmUnauthenticated()) router.push('/login');
        return;
      }
    }
    if (!res.ok) { setError('Story not found.'); setLoading(false); return; }
    const data: Story = await res.json();
    setStory(data);
    if (isChapterBased(data)) {
      setPages(data.chapters && data.chapters.length > 0 ? paginateStory(data.chapters.join('\n\n')) : []);
    } else {
      setPages(paginateStory(data.story));
    }
    setLoading(false);
  }, [storyId, router]);

  const loadRecordings = useCallback(async () => {
    const res = await fetch(`/api/stories/${storyId}/recordings`);
    if (res.ok) {
      const data = await res.json();
      setRecordings(Array.isArray(data) ? data : []);
    }
  }, [storyId]);

  useEffect(() => {
    loadStory();
    loadRecordings();
  }, [loadStory, loadRecordings]);

  // Initialise theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('tanuki_theme') as Theme | null;
    if (saved && VALID_THEMES.includes(saved)) setThemeState(saved);
  }, []);

  // Auto-start streaming the first chapter when a new chapter-based story loads
  useEffect(() => {
    if (!story || !isChapterBased(story)) return;
    if (story.generationComplete) return;
    if ((story.chapters ?? []).length === 0 && streamState === 'idle') {
      // Auto-advance through all planned chapters without manual button presses
      autoAdvanceRef.current = (story.options?.chapterCount ?? 1) - 1;
      streamNextChapterRef.current();
    }
  // story?.id is the intentional dependency — we only want to fire when the story changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  function handleThemeChange(t: Theme) {
    setThemeState(t);
    localStorage.setItem('tanuki_theme', t);
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'tanuki_theme',
      newValue: t,
      storageArea: localStorage,
    }));
  }

  async function streamNextChapter(revision?: string) {
    if (!storyId) return;
    // Remember how many pages we had before this chapter
    pagesLenBeforeStreamRef.current = pages.length;
    setStreamState('streaming');
    setStreamingText('');
    setStreamError('');
    setShowRevisionInput(false);
    setRevisionNote('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/stories/${storyId}/chapter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionNote: revision ?? undefined }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Stream failed' }));
        setStreamError(err.error ?? 'Failed to generate chapter');
        setStreamState('idle');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreamError('Streaming not supported');
        setStreamState('idle');
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = '';
      let complete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.endsWith('\n\u0000DONE')) {
          accumulated += chunk.replace(/\n\u0000DONE$/, '');
          complete = true;
        } else {
          accumulated += chunk;
        }
        setStreamingText(accumulated.replace(/\n\u0000DONE$/, ''));
      }

      // Reload story to get updated chapters from server
      const updatedRes = await fetch(`/api/stories/${storyId}`);
      if (updatedRes.ok) {
        const updated: Story = await updatedRes.json();
        setStory(updated);
        if (isChapterBased(updated) && updated.chapters && updated.chapters.length > 0) {
          const newPages = paginateStory(updated.chapters.join('\n\n'));
          setPages(newPages);
          // Jump to the first page of the newly added chapter
          if (newPages.length > pagesLenBeforeStreamRef.current) {
            setPageIndex(pagesLenBeforeStreamRef.current);
          }
        }
        const isDone = complete || updated.generationComplete;
        setStreamingText('');
        if (isDone) {
          setStreamState('done');
        } else if (autoAdvanceRef.current > 0) {
          autoAdvanceRef.current -= 1;
          streamNextChapterRef.current();
        } else {
          setStreamState('idle');
        }
      } else {
        setStreamingText('');
        if (complete) {
          setStreamState('done');
        } else if (autoAdvanceRef.current > 0) {
          autoAdvanceRef.current -= 1;
          streamNextChapterRef.current();
        } else {
          setStreamState('idle');
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setStreamError('Streaming failed. Please try again.');
      setStreamState('idle');
    }
  }

  // Keep the ref pointing to the latest version of streamNextChapter
  useEffect(() => {
    streamNextChapterRef.current = streamNextChapter;
  });

  async function handleExtend() {
    if (!storyId) return;
    setExtending(true);
    setExtendError('');
    try {
      const res = await fetch(`/api/stories/${storyId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalChapters: extendCount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to extend story' }));
        setExtendError(err.error ?? 'Failed to extend story');
        return;
      }
      const updated: Story = await res.json();
      setStory(updated);
      // Auto-advance through all added chapters
      autoAdvanceRef.current = extendCount - 1;
      streamNextChapterRef.current();
    } catch {
      setExtendError('Failed to extend story. Please try again.');
    } finally {
      setExtending(false);
    }
  }

  // Recording helpers
  async function startRecording() {
    setRecordingError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadRecording(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setRecordingError('Microphone access denied or not available.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  async function uploadRecording(blob: Blob) {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    form.append('pageNumber', String(pageIndex));
    const res = await fetch(`/api/stories/${storyId}/recordings`, {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      await loadRecordings();
    } else {
      setRecordingError('Failed to save recording.');
    }
  }

  const pageRecordings = recordings.filter((r) => r.pageNumber === pageIndex);

  // ── Derived values ────────────────────────────────────────────────────────
  const chaptersDone = story?.chapters?.length ?? 0;
  const totalChapters = story?.options?.chapterCount ?? 1;
  const allChaptersGenerated = story?.generationComplete ?? !isChapterBased(story ?? {} as Story);
  const moreChaptersLeft = isChapterBased(story ?? {} as Story) && !allChaptersGenerated;

  if (loading) {
    return (
      <ThemeWrapper>
        <div className="min-h-screen flex items-center justify-center">
          <span className="text-lg opacity-60">Loading…</span>
        </div>
      </ThemeWrapper>
    );
  }

  if (error || !story) {
    return (
      <ThemeWrapper>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="text-red-400">{error || 'Story not found.'}</p>
          <button onClick={() => router.push('/student')} className="text-sm opacity-60 hover:opacity-100 border border-current/20 px-4 py-2 rounded-xl">
            ← Back
          </button>
        </div>
      </ThemeWrapper>
    );
  }

  return (
    <ThemeWrapper>
      <div className="reader-workspace min-h-screen flex flex-col">
        {/* Water progress bar — shown while streaming */}
        {streamState === 'streaming' && (
          <div className="water-progress-bar h-1.5 w-full" aria-label="Generating chapter…" role="progressbar" />
        )}

        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-white/10 px-4 sm:px-6 py-3.5 flex justify-between items-center gap-3 bg-white/[0.06] backdrop-blur-xl"
          style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.18)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/student')}
              className="text-sm opacity-60 hover:opacity-100 transition-opacity border border-current/20 px-3 py-2 rounded-xl hover:bg-black/10"
            >
              ← Back
            </button>
            <span className="text-2xl">📖</span>
            <h1 className="text-lg font-bold truncate max-w-[240px] sm:max-w-md">
              {story.title || story.request.slice(0, 60)}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSelector current={theme} onChange={handleThemeChange} />
            {pages.length > 0 && (
              <span className="text-sm opacity-50 whitespace-nowrap">
                Page {pageIndex + 1} / {pages.length}
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
          {/* Chapter progress indicator */}
          {isChapterBased(story) && (
            <div className="flex items-center justify-between text-xs opacity-60">
              <span>
                {allChaptersGenerated
                  ? `All ${totalChapters} chapter${totalChapters !== 1 ? 's' : ''} generated`
                  : streamState === 'streaming'
                    ? `Generating chapter ${chaptersDone + 1} of ${totalChapters}…`
                    : `Chapter ${chaptersDone} of ${totalChapters} generated`}
              </span>
              {story.plan && (
                <button
                  type="button"
                  onClick={() => setShowPlan((v) => !v)}
                  className="underline underline-offset-2 hover:opacity-100 transition-opacity"
                >
                  {showPlan ? 'Hide plan' : 'Show plan'}
                </button>
              )}
            </div>
          )}

          {/* Plan accordion */}
          {showPlan && story.plan && (
            <div className="bg-white/[0.05] rounded-2xl p-5 border border-white/10 space-y-3">
              <h3 className="text-sm font-semibold opacity-80">📝 Story Plan</h3>
              {PLAN_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-xs font-medium opacity-60 mb-0.5">{label}</p>
                  <p className="text-sm leading-relaxed">{story.plan![key]}</p>
                </div>
              ))}
            </div>
          )}

          {/* Streaming placeholder when first chapter hasn't arrived yet */}
          {streamState === 'streaming' && pages.length === 0 && !streamingText && (
            <div className="glass-shimmer relative bg-white/[0.07] backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/20 shadow-xl min-h-[200px] flex flex-col items-center justify-center gap-4"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 8px 32px rgba(0,0,0,0.2)' }}
            >
              <div className="water-progress-bar h-1 w-3/4 rounded-full" />
              <p className="text-sm opacity-50 animate-pulse">Writing your story…</p>
            </div>
          )}

          {/* Streaming text — shown while streaming a chapter */}
          {streamState === 'streaming' && streamingText && (
            <div className="glass-shimmer relative bg-indigo-500/[0.07] backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-indigo-400/20 shadow-xl"
              style={{ boxShadow: '0 0 0 1px rgba(99,102,241,0.1) inset, 0 8px 32px rgba(0,0,0,0.2)' }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent rounded-t-3xl" />
              <p className="text-xs font-medium text-indigo-300 mb-3 flex items-center gap-2">
                <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                Writing Chapter {chaptersDone + 1}…
              </p>
              <p className="reading-prose leading-relaxed whitespace-pre-wrap text-base">{streamingText}</p>
            </div>
          )}

          {/* Page content (existing chapters) */}
          {pages.length > 0 && streamState !== 'streaming' && (
            <div className="glass-shimmer relative bg-white/[0.07] backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/20 shadow-xl min-h-[320px]"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset, 0 8px 32px rgba(0,0,0,0.2)' }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-3xl" />
              <p className="reading-prose leading-relaxed whitespace-pre-wrap text-base">{pages[pageIndex]}</p>
            </div>
          )}

          {/* Page navigation */}
          {pages.length > 1 && streamState !== 'streaming' && (
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                className="flex-1 py-2.5 rounded-xl border border-current/20 text-sm font-medium transition-all disabled:opacity-30 hover:bg-white/10"
              >
                ← Previous
              </button>
              <span className="text-sm opacity-50 whitespace-nowrap">{pageIndex + 1} / {pages.length}</span>
              <button
                onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                disabled={pageIndex === pages.length - 1}
                className="flex-1 py-2.5 rounded-xl border border-current/20 text-sm font-medium transition-all disabled:opacity-30 hover:bg-white/10"
              >
                Next →
              </button>
            </div>
          )}

          {/* Stream error */}
          {streamError && (
            <p className="text-red-400 text-sm text-center">{streamError}</p>
          )}

          {/* Continue / Continue with revision — chapter-based stories only */}
          {isChapterBased(story) && moreChaptersLeft && streamState === 'idle' && chaptersDone > 0 && (
            <section className="bg-white/[0.05] rounded-2xl p-5 border border-white/10 space-y-4">
              <h2 className="text-sm font-semibold">
                📖 Chapter {chaptersDone} of {totalChapters} complete
              </h2>
              {showRevisionInput ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium opacity-80">
                    Revision note for Chapter {chaptersDone + 1}{' '}
                    <span className="opacity-50 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. 'Make the protagonist more courageous' or 'Add a mysterious stranger'"
                    className="w-full bg-black/5 border border-current/20 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-current/30"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowRevisionInput(false); setRevisionNote(''); }}
                      className="flex-1 py-2.5 rounded-xl border border-current/20 text-sm font-medium hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => streamNextChapter(revisionNote || undefined)}
                      className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                    >
                      ✨ Continue with Revision
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => streamNextChapter()}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                  >
                    Continue →
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevisionInput(true)}
                    className="flex-1 py-2.5 rounded-xl border border-current/20 text-sm font-medium hover:bg-white/10 transition-colors"
                  >
                    ✏️ Continue with Revision
                  </button>
                </div>
              )}
            </section>
          )}

          {/* All chapters complete — badge + extend controls */}
          {isChapterBased(story) && allChaptersGenerated && chaptersDone > 0 && (
            <section className="bg-white/[0.05] rounded-2xl p-5 border border-white/10 space-y-4">
              <div className="text-center">
                <span className="inline-block bg-green-500/20 text-green-300 border border-green-400/30 px-4 py-2 rounded-2xl text-sm font-medium">
                  ✅ Story complete — {totalChapters} chapter{totalChapters !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium opacity-80 whitespace-nowrap">Continue for</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={extendCount}
                  onChange={(e) => setExtendCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-20 bg-black/10 border border-current/20 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <label className="text-sm font-medium opacity-80 whitespace-nowrap">more chapter{extendCount !== 1 ? 's' : ''}</label>
                <button
                  type="button"
                  onClick={handleExtend}
                  disabled={extending || streamState === 'streaming'}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  {extending ? 'Starting…' : '✨ Continue'}
                </button>
              </div>
              {extendError && <p className="text-red-400 text-xs">{extendError}</p>}
            </section>
          )}

          {/* Recording controls */}
          {pages.length > 0 && (
            <section className="bg-white/[0.05] rounded-2xl p-5 border border-white/10 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                🎙️ Reading Recording — Page {pageIndex + 1}
              </h2>

              <div className="flex items-center gap-3">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
                  >
                    <span className="animate-pulse w-2 h-2 rounded-full bg-white inline-block" />
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
                  >
                    🎙️ Record Reading
                  </button>
                )}
                {isRecording && (
                  <span className="text-red-400 text-xs animate-pulse">Recording…</span>
                )}
              </div>

              {recordingError && (
                <p className="text-red-400 text-xs">{recordingError}</p>
              )}

              {pageRecordings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-current/50">Saved recordings for this page:</p>
                  {pageRecordings.map((rec) => (
                    <div key={rec.id} className="flex items-center gap-3 bg-white/[0.04] rounded-xl px-4 py-2 border border-white/10">
                      <span className="text-xs opacity-50">{new Date(rec.createdAt).toLocaleString()}</span>
                      <audio
                        src={`/api/stories/${storyId}/recordings/${rec.id}`}
                        controls
                        className="flex-1 h-8 min-w-0"
                        style={{ accentColor: '#6366f1' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </ThemeWrapper>
  );
}
