import { HttpResponse } from '../../../../http.js';
import { getCurrentUser } from '../../../../lib/auth.js';
import { getStories, extendStory } from '../../../../lib/storage.js';
export async function POST(req, { params }) {
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
    if (!story.generationComplete) {
        return HttpResponse.json({ error: 'Story is not yet complete' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const additionalChapters = typeof body.additionalChapters === 'number' && body.additionalChapters > 0
        ? Math.min(Math.round(body.additionalChapters), 50)
        : 1;
    const updated = extendStory(id, additionalChapters);
    if (!updated)
        return HttpResponse.json({ error: 'Failed to extend story' }, { status: 500 });
    return HttpResponse.json(updated);
}
