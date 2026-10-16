export type DraftSection = {id:string;type:string;title:string|null;enabled:boolean;sortOrder:number;layout:string;content?:unknown};
export type SiteDraft={version:1;siteId:string;baseUpdatedAt:string;savedAt:string;sections:DraftSection[]};
export function draftKey(userId:string,companyId:string,siteId:string){return `yaleka.site-draft.v1:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}:${encodeURIComponent(siteId)}`;}
export function parseDraft(raw:string|null,siteId:string):SiteDraft|null{
 if(!raw)return null;
 if(raw.length>200000)throw Error('El borrador local excede el tamaño permitido.');
 const d=JSON.parse(raw);
 if(d?.version!==1||d.siteId!==siteId||typeof d.baseUpdatedAt!=='string'||!Number.isFinite(Date.parse(d.baseUpdatedAt))||typeof d.savedAt!=='string'||!Number.isFinite(Date.parse(d.savedAt))||!Array.isArray(d.sections)||d.sections.length>30)throw Error('El borrador local no tiene un formato válido.');
 for(const s of d.sections){if(!s||typeof s.id!=='string'||!['hero','banner','catalog','promotions','gallery','video','menu','text','loyalty','location','contact'].includes(s.type)||(s.title!==null&&typeof s.title!=='string')||typeof s.enabled!=='boolean'||!Number.isInteger(s.sortOrder)||s.sortOrder<0||typeof s.layout!=='string'||(s.content!=null&&(typeof s.content!=='object'||Array.isArray(s.content))))throw Error('Una sección del borrador no es válida.');}
 return d;
}
export function sectionPayload(sections:DraftSection[]){return sections.map((s,i)=>({type:s.type,title:s.title??'',enabled:s.enabled,sortOrder:i*10,layout:s.layout,content:s.content??{}}));}
