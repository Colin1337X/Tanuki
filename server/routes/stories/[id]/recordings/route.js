import { seal } from '../../../../lib/crypto.js';
import { HttpResponse } from '../../../../http.js';
import fs from 'fs';
import path from 'path';
import { getCurrentUser, assertCurrentUser } from '../../../../lib/auth.js';
import { getStories, getRecordingsForStory, saveRecordingMeta, RECORDINGS_DIR } from '../../../../lib/storage.js';
import { randomUUID } from 'crypto';
export async function GET(_req, { params }) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: storyId } = await params;
    // Verify story exists and ownership
    const stories = getStories();
    const story = stories.find((s) => s.id === storyId);
    if (!story)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'admin' && story.username !== user.username) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const recordings = getRecordingsForStory(storyId);
    // Students only see their own recordings
    const filtered = user.role === 'admin'
        ? recordings
        : recordings.filter((r) => r.username === user.username);
    return HttpResponse.json(filtered);
}
export async function POST(req, { params }) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: storyId } = await params;
    // Verify story exists and ownership
    const stories = getStories();
    const story = stories.find((s) => s.id === storyId);
    if (!story)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'admin' && story.username !== user.username) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    let formData;
    try {
        formData = await req.formData();
    }
    catch {
        return HttpResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
    const audioFile = formData.get('audio');
    const pageNumberStr = formData.get('pageNumber');
    if (!audioFile || !(audioFile instanceof File)) {
        return HttpResponse.json({ error: 'audio file is required' }, { status: 400 });
    }
    const pageNumber = pageNumberStr !== null ? Number(pageNumberStr) : NaN;
    if (typeof pageNumberStr!=='string' || !/^\d+$/.test(pageNumberStr) || !Number.isSafeInteger(pageNumber) || pageNumber < 0 || pageNumber >= Math.max(1,story.chapters?.length??1)) {
        return HttpResponse.json({ error: 'pageNumber is required and must be a non-negative integer' }, { status: 400 });
    }
    // Ensure storage directory exists
    const storyRecordingsDir = path.join(RECORDINGS_DIR, storyId);
    if (!fs.existsSync(storyRecordingsDir)) {
        fs.mkdirSync(storyRecordingsDir, { recursive: true });
    }
    const id = randomUUID();
    const filename = `${id}.webm`;
    const filePath = path.join(storyRecordingsDir, filename);
    if(audioFile.size>5*1024*1024)return HttpResponse.json({error:'Recording must be under 5 MB'},{status:413});
    if(!['audio/webm','audio/ogg','audio/mp4'].includes(audioFile.type.split(';')[0].trim()))return HttpResponse.json({error:'Unsupported audio format'},{status:415});
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await assertCurrentUser(user);
    fs.writeFileSync(filePath, 'TANUKI1:'+seal(buffer,`audio:${storyId}:${id}`),{mode:0o600});
    const recording = {
        id,
        storyId,
        username: user.username,
        pageNumber,
        mimeType:audioFile.type,
        storageFormat: 'encrypted-v1',
        filename,
        createdAt: new Date().toISOString(),
    };
    saveRecordingMeta(recording);
    return HttpResponse.json(recording);
}
