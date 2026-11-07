import { validCredentials, hashPassword } from '../../../lib/passwords.js';
import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStoredUsers, addStoredUser, importStudentsFromCsv, getManagedClassroomIds, getConfig, } from '../../../lib/storage.js';
export async function GET() {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    let allStudents = getStoredUsers().filter((u) => u.role === 'student');
    // Teachers see only the students who belong to their managed classrooms.
    if (user.role === 'teacher') {
        const classroomIds = getManagedClassroomIds(user.username);
        const config = getConfig();
        const memberSet = new Set();
        for (const id of classroomIds) {
            for (const m of config.classrooms?.[id]?.members ?? [])
                memberSet.add(m);
        }
        allStudents = allStudents.filter((s) => memberSet.has(s.username));
    }
    return HttpResponse.json(allStudents.map(({ username, role, readingLevel, onboardingCompleted, preferences, contentMaturityLevel, blockedTopics }) => ({
        username, role, readingLevel, onboardingCompleted, preferences, contentMaturityLevel, blockedTopics,
    })));
}
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const contentType = req.headers.get('content-type') ?? '';
    // CSV import: body is { csv: string }
    if (contentType.includes('application/json')) {
        const body = await req.json();
        if (typeof body.csv === 'string') {
            if (body.csv.length > 100000 || body.csv.split(/\r?\n/).length > 101) return HttpResponse.json({error:'Import at most 100 students at a time'},{status:400});
            const count = importStudentsFromCsv(body.csv);
            return HttpResponse.json({ ok: true, imported: count });
        }
        // Single student creation: { username, password }
        const { username, password } = body;
        if (!validCredentials(username, password)) {
            return HttpResponse.json({ error: 'Use a valid username and a password of at least 12 characters' }, { status: 400 });
        }
        addStoredUser({ username: username.trim(), password:hashPassword(password), role: 'student' });
        return HttpResponse.json({ ok: true });
    }
    return HttpResponse.json({ error: 'Unsupported content type' }, { status: 415 });
}
