'use client';
import {useCallback,useState} from 'react';
import {API_BASE_URL,apiFetch,getAccounts,type Account,type PageResult} from '@/lib/api';
import {useWorkspaceData} from '@/lib/use-workspace-data';

import {WorkspaceNotice,WorkspacePanel} from './WorkspaceUI';
import AccountingDialog from './AccountingDialog';
import {PostingTable} from './PostingTable';
type Audit={id:string;actorId:string;actorName:string;action:string;entityId:string;reason:string|null;createdAt:string;data?:unknown};
async function read<T>(path:string):Promise<T>{const response=await apiFetch(API_BASE_URL+'/api/audit'+path);const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
export default function AuditHistory({entityId=''}:{entityId?:string}){
 const [page,setPage]=useState(1);const [q,setQ]=useState('');const [selected,setSelected]=useState<Audit|null>(null);const [error,setError]=useState('');const [accounts,setAccounts]=useState<Account[]>([]);
 const load=useCallback(()=>read<PageResult<Audit>>('?'+new URLSearchParams({page:String(page),pageSize:'25',q,...(entityId&&{entityId})})),[page,q,entityId]);const state=useWorkspaceData(load);
 async function details(event:Audit){setError('');try{const [record,chart]=await Promise.all([read<Audit>('/'+event.id),getAccounts()]);setAccounts(chart);setSelected({...record,actorName:event.actorName});}catch(cause){setError(cause instanceof Error?cause.message:'Audit evidence could not load.');}}
 return <WorkspacePanel title="Accounting audit history" description="Retained actors, actions and evidence. Legacy entries without recorded actors are not attributed by guesswork.">
  <div className="p-4"><label className="grid max-w-md gap-1.5 text-sm font-semibold">Filter actions<input className="workspace-field" value={q} maxLength={160} onChange={event=>{setQ(event.target.value);setPage(1);}} placeholder="e.g. posting, correction, period…"/></label></div>
  {state.error&&<WorkspaceNotice title="Audit history could not load" onRetry={state.retry}/>}{error&&<p role="alert" className="p-4 text-sm text-rose-800">{error}</p>}
  <div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Evidence</th></tr></thead><tbody>{state.data?.items.map(event=><tr key={event.id}><td data-label="When">{new Date(event.createdAt).toLocaleString()}</td><td data-label="Who">{event.actorName}</td><td data-label="Action">{event.action.toLowerCase().replaceAll('_',' ')}{event.reason&&<p className="mt-1 max-w-96 break-words text-xs text-slate-600">{event.reason}</p>}</td><td data-label="Evidence"><button type="button" className="workspace-text-action" onClick={()=>void details(event)}>Inspect evidence</button></td></tr>)}</tbody></table></div>
  {!state.data?.items.length&&<p role="status" className="p-4 text-sm text-slate-600">{state.loading?'Loading audit history…':'No recorded events match this view.'}</p>}
  <div className="workbench-pagination"><p>{state.data?.total??0} events · Page {page} of {state.data?.totalPages??1}</p><div className="flex gap-2"><button className="workspace-button" disabled={state.loading||page===1} onClick={()=>setPage(page-1)}>Previous</button><button className="workspace-button" disabled={state.loading||page>=(state.data?.totalPages??1)} onClick={()=>setPage(page+1)}>Next</button></div></div>
  {selected&&<AccountingDialog title="Retained accounting evidence" onDismiss={()=>setSelected(null)}><div className="space-y-3"><p className="text-sm">{selected.actorName} · {new Date(selected.createdAt).toLocaleString()}</p><p className="text-sm break-all">{selected.action} · {selected.entityId}</p>{selected.reason&&<p className="text-sm">{selected.reason}</p>}<AuditEvidence data={selected.data} accounts={accounts}/><button className="workspace-button" onClick={()=>{const blob=new Blob([JSON.stringify(selected,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='audit-evidence-'+selected.id+'.json';link.click();URL.revokeObjectURL(url);}}>Export complete audit evidence</button></div></AccountingDialog>}
 </WorkspacePanel>;
}

function AuditEvidence({data,accounts}:{data:unknown;accounts:Account[]}){
 if(!data||typeof data!=='object'||Array.isArray(data))return <p className="text-sm">No additional evidence was recorded.</p>;
 const record=data as Record<string,unknown>;
 const label=(key:string)=>key.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
 const values=(object:Record<string,unknown>)=><dl className="divide-y divide-slate-200 text-sm">{Object.entries(object).filter(([,value])=>value===null||['string','number','boolean'].includes(typeof value)).map(([key,value])=><div className="grid gap-1 py-2" key={key}><dt className="font-semibold capitalize">{label(key)}</dt><dd className="break-all text-slate-700">{value===null?'Not recorded':typeof value==='boolean'?value?'Yes':'No':String(value)}</dd></div>)}</dl>;
 const lines=Array.isArray(record.lines)?record.lines:[];
 return <div className="max-h-96 space-y-4 overflow-auto">{values(record)}
 {lines.length>0&&<PostingTable lines={lines.map(line=>{const account=accounts.find(row=>row.id===line.accountId);return {label:line.accountName||account?.name||line.accountId,debit:String(line.debit||'0'),credit:String(line.credit||'0')};})}/>}
 {['before','after','totals'].map(key=>record[key]&&typeof record[key]==='object'&&!Array.isArray(record[key])?<section key={key}><h3 className="text-sm font-semibold capitalize">{label(key)}</h3>{values(record[key] as Record<string,unknown>)}</section>:null)}
 {Array.isArray(record.entries)&&<p className="text-sm">{record.entries.length} linked journal entries retained in the opening batch.</p>}
 <p className="text-xs text-slate-600">Export the complete evidence to inspect all linked records and the original review snapshot.</p>
 </div>;
}
