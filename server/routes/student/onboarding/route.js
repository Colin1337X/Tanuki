import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStoredUsers, updateStoredUser, getConfig, } from '../../../lib/storage.js';
import { READING_LEVEL_VALUES } from '../../../lib/reading-levels.js';
/** Return the reading levels allowed by the admin-configured range. */
function getAllowedLevels(config) {
    const range = config.readingLevelRange;
    if (!range)
        return READING_LEVEL_VALUES;
    const minIdx = READING_LEVEL_VALUES.indexOf(range.min);
    const maxIdx = READING_LEVEL_VALUES.indexOf(range.max);
    if (minIdx === -1 || maxIdx === -1 || minIdx > maxIdx)
        return READING_LEVEL_VALUES;
    return READING_LEVEL_VALUES.slice(minIdx, maxIdx + 1);
}
export async function GET() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const storedUser = getStoredUsers().find((u) => u.username === user.username);
    const config = getConfig();
    return HttpResponse.json({
        onboardingCompleted: storedUser?.onboardingCompleted ?? false,
        readingLevel: storedUser?.readingLevel ?? null,
        lexileTarget: storedUser?.lexileTarget ?? 600,
        preferences: storedUser?.preferences ?? {},
        allowedReadingLevels: getAllowedLevels(config),
    });
}
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const config = getConfig();
    const allowedLevels = getAllowedLevels(config);
    // Validate reading level if provided
    let readingLevel;
    if (body.readingLevel !== undefined) {
        if (!allowedLevels.includes(body.readingLevel)) {
            return HttpResponse.json({ error: 'Invalid reading level' }, { status: 400 });
        }
        readingLevel = body.readingLevel;
    }
    if(body.lexileTarget!==undefined && (!Number.isInteger(body.lexileTarget)||body.lexileTarget<0||body.lexileTarget>1800||body.lexileTarget%50!==0))return HttpResponse.json({error:'Lexile target must be 0–1800 in steps of 50'},{status:400});
    const preferences = {};
    if (body.preferences) {
        if (typeof body.preferences.theme === 'string') {
            preferences.theme = body.preferences.theme;
        }
        if (Array.isArray(body.preferences.favoriteGenres)) {
            preferences.favoriteGenres = body.preferences.favoriteGenres.filter((g) => typeof g === 'string');
        }
        if (typeof body.preferences.coWriterMode === 'boolean') {
            preferences.coWriterMode = body.preferences.coWriterMode;
        }
    }
    const patch = {
        onboardingCompleted: true,
        ...(body.lexileTarget!==undefined?{lexileTarget:body.lexileTarget}:{}),
        ...(readingLevel !== undefined ? { readingLevel } : {}),
        preferences,
    };
    const updated = updateStoredUser(user.username, patch);
    if (!updated) {
        // Env-var-only student — silently succeed (no persistent user record)
        return HttpResponse.json({ ok: true });
    }
    return HttpResponse.json({ ok: true });
}
