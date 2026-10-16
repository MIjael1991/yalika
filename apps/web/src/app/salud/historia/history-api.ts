async function api<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/orion${path}`,{...init,credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(init?.headers??{})}});
  const body=await response.json().catch(()=>null); if(!response.ok){const m=body?.message??body?.error??`Error ${response.status}`;throw new Error(Array.isArray(m)?m.join('. '):String(m));} return body as T;
}
export const historyApi={
  history:()=>api<any>('/clinical/r304/me/history'),
  createEpisode:(input:any)=>api<any>('/clinical/r304/me/episodes',{method:'POST',body:JSON.stringify(input)}),
  resolveEpisode:(id:string)=>api<any>(`/clinical/r304/me/episodes/${encodeURIComponent(id)}/resolve`,{method:'POST',body:JSON.stringify({})}),
  link:(input:any)=>api<any>('/clinical/r304/me/links',{method:'POST',body:JSON.stringify(input)}),
  privacy:(input:any)=>api<any>('/clinical/r304/me/privacy',{method:'PUT',body:JSON.stringify(input)}),
  sharedHistory:(sessionId:string)=>api<any>(`/clinical/r304/shared/structured-history?sessionId=${encodeURIComponent(sessionId)}`),
  emergencySetup:()=>api<any>('/clinical/r304/me/emergency'),
  emergencyPolicy:(input:any)=>api<any>('/clinical/r304/me/emergency/policy',{method:'PUT',body:JSON.stringify(input)}),
  addDelegate:(input:any)=>api<any>('/clinical/r304/me/emergency/delegates',{method:'POST',body:JSON.stringify(input)}),
  revokeDelegate:(id:string)=>api<any>(`/clinical/r304/me/emergency/delegates/${encodeURIComponent(id)}/revoke`,{method:'POST'}),
  delegateAuthorizations:()=>api<any[]>('/clinical/r304/delegate/authorizations'),
  relayLink:(input:any)=>api<any>('/clinical/r304/delegate/emergency-link',{method:'POST',body:JSON.stringify(input)}),
  emergencyAccess:(token:string)=>api<any>('/clinical/r304/access/emergency',{method:'POST',body:JSON.stringify({token})}),
};
