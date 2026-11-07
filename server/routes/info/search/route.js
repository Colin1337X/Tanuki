import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { searchKnowledgeBase } from '../../../lib/knowledge-base.js';
import { searchWeb } from '../../../lib/web-search.js';
/**
 * POST /api/info/search
 *
 * Body: { query: string }
 *
 * Runs the query against both the local knowledge base (embedding similarity)
 * and the web (DuckDuckGo instant answers) in parallel, then returns the
 * combined results to the client / generate endpoint.
 */
export async function POST(req) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { query } = body;
    if (!query?.trim()) {
        return HttpResponse.json({ error: 'query is required' }, { status: 400 });
    }
    const [knowledgeResults, webResults] = await Promise.all([
        searchKnowledgeBase(query.trim(), 3),
        searchWeb(query.trim(), 5),
    ]);
    return HttpResponse.json({ knowledgeResults, webResults });
}
