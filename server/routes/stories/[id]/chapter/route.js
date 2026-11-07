import { getCurrentUser, assertCurrentUser } from '../../../../lib/auth.js';
import { getConfig, getEffectiveMaturitySettings, getStories, appendChapter, markStoryComplete } from '../../../../lib/storage.js';
import { generateChapterStream } from '../../../../lib/openai.js';
export async function POST(req, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const { id } = await params;
    const stories = getStories();
    const story = stories.find((s) => s.id === id);
    if (!story) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    if (user.role !== 'admin' && story.username !== user.username) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    if (!story.plan) {
        return new Response(JSON.stringify({ error: 'Story has no plan' }), { status: 400 });
    }
    if (story.generationComplete) {
        return new Response(JSON.stringify({ error: 'Story is already complete' }), { status: 400 });
    }
    const body = await req.json();
    const revisionNote = typeof body.revisionNote === 'string' && body.revisionNote.trim()
        ? body.revisionNote.trim()
        : undefined;
    const chapterIndex = (story.chapters ?? []).length;
    const totalChapters = story.options?.chapterCount ?? 1;
    const config = getConfig();
    const { contentMaturityLevel, blockedTopics } = getEffectiveMaturitySettings(user.username);
    const encoder = new TextEncoder();
    let accumulatedText = '';
    const readable = new ReadableStream({
        async start(controller) {
            try {
                const gen = generateChapterStream({
                    systemPrompt: config.systemPrompt,
                    userRequest: story.request,
                    storyOptions: story.options,
                    apiBaseUrl: config.apiBaseUrl,
                    model: config.model,
                    localModelId: config.localModelId,
                    contentMaturityLevel,
                    blockedTopics,
                    plan: story.plan,
                    chapterIndex,
                    previousChapters: story.chapters ?? [],
                    revisionNote,
                });
                for await (const delta of gen) {
                    await assertCurrentUser(user);
                    accumulatedText += delta;
                    controller.enqueue(encoder.encode(delta));
                }
                // Persist the completed chapter
                await assertCurrentUser(user);
                appendChapter(id, accumulatedText);
                if (chapterIndex + 1 >= totalChapters) {
                    markStoryComplete(id);
                    // Signal completion with a sentinel line
                    controller.enqueue(encoder.encode('\n\u0000DONE'));
                }
            }
            catch (err) {
                console.error('Chapter stream error:', err);
                controller.error(err);
                return;
            }
            finally {
                if (controller.desiredSize !== null) controller.close();
            }
        },
    });
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    });
}
