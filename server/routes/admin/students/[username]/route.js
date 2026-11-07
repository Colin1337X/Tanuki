import { HttpResponse } from '../../../../http.js';
import { getCurrentUser } from '../../../../lib/auth.js';
import { deleteStoredUser } from '../../../../lib/storage.js';
export async function DELETE(_req, { params }) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { username } = await params;
    const deleted = deleteStoredUser(username);
    if (!deleted) {
        return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return HttpResponse.json({ ok: true });
}
