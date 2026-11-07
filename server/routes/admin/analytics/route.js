import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStoredUsers, getStories, getManagedClassroomIds, getConfig } from '../../../lib/storage.js';
const MAX_FAVORITE_GENRES = 5;
const TOP_GENRES_LIMIT = 8;
export async function GET() {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    let storedUsers = getStoredUsers().filter((u) => u.role === 'student');
    // Teachers see only students in their managed classrooms.
    if (user.role === 'teacher') {
        const classroomIds = getManagedClassroomIds(user.username);
        const config = getConfig();
        const memberSet = new Set();
        for (const id of classroomIds) {
            for (const m of config.classrooms?.[id]?.members ?? [])
                memberSet.add(m);
        }
        storedUsers = storedUsers.filter((s) => memberSet.has(s.username));
    }
    const stories = getStories();
    const now = new Date();
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    // Build a map: username → list of story dates
    const storyMap = {};
    const genreMap = {};
    for (const story of stories) {
        if (!storyMap[story.username])
            storyMap[story.username] = [];
        storyMap[story.username].push(story.createdAt);
        // Track genres per user
        const genre = story.options?.genre;
        if (genre) {
            if (!genreMap[story.username])
                genreMap[story.username] = {};
            genreMap[story.username][genre] = (genreMap[story.username][genre] ?? 0) + 1;
        }
    }
    // Collect all known usernames (file-based students + anyone who has stories)
    // For teachers, limit to their classroom members only.
    const allowedUsernames = new Set(storedUsers.map((u) => u.username));
    const allUsernames = Array.from(new Set([
        ...storedUsers.map((u) => u.username),
        ...(user.role === 'admin' ? Object.keys(storyMap) : Object.keys(storyMap).filter((u) => allowedUsernames.has(u))),
    ]));
    const analytics = allUsernames.map((username) => {
        const profileUser = storedUsers.find((u) => u.username === username);
        const dates = storyMap[username] ?? [];
        const sorted = [...dates].sort();
        // Parse dates once to avoid redundant Date construction in filter callbacks
        const nowMs = now.getTime();
        const dateTimes = dates.map((d) => new Date(d).getTime());
        const storiesLast7Days = dateTimes.filter((t) => nowMs - t < ms7).length;
        const storiesLast30Days = dateTimes.filter((t) => nowMs - t < ms30).length;
        const genreBreakdown = genreMap[username] ?? {};
        const topGenres = Object.entries(genreBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([genre]) => genre);
        // Also include user's self-reported favorite genres
        const favGenres = profileUser?.preferences?.favoriteGenres ?? [];
        const allFavGenres = Array.from(new Set([...topGenres, ...favGenres])).slice(0, MAX_FAVORITE_GENRES);
        return {
            username,
            readingLevel: profileUser?.readingLevel,
            onboardingCompleted: profileUser?.onboardingCompleted ?? false,
            totalStories: dates.length,
            storiesLast7Days,
            storiesLast30Days,
            lastActiveAt: sorted.length > 0 ? sorted[sorted.length - 1] : null,
            favoriteGenres: allFavGenres.length > 0 ? allFavGenres : undefined,
            genreBreakdown: Object.keys(genreBreakdown).length > 0 ? genreBreakdown : undefined,
        };
    });
    // Sort by most recently active
    analytics.sort((a, b) => {
        if (a.lastActiveAt && b.lastActiveAt) {
            return b.lastActiveAt.localeCompare(a.lastActiveAt);
        }
        if (a.lastActiveAt)
            return -1;
        if (b.lastActiveAt)
            return 1;
        return a.username.localeCompare(b.username);
    });
    // Build aggregate summary
    const readingLevelDistribution = {};
    const globalGenreCount = {};
    let totalStoriesAll = 0;
    let storiesLast7All = 0;
    let storiesLast30All = 0;
    let activeStudents7 = 0;
    let activeStudents30 = 0;
    let onboardedCount = 0;
    for (const a of analytics) {
        totalStoriesAll += a.totalStories;
        storiesLast7All += a.storiesLast7Days;
        storiesLast30All += a.storiesLast30Days;
        if (a.storiesLast7Days > 0)
            activeStudents7++;
        if (a.storiesLast30Days > 0)
            activeStudents30++;
        if (a.onboardingCompleted)
            onboardedCount++;
        if (a.readingLevel) {
            readingLevelDistribution[a.readingLevel] = (readingLevelDistribution[a.readingLevel] ?? 0) + 1;
        }
        if (a.genreBreakdown) {
            for (const [genre, count] of Object.entries(a.genreBreakdown)) {
                globalGenreCount[genre] = (globalGenreCount[genre] ?? 0) + count;
            }
        }
    }
    const topGenres = Object.entries(globalGenreCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_GENRES_LIMIT)
        .map(([genre, count]) => ({ genre, count }));
    const summary = {
        totalStudents: analytics.length,
        onboardedStudents: onboardedCount,
        activeStudents7Days: activeStudents7,
        activeStudents30Days: activeStudents30,
        totalStories: totalStoriesAll,
        storiesLast7Days: storiesLast7All,
        storiesLast30Days: storiesLast30All,
        readingLevelDistribution,
        topGenres,
    };
    return HttpResponse.json({ students: analytics, summary });
}
