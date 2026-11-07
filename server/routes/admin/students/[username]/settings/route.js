import { HttpResponse } from '../../../../../http.js';
import { getCurrentUser } from '../../../../../lib/auth.js';
import { getConfig, getStoredUsers, updateStoredUser, isTeacherOfStudent, } from '../../../../../lib/storage.js';
import { READING_LEVEL_VALUES } from '../../../../../lib/reading-levels.js';
import { MATURITY_LEVEL_MIN, MATURITY_LEVEL_MAX } from '../../../../../lib/safety.js';
export async function GET(_req, { params }) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { username } = await params;
    if (user.role === 'teacher' && !isTeacherOfStudent(user.username, username)) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const storedUser = getStoredUsers().find((u) => u.username === username);
    if(user.role==='teacher' && storedUser?.role!=='student')return HttpResponse.json({error:'Forbidden'},{status:403});
    if (!storedUser) {
        return HttpResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    return HttpResponse.json({
        username: storedUser.username,
        disabled: storedUser.disabled ?? false,
        readingLevel: storedUser.readingLevel ?? null,
        onboardingCompleted: storedUser.onboardingCompleted ?? false,
        preferences: storedUser.preferences ?? {},
        contentMaturityLevel: storedUser.contentMaturityLevel ?? 2,
        blockedTopics: storedUser.blockedTopics ?? [],
    });
}
export async function POST(req, { params }) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { username } = await params;
    if (user.role === 'teacher' && !isTeacherOfStudent(user.username, username)) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const storedUser = getStoredUsers().find((u) => u.username === username);
    if(user.role==='teacher' && storedUser?.role!=='student')return HttpResponse.json({error:'Forbidden'},{status:403});
    if (!storedUser) {
        return HttpResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const body = await req.json();
    const patch = {};
    if ('disabled' in body) {
      if (user.role !== 'admin' || storedUser.role === 'admin') return HttpResponse.json({error:'Forbidden'},{status:403});
      if (typeof body.disabled !== 'boolean') return HttpResponse.json({error:'Invalid disabled flag'},{status:400});
      patch.disabled=body.disabled;
    }
    if ('readingLevel' in body) {
        if (body.readingLevel === null || body.readingLevel === undefined) {
            patch.readingLevel = undefined;
        }
        else if (READING_LEVEL_VALUES.includes(body.readingLevel)) {
            patch.readingLevel = body.readingLevel;
        }
        else {
            return HttpResponse.json({ error: 'Invalid reading level' }, { status: 400 });
        }
    }
    if (typeof body.onboardingCompleted === 'boolean') {
        patch.onboardingCompleted = body.onboardingCompleted;
    }
    if (body.preferences !== undefined) {
        const prefs = {};
        if (typeof body.preferences.theme === 'string')
            prefs.theme = body.preferences.theme;
        if (Array.isArray(body.preferences.favoriteGenres)) {
            prefs.favoriteGenres = body.preferences.favoriteGenres.filter((g) => typeof g === 'string');
        }
        patch.preferences = prefs;
    }
    if (typeof body.contentMaturityLevel === 'number') {
        const level = Math.round(body.contentMaturityLevel);
        if (level < MATURITY_LEVEL_MIN || level > MATURITY_LEVEL_MAX) {
            return HttpResponse.json({ error: `contentMaturityLevel must be between ${MATURITY_LEVEL_MIN} and ${MATURITY_LEVEL_MAX}` }, { status: 400 });
        }
        // Validate against global range if set
        const config = getConfig();
        const globalRange = config.globalSafety?.maturityLevelRange;
        if (globalRange) {
            if (level < globalRange.min || level > globalRange.max) {
                return HttpResponse.json({
                    error: `contentMaturityLevel must be between ${globalRange.min} and ${globalRange.max} per global safety settings`,
                }, { status: 400 });
            }
        }
        patch.contentMaturityLevel = level;
    }
    if (Array.isArray(body.blockedTopics)) {
        patch.blockedTopics = body.blockedTopics.filter((t) => typeof t === 'string');
    }
    // Only admins may change managed classroom assignments.
    if (user.role === 'admin' && Array.isArray(body.managedClassroomIds)) {
        patch.managedClassroomIds = body.managedClassroomIds.filter((id) => typeof id === 'string');
    }
    updateStoredUser(username, patch);
    return HttpResponse.json({ ok: true });
}
