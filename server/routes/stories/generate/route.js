import { HttpResponse } from '../../../http.js';
import { getCurrentUser, assertCurrentUser } from '../../../lib/auth.js';
import { getConfig, getStoredUsers, getEffectiveMaturitySettings, getEffectiveMaturityRange, saveStory } from '../../../lib/storage.js';
import { generateStory } from '../../../lib/openai.js';
import { searchKnowledgeBase } from '../../../lib/knowledge-base.js';
import { searchWeb } from '../../../lib/web-search.js';
import { randomUUID } from 'crypto';
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { request } = body;
    if (!request?.trim())
        return HttpResponse.json({ error: 'Request is required' }, { status: 400 });
    const infoMode = body.infoMode === true;
    const config = getConfig();
    const userCfg = config.userConfigs?.[user.username];
    // Resolve effective maturity level and blocked topics from student/classroom/global settings
    const { contentMaturityLevel: defaultMaturityLevel, blockedTopics } = getEffectiveMaturitySettings(user.username);
    // Allow students to pick their own maturity level within their allowed range
    const maturityRange = getEffectiveMaturityRange(user.username);
    let contentMaturityLevel = defaultMaturityLevel;
    if (typeof body.contentMaturityLevel === 'number') {
        const requested = Math.round(body.contentMaturityLevel);
        contentMaturityLevel = Math.min(Math.max(maturityRange.min, requested), maturityRange.max);
    }
    // Build effective story options: student-supplied values, overridden by admin locks
    const studentOptions = {
        title: body.title,
        chapterCount: typeof body.chapterCount === 'number' ? body.chapterCount : undefined,
        readingComplexity: body.readingComplexity,
        vocabularyComplexity: body.vocabularyComplexity,
        genre: body.genre,
        plot: body.plot,
        contentMaturityLevel,
    };
    const lockedFields = userCfg?.lockedFields ?? [];
    const adminDefaults = userCfg?.defaults ?? {};
    const effectiveOptions = { ...studentOptions };
    // Apply the student's profile reading level automatically
    const storedUser = getStoredUsers().find((u) => u.username === user.username);
    if (storedUser?.readingLevel) {
        effectiveOptions.readingLevel = storedUser.readingLevel;
        effectiveOptions.lexileTarget = storedUser.lexileTarget;
    }
    for (const field of lockedFields) {
        const adminVal = adminDefaults[field];
        if (adminVal !== undefined) {
            effectiveOptions[field] = adminVal;
        }
    }
    // ── Info Mode: gather knowledge context ──────────────────────────────────
    let knowledgeContext;
    if (infoMode) {
        const [kbResults, webResults] = await Promise.all([
            searchKnowledgeBase(request.trim(), 3),
            searchWeb(request.trim(), 5),
        ]);
        const contextParts = [];
        // Limit each KB document to 800 chars to stay within token budgets
        const KB_CONTENT_LIMIT = 800;
        if (kbResults.length > 0) {
            contextParts.push('== Knowledge Base ==');
            for (const doc of kbResults) {
                const excerpt = doc.content.length > KB_CONTENT_LIMIT
                    ? doc.content.slice(0, KB_CONTENT_LIMIT) + '…'
                    : doc.content;
                contextParts.push(`[${doc.title}]\n${excerpt}`);
            }
        }
        // Limit each web snippet to 400 chars
        const SNIPPET_LIMIT = 400;
        if (webResults.length > 0) {
            contextParts.push('== Web Search Results ==');
            for (const result of webResults) {
                const snippet = result.snippet.length > SNIPPET_LIMIT
                    ? result.snippet.slice(0, SNIPPET_LIMIT) + '…'
                    : result.snippet;
                contextParts.push(`[${result.title}] ${result.url}\n${snippet}`);
            }
        }
        if (contextParts.length > 0) {
            knowledgeContext = contextParts.join('\n\n');
        }
    }
    let story;
    try {
        story = await generateStory({
            systemPrompt: config.systemPrompt,
            userRequest: request,
            storyOptions: effectiveOptions,
            apiBaseUrl: config.apiBaseUrl,
            model: config.model,
            localModelId: config.localModelId,
            contentMaturityLevel,
            blockedTopics,
            infoMode,
            knowledgeContext,
        });
    }
    catch (err) {
        console.error('Story generation error:', err);
        return HttpResponse.json({ error: 'Story generation failed. Please try again.' }, { status: 500 });
    }
    await assertCurrentUser(user);
    const storyRecord = {
        id: randomUUID(),
        username: user.username,
        request,
        story,
        title: effectiveOptions.title,
        options: effectiveOptions,
        createdAt: new Date().toISOString(),
        ...(infoMode ? { infoMode: true } : {}),
    };
    saveStory(storyRecord);
    return HttpResponse.json(storyRecord);
}
