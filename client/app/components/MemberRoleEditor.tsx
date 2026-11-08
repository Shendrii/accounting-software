'use client';
import {useState,type FormEvent} from 'react';
import {API_BASE_URL,apiFetch,type AuthWorkspace,type WorkspaceMember} from '@/lib/api';
import AccountingDialog from './AccountingDialog';
export default function MemberRoleEditor({workspace,member,onSaved}:{workspace:AuthWorkspace;member:WorkspaceMember;onSaved:()=>void}){
 const [open,setOpen]=useState(false);const [role,setRole]=useState(member.role);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 if(member.role==='OWNER'||workspace.role!=='OWNER'&&member.role==='ADMIN')return null;
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{
  const response=await apiFetch(API_BASE_URL+'/api/workspaces/'+workspace.id+'/members/'+member.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});const data=await response.json();if(!response.ok)throw new Error(data.error);setOpen(false);onSaved();
 }catch(cause){setError(cause instanceof Error?cause.message:'Access could not save.');}finally{setBusy(false);}}
 return <><button type="button" className="workspace-text-action" onClick={()=>setOpen(true)}>Change access</button>{open&&<AccountingDialog title={'Change access · '+member.user.name} busy={busy} onDismiss={()=>setOpen(false)}><form onSubmit={save} className="grid gap-4">
  <p className="text-sm">Access applies to {workspace.name}. Financial requests recheck the current role when they run.</p>
  <label className="grid gap-1.5 text-sm font-semibold">Workspace role<select className="workspace-field" value={role} onChange={event=>setRole(event.target.value as AuthWorkspace['role'])}><option value="VIEWER">Read only — inspect records</option><option value="MEMBER">Bookkeeper — prepare drafts</option><option value="APPROVER">Reviewer — post and correct</option>{workspace.role==='OWNER'&&<option value="ADMIN">Admin — manage books and team</option>}</select></label>
  {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={busy}>{busy?'Saving…':'Save access role'}</button>
 </form></AccountingDialog>}</>;
}
