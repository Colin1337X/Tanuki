import { getKnowledgeDocuments,saveKnowledgeDocument } from './storage.js';
export async function searchKnowledgeBase(query,topK=3){
 const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])];
 return getKnowledgeDocuments().map(doc=>{const text=`${doc.title} ${doc.content} ${(doc.tags||[]).join(' ')}`.toLowerCase();return {...doc,score:terms.reduce((sum,term)=>sum+(text.includes(term)?1:0),0)};}).filter(doc=>doc.score>0).sort((a,b)=>b.score-a.score).slice(0,topK);
}
export async function embedAndSaveDocument(doc){saveKnowledgeDocument(doc);return doc;}
