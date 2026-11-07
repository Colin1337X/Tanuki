import { HttpResponse } from '../../http.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getStories } from '../../lib/storage.js';
export async function GET() {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const stories = getStories();
    if (user.role === 'admin')
        return HttpResponse.json(stories);
    return HttpResponse.json(stories.filter((s) => s.username === user.username));
}
