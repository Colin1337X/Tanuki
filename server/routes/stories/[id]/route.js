import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStories, updateStory } from '../../../lib/storage.js';
export async function GET(_req, { params }) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const stories = getStories();
    const story = stories.find((s) => s.id === id);
    if (!story)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'admin' && story.username !== user.username) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return HttpResponse.json(story);
}
export async function PATCH(req, { params }) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { story: content } = await req.json();
    if (typeof content !== 'string' || !content.trim()) {
        return HttpResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    // Verify ownership (or admin)
    const stories = getStories();
    const existing = stories.find((s) => s.id === id);
    if (!existing)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'admin' && existing.username !== user.username) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const updated = updateStory(id, content);
    return HttpResponse.json(updated);
}
