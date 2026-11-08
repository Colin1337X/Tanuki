// Shared, unchanged maturity instructions for legacy and trusted-worker generation.
export const MATURITY_INSTRUCTIONS = {
    1: 'Write extremely safe, gentle content appropriate for very young children (ages 3-5). Use only uplifting, happy themes. Avoid all conflict, threats, scary imagery, or negative emotions.',
    2: 'Write child-safe content appropriate for ages 6-10. Mild conflict is acceptable but must resolve happily. Avoid violence, frightening themes, romance, or any adult topics.',
    3: 'Write content appropriate for preteens (ages 10-13). Adventure and mild tension are acceptable. Avoid graphic violence, romantic content, or mature themes.',
    4: 'Write content appropriate for teenagers (ages 13-17). Relatable teen themes, mild conflict, and light friendship/romance are acceptable. Avoid graphic violence, explicit content, or adult themes.',
    5: 'Write content appropriate for young adults (ages 16+). Complex themes, moral ambiguity, and mature storylines are acceptable. Avoid explicit sexual content or graphic gore.',
};
export function workerSystemPrompt(policy) {
  return [policy.instructions||'You are a creative story writer. Write one engaging, age-appropriate story.',
    'Write only prose content, without headings or labels.',
    MATURITY_INSTRUCTIONS[policy.maturity]&&`Content safety: ${MATURITY_INSTRUCTIONS[policy.maturity]}`,
    policy.blockedTopics.length&&`Do not include content about the following topics: ${policy.blockedTopics.join(', ')}.`,
    `Reading level: ${policy.readingLevel}. Aim near ${policy.lexile}L Lexile; this is a target, not a certified measurement. Keep assigned reading and content restrictions authoritative.`].filter(Boolean).join('\n\n');
}
