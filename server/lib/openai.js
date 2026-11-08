import { MATURITY_LEVEL_DEFAULT } from './safety.js';
/**
 * Admin-controlled content maturity descriptions injected into the system
 * prompt to restrict or allow themes in generated stories.
 * Level 6 (None) intentionally has no entry — no safety clause is added.
 */
const MATURITY_INSTRUCTIONS = {
    1: 'Write extremely safe, gentle content appropriate for very young children (ages 3-5). Use only uplifting, happy themes. Avoid all conflict, threats, scary imagery, or negative emotions.',
    2: 'Write child-safe content appropriate for ages 6-10. Mild conflict is acceptable but must resolve happily. Avoid violence, frightening themes, romance, or any adult topics.',
    3: 'Write content appropriate for preteens (ages 10-13). Adventure and mild tension are acceptable. Avoid graphic violence, romantic content, or mature themes.',
    4: 'Write content appropriate for teenagers (ages 13-17). Relatable teen themes, mild conflict, and light friendship/romance are acceptable. Avoid graphic violence, explicit content, or adult themes.',
    5: 'Write content appropriate for young adults (ages 16+). Complex themes, moral ambiguity, and mature storylines are acceptable. Avoid explicit sexual content or graphic gore.',
};
function buildUserMessage(userRequest, opts) {
    const parts = [];
    if(Number.isInteger(opts?.lexileTarget))parts.push(`Aim for a reading difficulty near ${opts.lexileTarget}L Lexile. This is a target, not a certified measurement. Keep the assigned reading level and content limits authoritative.`);
    if (opts?.title)
        parts.push(`Title: ${opts.title}`);
    if (opts?.genre)
        parts.push(`Genre: ${opts.genre}`);
    if (opts?.chapterCount && opts.chapterCount > 1) {
        parts.push(`Number of chapters: ${opts.chapterCount}`);
    }
    if (opts?.readingLevel) {
        parts.push(`Reading level: ${opts.readingLevel}`);
    }
    if (opts?.readingComplexity) {
        parts.push(`Reading complexity level: ${opts.readingComplexity}`);
    }
    if (opts?.vocabularyComplexity) {
        parts.push(`Vocabulary complexity: ${opts.vocabularyComplexity}`);
    }
    if (opts?.plot)
        parts.push(`Plot outline: ${opts.plot}`);
    parts.push(`Story request: ${userRequest}`);
    return parts.join('\n');
}
function buildInfoUserMessage(userRequest, knowledgeContext, opts) {
    const parts = [];
    if(Number.isInteger(opts?.lexileTarget))parts.push(`Aim for a reading difficulty near ${opts.lexileTarget}L Lexile. This is a target, not a certified measurement. Keep the assigned reading level and content limits authoritative.`);
    if (opts?.title)
        parts.push(`Title: ${opts.title}`);
    if (opts?.chapterCount && opts.chapterCount > 1) {
        parts.push(`Number of sections: ${opts.chapterCount}`);
    }
    if (opts?.readingLevel)
        parts.push(`Reading level: ${opts.readingLevel}`);
    if (opts?.readingComplexity)
        parts.push(`Reading complexity level: ${opts.readingComplexity}`);
    if (opts?.vocabularyComplexity)
        parts.push(`Vocabulary complexity: ${opts.vocabularyComplexity}`);
    if (knowledgeContext && knowledgeContext.trim()) {
        parts.push(`Reference information:\n${knowledgeContext.trim()}`);
    }
    parts.push(`Topic: ${userRequest}`);
    return parts.join('\n\n');
}
export async function generateStory(options) {
    const { systemPrompt, userRequest, storyOptions, apiBaseUrl, model, localModelId, contentMaturityLevel, blockedTopics, infoMode, knowledgeContext } = options;
    const apiKey = process.env.OPENAI_API_KEY;
    const userMessage = infoMode
        ? buildInfoUserMessage(userRequest, knowledgeContext, storyOptions)
        : buildUserMessage(userRequest, storyOptions);
    // Build effective system prompt with maturity and topic-blocking clauses
    const basePrompt = infoMode
        ? 'You are a knowledgeable nonfiction writer. Write an accurate, engaging, well-structured nonfiction article or report based on the provided topic and reference information. Use only factual information — do not invent facts. Structure the writing clearly with an introduction, body sections, and a conclusion.'
        : systemPrompt;
    const promptParts = [basePrompt];
    if (!infoMode) {
        promptParts.push('Write only the narrative text of the story — do not begin with phrases like "Here is your story:", "Sure!", "Certainly!", or any other preamble. Start directly with the story content.');
    }
    const level = contentMaturityLevel !== undefined && contentMaturityLevel >= 1 && contentMaturityLevel <= 6
        ? contentMaturityLevel
        : MATURITY_LEVEL_DEFAULT;
    const maturityInstruction = MATURITY_INSTRUCTIONS[level]; // undefined for level 6 (None)
    if (maturityInstruction) {
        promptParts.push(`Content safety: ${maturityInstruction}`);
    }
    if (blockedTopics && blockedTopics.length > 0) {
        promptParts.push(`Do not include content about the following topics: ${blockedTopics.join(', ')}.`);
    }
    const effectiveSystemPrompt = promptParts.join('\n\n');
    const chapterCount = storyOptions?.chapterCount ?? 1;
    // Allow unrestricted token output — ~420 tokens (~300 words) per chapter
    const maxTokens = Math.max(600, chapterCount * 420);
    // ── Local .safetensors model (highest priority) ──────────────────────────
    if (localModelId) {
        const { generateWithLocalModel } = await import('./local-model.js');
        const prompt = `${effectiveSystemPrompt}\n\n${userMessage}`;
        return generateWithLocalModel(localModelId, prompt, maxTokens);
    }
    // ── External API (OpenAI or compatible) ─────────────────────────────────
    if (!apiKey && !apiBaseUrl && !process.env.OPENAI_BASE_URL) {
        if (process.env.NODE_ENV === 'production') throw new Error('Configure an AI provider before generating stories');
        await new Promise((r) => setTimeout(r, 800));
        if (infoMode) {
            return `[Demo nonfiction article — no API key configured. Topic: "${userRequest}"]\n\nThis is where a factual, well-researched article about "${userRequest}" would appear. Configure an API key in your .env.local file to enable real generation.`;
        }
        return `Once upon a time in a land far away, there was a great adventure waiting to unfold. [This is a demo story since no API key is configured. Your request was: "${userRequest}"] The end.`;
    }
    const OpenAI = (await import('./ai-client.js')).default;
    const client = new OpenAI({
        apiKey: apiKey ?? 'no-key',
        ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
    });
    const response = await client.chat.completions.create({
        model: model ?? 'gpt-4o-mini',
        messages: [
            { role: 'system', content: effectiveSystemPrompt },
            { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
    });
    return response.choices[0]?.message?.content ?? 'Story generation failed.';
}
// ── Planning stage ────────────────────────────────────────────────────────────
function validatePlan(plan){if(!plan||['exposition','risingAction','climax','fallingAction','resolution'].some(k=>typeof plan[k]!=='string'||!plan[k].trim()||plan[k].length>3000))throw new Error('Invalid plan');return plan;}
const PLAN_SYSTEM_PROMPT = `You are a creative story planner. Given a story request, create a concise five-part story plan in JSON. Return ONLY valid JSON with exactly these keys: "exposition", "risingAction", "climax", "fallingAction", "resolution". Each value should be 1-3 sentences summarising that narrative beat. Do not include any other text outside the JSON object.`;
/** Generate a five-part story plan for the given request. */
export async function planStory(options) {
    const { userRequest, storyOptions, apiBaseUrl, model, localModelId, contentMaturityLevel, blockedTopics } = options;
    const apiKey = process.env.OPENAI_API_KEY;
    const parts = [PLAN_SYSTEM_PROMPT];
    const level = contentMaturityLevel !== undefined && contentMaturityLevel >= 1 && contentMaturityLevel <= 6
        ? contentMaturityLevel
        : MATURITY_LEVEL_DEFAULT;
    const maturityInstruction = MATURITY_INSTRUCTIONS[level];
    if (maturityInstruction)
        parts.push(`Content safety: ${maturityInstruction}`);
    if (blockedTopics && blockedTopics.length > 0) {
        parts.push(`Do not include content about the following topics: ${blockedTopics.join(', ')}.`);
    }
    const systemPrompt = parts.join('\n\n');
    const userMessage = buildUserMessage(userRequest, storyOptions);
    const demoPlan = {
        exposition: `We are introduced to the main character and the world of "${userRequest}".`,
        risingAction: 'The protagonist faces a growing challenge that tests their courage and resolve.',
        climax: 'The tension reaches its peak in a dramatic confrontation or turning point.',
        fallingAction: 'The aftermath of the climax unfolds as the character begins to heal or rebuild.',
        resolution: 'Peace is restored and the character emerges transformed by their journey.',
    };
    if (!apiKey && !apiBaseUrl && !process.env.OPENAI_BASE_URL) {
        if (process.env.NODE_ENV === 'production') throw new Error('Configure an AI provider before generating stories');
        await new Promise((r) => setTimeout(r, 500));
        return demoPlan;
    }
    if (localModelId) {
        const { generateWithLocalModel } = await import('./local-model.js');
        const prompt = `${systemPrompt}\n\n${userMessage}`;
        const raw = await generateWithLocalModel(localModelId, prompt, 400);
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch)
                return validatePlan(JSON.parse(jsonMatch[0]));
        }
        catch { throw new Error('AI provider did not return a valid story plan'); }
    throw new Error('AI provider did not return a valid story plan');
    }
    const OpenAI = (await import('./ai-client.js')).default;
    const client = new OpenAI({
        apiKey: apiKey ?? 'no-key',
        ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
    });
    try {
        const response = await client.chat.completions.create({
            model: model ?? 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 500,
        });
        const raw = response.choices[0]?.message?.content ?? '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch)
            return validatePlan(JSON.parse(jsonMatch[0]));
    }
    catch { throw new Error('AI provider did not return a valid story plan'); }
    throw new Error('AI provider did not return a valid story plan');
}
// ── Chapter streaming ─────────────────────────────────────────────────────────
function buildChapterUserMessage(userRequest, opts, plan, chapterIndex, totalChapters, previousChapters, revisionNote) {
    const parts = [];
    if(Number.isInteger(opts?.lexileTarget))parts.push(`Aim for a reading difficulty near ${opts.lexileTarget}L Lexile. This is a target, not a certified measurement. Keep the assigned reading level and content limits authoritative.`);
    if (opts?.title)
        parts.push(`Story title: ${opts.title}`);
    if (opts?.genre)
        parts.push(`Genre: ${opts.genre}`);
    if (opts?.readingLevel)
        parts.push(`Reading level: ${opts.readingLevel}`);
    if (opts?.readingComplexity)
        parts.push(`Reading complexity: ${opts.readingComplexity}`);
    if (opts?.vocabularyComplexity)
        parts.push(`Vocabulary complexity: ${opts.vocabularyComplexity}`);
    parts.push(`Story request: ${userRequest}`);
    parts.push(`\nStory plan:\n- Exposition: ${plan.exposition}\n- Rising Action: ${plan.risingAction}\n- Climax: ${plan.climax}\n- Falling Action: ${plan.fallingAction}\n- Resolution: ${plan.resolution}`);
    if (previousChapters.length > 0) {
        const recent = previousChapters.slice(-2);
        parts.push(`\nPrevious chapter(s):\n${recent.map((c, i) => `Chapter ${chapterIndex - recent.length + i + 1}:\n${c}`).join('\n\n')}`);
    }
    parts.push(`\nNow write Chapter ${chapterIndex + 1} of ${totalChapters}.`);
    if (revisionNote) {
        parts.push(`The student has a revision request for this chapter: ${revisionNote}`);
    }
    return parts.join('\n');
}
/**
 * Stream a single chapter as an async generator of text deltas.
 * Yields string fragments as they arrive from the model.
 */
