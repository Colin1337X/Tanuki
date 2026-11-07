import { HttpResponse } from '../../../http.js';
import { getCurrentUser, assertCurrentUser } from '../../../lib/auth.js';
import { getConfig, getStoredUsers, getEffectiveMaturitySettings, getEffectiveMaturityRange } from '../../../lib/storage.js';
import { planStory } from '../../../lib/openai.js';
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { request } = body;
    if (!request?.trim())
        return HttpResponse.json({ error: 'Request is required' }, { status: 400 });
    const config = getConfig();
    const userCfg = config.userConfigs?.[user.username];
    const { contentMaturityLevel: defaultMaturityLevel, blockedTopics } = getEffectiveMaturitySettings(user.username);
    const maturityRange = getEffectiveMaturityRange(user.username);
    let contentMaturityLevel = defaultMaturityLevel;
    if (typeof body.contentMaturityLevel === 'number') {
        const requested = Math.round(body.contentMaturityLevel);
        contentMaturityLevel = Math.min(Math.max(maturityRange.min, requested), maturityRange.max);
    }
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
    try {
        const plan = await planStory({
            systemPrompt: config.systemPrompt,
            userRequest: request.trim(),
            storyOptions: effectiveOptions,
            apiBaseUrl: config.apiBaseUrl,
            model: config.model,
            localModelId: config.localModelId,
            contentMaturityLevel,
            blockedTopics,
        });
        await assertCurrentUser(user);
        return HttpResponse.json({ plan });
    }
    catch (err) {
        console.error('Plan generation error:', err);
        return HttpResponse.json({ error: 'Plan generation failed. Please try again.' }, { status: 500 });
    }
}
