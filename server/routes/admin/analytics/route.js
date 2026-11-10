import { HttpResponse } from '../../../http.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { getStoredUsers, getStories, getManagedClassroomIds, getConfig } from '../../../lib/storage.js';
import { buildAnalytics } from '../../../lib/analytics.js';
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !['admin','teacher'].includes(user.role)) return HttpResponse.json({error:'Forbidden'},{status:403});
  const managed = new Set(user.role === 'teacher' ? getManagedClassroomIds(user.username) : []);
  const classrooms = Object.fromEntries(Object.entries(getConfig().classrooms || {}).filter(([id])=>user.role === 'admin' || managed.has(id)));
  const members = new Set(Object.values(classrooms).flatMap(c=>c.members || []));
  const students = getStoredUsers().filter(u=>u.role === 'student' && (user.role === 'admin' || members.has(u.username)));
  return HttpResponse.json(buildAnalytics(students, getStories(), classrooms));
}