export async function* generateChapterStream(options) {
    options.signal?.throwIfAborted();
    const { systemPrompt, userRequest, storyOptions, apiBaseUrl, model, localModelId, contentMaturityLevel, blockedTopics, plan, chapterIndex, previousChapters = [], revisionNote, } = options;
    const apiKey = process.env.OPENAI_API_KEY;
    const totalChapters = storyOptions?.chapterCount ?? 1;
    const promptParts = [
        systemPrompt || 'You are a creative story writer. Write an engaging, age-appropriate story chapter.',
        'Write only the prose content of the chapter — no headings, no labels, just the narrative text.',
    ];
    const level = contentMaturityLevel !== undefined && contentMaturityLevel >= 1 && contentMaturityLevel <= 6
        ? contentMaturityLevel
        : MATURITY_LEVEL_DEFAULT;
    const maturityInstruction = MATURITY_INSTRUCTIONS[level];
    if (maturityInstruction)
        promptParts.push(`Content safety: ${maturityInstruction}`);
    if (blockedTopics && blockedTopics.length > 0) {
        promptParts.push(`Do not include content about the following topics: ${blockedTopics.join(', ')}.`);
    }
    const effectiveSystemPrompt = promptParts.join('\n\n');
    const userMessage = buildChapterUserMessage(userRequest, storyOptions, plan, chapterIndex, totalChapters, previousChapters, revisionNote);
    const maxTokens = 1200;
    if (!apiKey && !apiBaseUrl && !process.env.OPENAI_BASE_URL) {
        if (process.env.NODE_ENV === 'production') throw new Error('Configure an AI provider before generating stories');
        await new Promise((r) => setTimeout(r, 400));
        const demo = `Chapter ${chapterIndex + 1}: Once upon a time, the story continued with great wonder and adventure. [Demo chapter — no API key configured. Configure an API key in your .env.local file to enable real generation.]`;
        for (const char of demo) {
            options.signal?.throwIfAborted();
            yield char;
            await new Promise((r) => setTimeout(r, 8));
        }
        return;
    }
    if (localModelId) {
        const { generateWithLocalModel } = await import('./local-model.js');
        const prompt = `${effectiveSystemPrompt}\n\n${userMessage}`;
        const full = await generateWithLocalModel(localModelId, prompt, maxTokens);
        yield full;
        return;
    }
    const OpenAI = (await import('./ai-client.js')).default;
    const client = new OpenAI({
        apiKey: apiKey ?? 'no-key',
        ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
    });
    const stream = await client.chat.completions.create({
        model: model ?? 'gpt-4o-mini',
        messages: [
            { role: 'system', content: effectiveSystemPrompt },
            { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        stream: true,
    }, { signal: options.signal });
    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta)
            yield delta;
    }
}
// ── Post-processing ───────────────────────────────────────────────────────────
