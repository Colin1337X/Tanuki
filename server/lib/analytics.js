const DAY = 86400000;
// Metadata only: never return prompts, story text, ciphertext or credentials.
export function buildAnalytics(users, stories, classrooms, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const firstDay = Date.parse(today) - 29 * DAY;
  const dates = Array.from({length:30}, (_, i) => new Date(firstDay + i * DAY).toISOString().slice(0,10));
  const byUser = new Map(users.map(u => [u.username, []]));
  for (const story of stories) {
    const time = Date.parse(story.createdAt);
    if (byUser.has(story.username) && Number.isFinite(time) && time <= now) byUser.get(story.username).push({time, genre:story.options?.genre});
  }
  const students = users.map(u => {
    const records = byUser.get(u.username);
    const counts = Object.create(null), daily = Object.create(null);
    for (const r of records) {
      if (typeof r.genre === 'string' && r.genre) counts[r.genre] = (counts[r.genre] || 0) + 1;
      const date = new Date(r.time).toISOString().slice(0,10);
      if (r.time >= firstDay) daily[date] = (daily[date] || 0) + 1;
    }
    const count = (days, offset=0) => records.filter(r => r.time > now-(days+offset)*DAY && r.time <= now-offset*DAY).length;
    return {username:u.username, readingLevel:u.readingLevel || 'Not set', lexileTarget:u.lexileTarget ?? null,
      onboardingCompleted:!!u.onboardingCompleted, disabled:!!u.disabled,
      classroomIds:Object.entries(classrooms).filter(([,c]) => c.members?.includes(u.username)).map(([id]) => id),
      totalStories:records.length, storiesLast7Days:count(7), storiesLast30Days:count(30),
      storiesPrevious7Days:count(7,7), storiesPrevious30Days:count(30,30),
      lastActiveAt:records.length ? new Date(records.reduce((max,r)=>Math.max(max,r.time),-Infinity)).toISOString() : null,
      genreBreakdown:counts, daily,
      favoriteGenres:[...new Set([...Object.keys(counts).sort((a,b)=>counts[b]-counts[a]), ...(u.preferences?.favoriteGenres || [])])].slice(0,5)};
  }).sort((a,b)=>(b.lastActiveAt || '').localeCompare(a.lastActiveAt || '') || a.username.localeCompare(b.username));
  const sum = key => students.reduce((n,s)=>n+s[key],0);
  const readingLevelDistribution=Object.create(null), genres=Object.create(null);
  for(const s of students){readingLevelDistribution[s.readingLevel]=(readingLevelDistribution[s.readingLevel]||0)+1;for(const [g,n] of Object.entries(s.genreBreakdown))genres[g]=(genres[g]||0)+n;}
  return {students, dates, generatedAt:new Date(now).toISOString(),
    classrooms:Object.entries(classrooms).map(([id,c])=>({id,name:c.name})),
    summary:{totalStudents:students.length,totalStories:sum('totalStories'),storiesLast7Days:sum('storiesLast7Days'),storiesLast30Days:sum('storiesLast30Days'),
      activeStudents7Days:students.filter(s=>s.storiesLast7Days>0).length,activeStudents30Days:students.filter(s=>s.storiesLast30Days>0).length,
      onboardedStudents:students.filter(s=>s.onboardingCompleted).length,readingLevelDistribution,
      topGenres:Object.entries(genres).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([genre,count])=>({genre,count}))}};
}
