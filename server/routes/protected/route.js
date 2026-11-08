import { HttpResponse } from '../../http.js';
import { enabled, requireFeature, verifyCommand, enroll, revokeDevice, listRecipientKeys, listDocuments, saveDocument, recipientsFor, device, permittedRecipient } from '../../lib/protected-content.js';
import { responseQueue } from '../../lib/recipient-service.js';
import { parseSessionToken, sessionCookie } from '../../lib/auth.js';
import { getConfig, getEffectiveMaturitySettings } from '../../lib/storage.js';
import { generateChapterStream } from '../../lib/openai.js';
import { consumeRateLimit, readUser } from '../../lib/database.js';

export async function GET() {
  if (!enabled()) return HttpResponse.json({ enabled: false });
  const user = await requireFeature();
  return HttpResponse.json({ enabled: true, devices: listRecipientKeys(user), privacy: 'AI prompts and responses are processed in plaintext by the backend and configured provider. Stored response chunks are recipient-encrypted.' });
}
export async function POST(req) {
  const { user, command, signature } = await verifyCommand(req), p = command.payload;
  let result;
  switch (command.action) {
    case 'enroll': result = await enroll(user, command, signature); break;
    case 'revoke': result = revokeDevice(user, command); break;
    case 'documents': result = { documents: listDocuments(user, command.device), devices: listRecipientKeys(user) }; break;
    case 'save': result = saveDocument(user, command); break;
    case 'generations': result = { generations: responseQueue().list(user.username, command.device).filter(row =>
      permittedRecipient(row.owner, user.username, row.recipients.some(r => r.username !== row.owner) ? 'classroom' : 'private')) }; break;
    case 'generate': {
      if (p.discloseToAI !== true || typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > 4000) throw Object.assign(new Error('Explicit AI disclosure and a bounded prompt are required'), { status: 400 });
      if (!consumeRateLimit('protected-generation:' + user.username, 30, 3600000)) throw Object.assign(new Error('Generation limit reached'), { status: 429 });
      const recipients = recipientsFor(user.username, p.recipients, p.mode);
      if (!recipients.some(r => r.fingerprint === command.device)) throw Object.assign(new Error('Generating device must be a recipient'), { status: 400 });
      const session = sessionCookie(req), config = getConfig(), safety = getEffectiveMaturitySettings(user.username);
      const profile = readUser(user.username);
      const validate = async () => {
        if (parseSessionToken(session)?.username !== user.username || !device(user.username, command.device)) throw new Error('Authorization revoked');
        recipientsFor(user.username, p.recipients, p.mode);
      };
      const options = { systemPrompt: config.systemPrompt, userRequest: p.prompt, apiBaseUrl: config.apiBaseUrl, model: config.model,
        ...safety, storyOptions: { ...config.userConfigs?.[user.username]?.defaults, chapterCount: 1,
          readingLevel: profile.readingLevel, lexileTarget: profile.lexileTarget }, chapterIndex: 0,
        plan: { exposition: 'Introduce the setting.', risingAction: 'Develop the story.', climax: 'Resolve the main challenge.', fallingAction: 'Show the consequences.', resolution: 'End the story.' } };
      if (config.localModelId) throw Object.assign(new Error('Encrypted queue currently requires a streaming provider'), { status: 409 });
      result = responseQueue().start({ owner: user.username, recipients, validate,
        produce: signal => generateChapterStream({ ...options, signal }) });
      break;
    }
    case 'resume': case 'ack': case 'cancel': {
      const queue = responseQueue(), row = queue.authorize(p.id, user.username, command.device);
      if (!permittedRecipient(row.owner, user.username, JSON.parse(row.recipients).some(r => r.username !== row.owner) ? 'classroom' : 'private')) throw Object.assign(new Error('Recipient authorization revoked'), { status: 403 });
      if (command.action === 'resume') result = queue.read(p.id, user.username, command.device, p.after ?? -1);
      if (command.action === 'ack') result = queue.acknowledge(p.id, user.username, command.device, p.sequence, p.digest);
      if (command.action === 'cancel') result = queue.cancel(p.id, user.username, command.device);
      break;
    }
    default: throw Object.assign(new Error('Unknown protected operation'), { status: 400 });
  }
  return HttpResponse.json(result);
}
