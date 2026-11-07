import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
export async function GET() {
    const user = await getCurrentUser();
    const headers = { 'Cache-Control': 'no-store' };
    if (!user)
        return HttpResponse.json({ error: 'Not authenticated' }, { status: 401, headers });
    return HttpResponse.json({ user }, { headers });
}
