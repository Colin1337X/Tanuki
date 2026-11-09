import { ResponseQueue } from './response-queue.js';
let queue;
export function responseQueue() { return queue ||= new ResponseQueue(); }
export async function closeResponseQueue() { if (queue) { await queue.close(); queue = undefined; } }
