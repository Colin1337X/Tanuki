import { unseal } from '../../../../../lib/crypto.js';
import { HttpResponse } from '../../../../../http.js';
import fs from 'fs';
import path from 'path';
import { getCurrentUser } from '../../../../../lib/auth.js';
import { getStories, getRecordings, RECORDINGS_DIR } from '../../../../../lib/storage.js';
export async function GET(_req, { params }) {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: storyId, recordingId } = await params;
    // Verify story exists and ownership
    const stories = getStories();
    const story = stories.find((s) => s.id === storyId);
    if (!story)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    // Find recording metadata
    const recordings = getRecordings();
    const recording = recordings.find((r) => r.id === recordingId && r.storyId === storyId);
    if (!recording)
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    // Students can only access their own recordings; admins can access all
    if (user.role !== 'admin' && recording.username !== user.username) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if(typeof recording.filename!=='string'||path.basename(recording.filename)!==recording.filename||/[\\/\r\n"]/u.test(recording.filename))return HttpResponse.json({error:'Invalid recording metadata'},{status:400});
    const filePath = path.join(RECORDINGS_DIR, storyId, recording.filename);
    if (!fs.existsSync(filePath)) {
        return HttpResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }
    const stored = fs.readFileSync(filePath);
    if(recording.storageFormat!=='legacy-raw'&&stored.subarray(0,8).toString()!=='TANUKI1:')throw new Error('Invalid encrypted recording header');
    const buffer = stored.subarray(0,8).toString()==='TANUKI1:'?unseal(stored.subarray(8).toString(),`audio:${storyId}:${recordingId}`,{allowLegacy:recording.storageFormat==='encrypted-v1-legacy'}):stored;
    return new HttpResponse(buffer, {
        headers: {
            'Content-Type': recording.mimeType || 'audio/webm',
            'Content-Disposition': `inline; filename="${recording.filename}"`,
            'Content-Length': String(buffer.length),
        },
    });
}
