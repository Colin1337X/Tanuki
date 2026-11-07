/**
 * Reading level constants shared between server-side storage logic and
 * client-side components.  This file must NOT import any Node-only modules
 * (e.g. `fs`, `path`) so it remains safe to use in browser bundles.
 */
export const READING_LEVEL_VALUES = [
    'Pre-K',
    'Kindergarten',
    'Elementary',
    'Middle School',
    'High School',
    'College',
    'Graduate',
    'Doctorate',
];
/**
 * Maps Raz-Kids reading levels (AA–Z3) to the app's ReadingLevel categories.
 * Returns undefined when the supplied string is not a recognised Raz-Kids level.
 */
const RAZ_KIDS_MAP = {
    AA: 'Pre-K',
    A: 'Pre-K',
    B: 'Kindergarten',
    C: 'Kindergarten',
    D: 'Elementary',
    E: 'Elementary',
    F: 'Elementary',
    G: 'Elementary',
    H: 'Elementary',
    I: 'Elementary',
    J: 'Elementary',
    K: 'Elementary',
    L: 'Elementary',
    M: 'Elementary',
    N: 'Elementary',
    O: 'Middle School',
    P: 'Middle School',
    Q: 'Middle School',
    R: 'Middle School',
    S: 'Middle School',
    T: 'Middle School',
    U: 'Middle School',
    V: 'High School',
    W: 'High School',
    X: 'High School',
    Y: 'High School',
    Z: 'College',
    Z1: 'Graduate',
    Z2: 'Graduate',
    Z3: 'Doctorate',
};
export function razKidsToReadingLevel(level) {
    return RAZ_KIDS_MAP[level.toUpperCase()];
}
