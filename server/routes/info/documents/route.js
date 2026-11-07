import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getKnowledgeDocuments, deleteKnowledgeDocument } from '../../../lib/storage.js';
import { embedAndSaveDocument } from '../../../lib/knowledge-base.js';
import { randomUUID } from 'crypto';
/**
 * GET /api/info/documents
 * Returns all knowledge-base documents (without embedding vectors to keep
 * the response lean).  Requires admin role.
 *
 * POST /api/info/documents
 * Add a new document to the knowledge base and compute its embedding.
 * Body: { title: string; content: string; tags?: string[] }
 * Requires admin role.
 *
 * DELETE /api/info/documents
 * Remove a document by ID.
 * Body: { id: string }
 * Requires admin role.
 */
async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user)
        return null;
    if (user.role !== 'admin')
        return null;
    return user;
}
export async function GET() {
    const user = await requireAdmin();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const docs = getKnowledgeDocuments().map(({ id, title, content, tags, createdAt }) => ({
        id,
        title,
        content,
        tags,
        createdAt,
    }));
    return HttpResponse.json(docs);
}
export async function POST(req) {
    const user = await requireAdmin();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { title, content, tags } = body;
    if (!title?.trim())
        return HttpResponse.json({ error: 'title is required' }, { status: 400 });
    if (!content?.trim())
        return HttpResponse.json({ error: 'content is required' }, { status: 400 });
    const doc = await embedAndSaveDocument({
        id: randomUUID(),
        title: title.trim(),
        content: content.trim(),
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date().toISOString(),
    });
    // Return without the embedding vector
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { embedding: _emb, ...docWithoutEmbedding } = doc;
    return HttpResponse.json(docWithoutEmbedding, { status: 201 });
}
export async function DELETE(req) {
    const user = await requireAdmin();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { id } = body;
    if (!id)
        return HttpResponse.json({ error: 'id is required' }, { status: 400 });
    const deleted = deleteKnowledgeDocument(id);
    if (!deleted)
        return HttpResponse.json({ error: 'Document not found' }, { status: 404 });
    return HttpResponse.json({ success: true });
}
