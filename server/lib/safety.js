/**
 * Safety-related constants shared between server-side logic and client-side
 * components.  This file must NOT import any Node-only modules (e.g. `fs`,
 * `path`) so it remains safe to use in browser bundles.
 */
/** Topics the admin can block from story content. */
export const PREDEFINED_BLOCKED_TOPICS = [
    'Politics',
    'Religion',
    'Violence',
    'Romance',
    'Horror',
    'Gambling',
    'Drugs & Alcohol',
    'Death & Grief',
    'War & Conflict',
    'Social Media',
];
export const MATURITY_LEVEL_INFO = {
    1: { label: 'Very Safe', emoji: '🌱', description: 'Gentle content for very young children (ages 3-5)' },
    2: { label: 'Child-Safe', emoji: '🧒', description: "Standard children's content (ages 6-10)" },
    3: { label: 'General', emoji: '📚', description: 'Mild adventure for preteens (ages 10-13)' },
    4: { label: 'Teen', emoji: '🎒', description: 'Teen-appropriate themes (ages 13-17)' },
    5: { label: 'Young Adult', emoji: '🎓', description: 'Complex themes for young adults (ages 16+)' },
    6: { label: 'None', emoji: '🔓', description: 'No content safety restrictions applied' },
};
export const MATURITY_LEVEL_MIN = 1;
export const MATURITY_LEVEL_MAX = 6;
export const MATURITY_LEVEL_DEFAULT = 2;
