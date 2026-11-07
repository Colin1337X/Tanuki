import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getConfig, getStoredUsers, getEffectiveMaturitySettings, getEffectiveMaturityRange } from '../../../lib/storage.js';
export async function GET() {
    const user = await getCurrentUser();
    if (!user)
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const config = getConfig();
    const userCfg = config.userConfigs?.[user.username];
    const { contentMaturityLevel } = getEffectiveMaturitySettings(user.username);
    const maturityRange = getEffectiveMaturityRange(user.username);
    const storedUser = getStoredUsers().find((u) => u.username === user.username);
    const coWriterMode = storedUser?.preferences?.coWriterMode ?? false;
    const response = {
        lockedFields: userCfg?.lockedFields ?? [],
        defaults: userCfg?.defaults ?? {},
        maturityRange,
        contentMaturityLevel,
        coWriterMode,
    };
    return HttpResponse.json(response);
}
