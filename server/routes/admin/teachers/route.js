import { validCredentials, hashPassword } from '../../../lib/passwords.js';
import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStoredUsers, addStoredUser } from '../../../lib/storage.js';
export async function GET() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const teachers = getStoredUsers()
        .filter((u) => u.role === 'teacher')
        .map(({ username, role, managedClassroomIds }) => ({
        username,
        role,
        managedClassroomIds: managedClassroomIds ?? [],
    }));
    return HttpResponse.json(teachers);
}
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    if (!validCredentials(body.username, body.password)) {
        return HttpResponse.json({ error: 'Use a valid username and a password of at least 12 characters' }, { status: 400 });
    }
    addStoredUser({
        username: body.username.trim(),
        password: hashPassword(body.password),
        role: 'teacher',
        managedClassroomIds: Array.isArray(body.managedClassroomIds)
            ? body.managedClassroomIds.filter((id) => typeof id === 'string')
            : [],
    });
    return HttpResponse.json({ ok: true });
}
