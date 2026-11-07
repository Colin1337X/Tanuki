import fs from 'fs';
import path from 'path';
import { READING_LEVEL_VALUES, razKidsToReadingLevel } from './reading-levels.js';
import { MATURITY_LEVEL_DEFAULT } from './safety.js';
import { DATA_DIR, database, transaction, getRecords, putRecord, removeRecord, readUsers, readUser, putUser, removeUser } from './database.js';
import { validCredentials, hashPassword } from './passwords.js';
export const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
const DEFAULT_SYSTEM_PROMPT = 'You are a creative story writer. Create a detailed story with clear exposition, rising action, climax, falling action, and resolution. Explain sight, touch, taste, scent, sound, and the character\'s thought in detail.';
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}
export function getConfig() {
    return getRecords('config')[0] ?? {systemPrompt:DEFAULT_SYSTEM_PROMPT,globalSafety:{contentMaturityLevel:2,maturityLevelRange:{min:1,max:2}}};
}
export function saveConfig(config) {
    putRecord('config','global',config);
}
export function getStories() {
    return getRecords('stories').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export function saveStory(story) {
    putRecord('stories',story.id,story);
}
export function updateStory(id, content) {
return transaction(()=>{
    const stories = getStories();
    const idx = stories.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    stories[idx] = { ...stories[idx], story: content, ...(stories[idx].chapters ? {chapters:[content], options:{...stories[idx].options,chapterCount:1},generationComplete:true} : {}), updatedAt: new Date().toISOString() };
    putRecord('stories', stories[idx].id, stories[idx]);
    return stories[idx];

});
}
/**
 * Save a brand-new chapter-based story record with an empty chapters array.
 * `story` is initialised to an empty string and will be filled as chapters
 * are appended.
 */
export function saveChapterStory(record) {
return transaction(()=>{
    const full = { ...record, story: record.story ?? '' };
    const stories = getStories();
    stories.unshift(full);
    putRecord('stories', full.id, full);
    return full;

});
}
/** Append a completed chapter to a chapter-based story and rebuild `story`. */
export function appendChapter(id, chapterText) {
return transaction(()=>{
    const stories = getStories();
    const idx = stories.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    const chapters = [...(stories[idx].chapters ?? []), chapterText];
    stories[idx] = {
        ...stories[idx],
        chapters,
        story: chapters.join('\n\n'),
        updatedAt: new Date().toISOString(),
    };
    putRecord('stories', stories[idx].id, stories[idx]);
    return stories[idx];

});
}
/** Mark a chapter-based story as fully generated. */
export function markStoryComplete(id) {
return transaction(()=>{
    const stories = getStories();
    const idx = stories.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    stories[idx] = {
        ...stories[idx],
        generationComplete: true,
        updatedAt: new Date().toISOString(),
    };
    putRecord('stories', stories[idx].id, stories[idx]);
    return stories[idx];

});
}
/**
 * Extend a completed chapter-based story by adding more chapters.
 * Resets `generationComplete` so the chapter route will accept new requests.
 */
export function extendStory(id, additionalChapters) {
return transaction(()=>{
    const stories = getStories();
    const idx = stories.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    const current = stories[idx];
    const currentCount = current.options?.chapterCount ?? (current.chapters?.length ?? 0);
    stories[idx] = {
        ...current,
        options: { ...current.options, chapterCount: currentCount + additionalChapters },
        generationComplete: false,
        updatedAt: new Date().toISOString(),
    };
    putRecord('stories', stories[idx].id, stories[idx]);
    return stories[idx];

});
}
export function getStoredUsers() {
    return readUsers();
}
export function saveStoredUsers(users) {
    transaction(()=>{for(const user of users) putUser(user);});
}
export function addStoredUser(user) {
    transaction(()=>{if(readUser(user.username)) throw Object.assign(new Error('Username already exists'),{status:409}); putUser(user);});
}
export function deleteStoredUser(username) {
    return removeUser(username);
}
export function updateStoredUser(username, patch) {
    return transaction(()=>{const user=readUser(username);if(!user)return null;const updated={...user,...patch};putUser(updated);return updated;});
}
/** Returns the list of classroom IDs that a teacher manages. */
export function getManagedClassroomIds(username) {
    const user = getStoredUsers().find((u) => u.username === username);
    return user?.managedClassroomIds ?? [];
}
/**
 * Returns true when the given teacher manages at least one classroom that
 * contains the specified student.
 */
export function isTeacherOfStudent(teacherUsername, studentUsername) {
    const classroomIds = getManagedClassroomIds(teacherUsername);
    if (classroomIds.length === 0)
        return false;
    const config = getConfig();
    return classroomIds.some((id) => config.classrooms?.[id]?.members.includes(studentUsername) ?? false);
}
/**
 * Import students from a CSV string.  The CSV may have an optional header row
 * (detected by the first row containing the word "username").  Each data row
 * must have at least two comma-separated fields: username and password.
 * Note: commas within usernames or passwords are not supported.
 * Returns the number of users successfully imported.
 */
export function importStudentsFromCsv(csv) {
return transaction(()=>{
    const lines = csv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length === 0)
        return 0;
    // Detect optional header row and locate column indices
    const firstLineLower = lines[0].toLowerCase();
    const hasHeader = firstLineLower.includes('username');
    const dataLines = hasHeader ? lines.slice(1) : lines;
    // Determine column positions from header (defaults: username=0, password=1, reading_level=2)
    let usernameIdx = 0;
    let passwordIdx = 1;
    let readingLevelIdx = 2;
    if (hasHeader) {
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const uIdx = headers.indexOf('username');
        const pIdx = headers.indexOf('password');
        const rlIdx = headers.indexOf('reading_level');
        if (uIdx !== -1)
            usernameIdx = uIdx;
        if (pIdx !== -1)
            passwordIdx = pIdx;
        readingLevelIdx = rlIdx; // -1 means column absent
    }
    const users = getStoredUsers();
    let count = 0;
    for (const line of dataLines) {
        const parts = line.split(',');
        if (parts.length < 2)
            continue;
        const username = parts[usernameIdx]?.trim();
        const password = parts[passwordIdx]?.trim();
        if (!validCredentials(username, password))
            continue;
        const rawLevel = readingLevelIdx >= 0 ? parts[readingLevelIdx]?.trim() : undefined;
        const readingLevel = READING_LEVEL_VALUES.find((v) => v.toLowerCase() === rawLevel?.toLowerCase()) ??
            (rawLevel ? razKidsToReadingLevel(rawLevel) : undefined);
        const idx = users.findIndex((u) => u.username === username);
        if (idx !== -1) {
            if (users[idx].role !== 'student') {
                // Never overwrite an existing teacher or admin account with student role.
                continue;
            }
            // Update the existing student entry.
            users[idx] = { ...users[idx], username, password:hashPassword(password), role: 'student', ...(readingLevel ? { readingLevel } : {}) };
        }
        else {
            // New user — add as student.
            users.push({ username, password:hashPassword(password), role: 'student', ...(readingLevel ? { readingLevel } : {}) });
        }
        count++;
    }
    saveStoredUsers(users);
    return count;

});
}
export function getRecordings() {
    return getRecords('recordings');
}
export function getRecordingsForStory(storyId) {
    return getRecordings().filter((r) => r.storyId === storyId);
}
export function saveRecordingMeta(recording) {
    putRecord('recordings',recording.id,recording);
}
export function deleteRecordingMeta(id) {
    return transaction(()=>{const record=getRecordings().find(r=>r.id===id);if(!record)return null;removeRecord('recordings',id);return record;});
}
/**
 * Resolves the effective content-maturity level and blocked topics for a
 * student by merging per-student, classroom, and global settings.
 *
 * Priority (highest → lowest):
 *  1. Per-student override (`StoredUser.contentMaturityLevel` / `.blockedTopics`)
 *  2. Classroom defaults (`ClassroomConfig`)
 *  3. Global safety defaults (`Config.globalSafety`)
 *  4. Hard-coded defaults (level 2, no blocked topics)
 *
 * Blocked topics are *accumulated* across all levels (global ∪ classroom ∪ student).
 * The effective maturity level is clamped to the tightest applicable range.
 */
