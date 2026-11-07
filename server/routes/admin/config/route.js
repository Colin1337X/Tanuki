import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getConfig, saveConfig, getManagedClassroomIds, } from '../../../lib/storage.js';
import { READING_LEVEL_VALUES } from '../../../lib/reading-levels.js';
import { MATURITY_LEVEL_MIN, MATURITY_LEVEL_MAX } from '../../../lib/safety.js';
export async function GET() {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const config = getConfig();
    // Teachers receive only the classrooms they manage — no global or system settings.
    if (user.role === 'teacher') {
        const managedIds = getManagedClassroomIds(user.username);
        const classrooms = {};
        for (const id of managedIds) {
            if (config.classrooms?.[id])
                classrooms[id] = config.classrooms[id];
        }
        return HttpResponse.json({ classrooms });
    }
    return HttpResponse.json(config);
}
/**
 * Validates and coerces a raw JSON value into a ClassroomConfig.
 *
 * Accepts an object with at minimum a non-empty `name` string field.
 * Optional fields that pass validation are included; those that fail
 * validation are silently omitted so that partial saves don't overwrite
 * valid existing values with out-of-range data.
 *
 * @returns A valid ClassroomConfig, or null if the input is not a valid classroom.
 */
function parseClassroom(rawCfg) {
    if (!rawCfg || typeof rawCfg !== 'object')
        return null;
    const cfg = rawCfg;
    if (typeof cfg.name !== 'string' || !cfg.name.trim())
        return null;
    const classroom = {
        name: cfg.name.trim(),
        members: Array.isArray(cfg.members)
            ? cfg.members.filter((m) => typeof m === 'string')
            : [],
    };
    if (typeof cfg.contentMaturityLevel === 'number') {
        const lvl = Math.round(cfg.contentMaturityLevel);
        if (lvl >= MATURITY_LEVEL_MIN && lvl <= MATURITY_LEVEL_MAX) {
            classroom.contentMaturityLevel = lvl;
        }
    }
    if (Array.isArray(cfg.blockedTopics)) {
        classroom.blockedTopics = cfg.blockedTopics.filter((t) => typeof t === 'string');
    }
    if (typeof cfg.maturityLevelRange === 'object' && cfg.maturityLevelRange !== null) {
        const range = cfg.maturityLevelRange;
        if (typeof range.min === 'number' && typeof range.max === 'number') {
            const min = Math.round(range.min);
            const max = Math.round(range.max);
            if (min >= MATURITY_LEVEL_MIN && max <= MATURITY_LEVEL_MAX && min <= max) {
                classroom.maturityLevelRange = { min, max };
            }
        }
    }
    return classroom;
}
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const existing = getConfig();
    // Teachers may only update the classrooms they manage.
    if (user.role === 'teacher') {
        if (typeof body.classrooms !== 'object' || body.classrooms === null) {
            return HttpResponse.json({ error: 'Teachers may only update classroom settings' }, { status: 403 });
        }
        const managedIds = getManagedClassroomIds(user.username);
        const updatedClassrooms = { ...(existing.classrooms ?? {}) };
        for (const [id, rawCfg] of Object.entries(body.classrooms)) {
            if (!managedIds.includes(id))
                continue; // silently ignore unmanaged classrooms
            const classroom = parseClassroom(rawCfg);
            if (classroom && existing.classrooms?.[id])
                updatedClassrooms[id] = {...classroom, members: existing.classrooms[id].members};
        }
        saveConfig({ ...existing, classrooms: updatedClassrooms });
        return HttpResponse.json({ ok: true });
    }
    // ── Admin path ────────────────────────────────────────────────────────────
    if (typeof body.systemPrompt !== 'string') {
        return HttpResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const updated = {
        ...existing,
        systemPrompt: body.systemPrompt,
    };
    if ('apiBaseUrl' in body) {
        updated.apiBaseUrl = typeof body.apiBaseUrl === 'string' && body.apiBaseUrl.trim()
            ? body.apiBaseUrl.trim()
            : undefined;
    }
    if ('model' in body) {
        updated.model = typeof body.model === 'string' && body.model.trim()
            ? body.model.trim()
            : undefined;
    }
    if ('localModelId' in body) {
        updated.localModelId = typeof body.localModelId === 'string' && body.localModelId.trim()
            ? body.localModelId.trim()
            : undefined;
    }
    if ('userConfigs' in body) {
        updated.userConfigs = typeof body.userConfigs === 'object' && body.userConfigs !== null
            ? body.userConfigs
            : undefined;
    }
    if ('readingLevelRange' in body) {
        if (body.readingLevelRange !== null &&
            typeof body.readingLevelRange === 'object' &&
            typeof body.readingLevelRange.min === 'string' &&
            typeof body.readingLevelRange.max === 'string') {
            const minIdx = READING_LEVEL_VALUES.indexOf(body.readingLevelRange.min);
            const maxIdx = READING_LEVEL_VALUES.indexOf(body.readingLevelRange.max);
            if (minIdx === -1 || maxIdx === -1) {
                return HttpResponse.json({ error: 'Invalid reading level in range' }, { status: 400 });
            }
            if (minIdx > maxIdx) {
                return HttpResponse.json({ error: 'Minimum reading level must not exceed maximum' }, { status: 400 });
            }
            updated.readingLevelRange = { min: body.readingLevelRange.min, max: body.readingLevelRange.max };
        }
        else {
            updated.readingLevelRange = undefined;
        }
    }
    if ('globalSafety' in body) {
        if (body.globalSafety === null || body.globalSafety === undefined) {
            updated.globalSafety = undefined;
        }
        else if (typeof body.globalSafety === 'object') {
            const gs = body.globalSafety;
            const globalSafety = {};
            if (typeof gs.contentMaturityLevel === 'number') {
                const lvl = Math.round(gs.contentMaturityLevel);
                if (lvl < MATURITY_LEVEL_MIN || lvl > MATURITY_LEVEL_MAX) {
                    return HttpResponse.json({ error: 'globalSafety.contentMaturityLevel out of range' }, { status: 400 });
                }
                globalSafety.contentMaturityLevel = lvl;
            }
            if (Array.isArray(gs.blockedTopics)) {
                globalSafety.blockedTopics = gs.blockedTopics.filter((t) => typeof t === 'string');
            }
            if (typeof gs.maturityLevelRange === 'object' && gs.maturityLevelRange !== null) {
                const range = gs.maturityLevelRange;
                if (typeof range.min === 'number' && typeof range.max === 'number') {
                    const min = Math.round(range.min);
                    const max = Math.round(range.max);
                    if (min < MATURITY_LEVEL_MIN || max > MATURITY_LEVEL_MAX || min > max) {
                        return HttpResponse.json({ error: 'Invalid globalSafety.maturityLevelRange' }, { status: 400 });
                    }
                    globalSafety.maturityLevelRange = { min, max };
                }
            }
            updated.globalSafety = globalSafety;
        }
    }
    if ('classrooms' in body) {
        if (body.classrooms === null || body.classrooms === undefined) {
            updated.classrooms = undefined;
        }
        else if (typeof body.classrooms === 'object') {
            const classrooms = {};
            for (const [id, rawCfg] of Object.entries(body.classrooms)) {
                const classroom = parseClassroom(rawCfg);
                if (classroom)
                    classrooms[id] = classroom;
            }
            updated.classrooms = classrooms;
        }
    }
    saveConfig(updated);
    return HttpResponse.json({ ok: true });
}