function safetyRange(config, rooms) {
    const ranges=[config.globalSafety?.maturityLevelRange??{min:1,max:6},...rooms.map(c=>c.maturityLevelRange).filter(Boolean)];
    const max=Math.min(...ranges.map(r=>r.max??6));
    // A conflicting minimum never overrides a safer maximum.
    return {min:Math.min(max,Math.max(...ranges.map(r=>r.min??1))),max};
}
export function getEffectiveMaturitySettings(username) {
    const config=getConfig();const user=getStoredUsers().find(u=>u.username===username);
    const rooms=Object.values(config.classrooms??{}).filter(c=>c.members.includes(username));
    const range=safetyRange(config,rooms);
    const classroomLevels=rooms.map(c=>c.contentMaturityLevel).filter(n=>n!==undefined);
    const level=user?.contentMaturityLevel??(classroomLevels.length?Math.min(...classroomLevels):config.globalSafety?.contentMaturityLevel??MATURITY_LEVEL_DEFAULT);
    return {contentMaturityLevel:Math.min(range.max,Math.max(range.min,level)),blockedTopics:[...new Set([...(config.globalSafety?.blockedTopics??[]),...rooms.flatMap(c=>c.blockedTopics??[]),...(user?.blockedTopics??[])])]};
}
export function getEffectiveMaturityRange(username) {
    const config=getConfig();return safetyRange(config,Object.values(config.classrooms??{}).filter(c=>c.members.includes(username)));
}
export function getKnowledgeDocuments() {
    return getRecords('knowledge-base');
}
export function saveKnowledgeDocument(doc) {
    putRecord('knowledge-base',doc.id,doc);
}
export function deleteKnowledgeDocument(id) {
    return removeRecord('knowledge-base',id);
}
