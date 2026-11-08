'use client';
import {useCallback,useState,type FormEvent} from 'react';
import {API_BASE_URL,apiFetch} from '@/lib/api';
import {getWorkspaceProfile,type WorkspaceProfile} from '@/lib/books-api';
import {useWorkspaceData} from '@/lib/use-workspace-data';
import {useWorkspaces} from './WorkspaceProvider';
import {WorkspaceNotice,WorkspacePanel} from './WorkspaceUI';
function ControlForm({profile,onSaved}:{profile:WorkspaceProfile;onSaved:()=>void}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const owner=profile.role==='OWNER';
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const fields=new FormData(event.currentTarget);setBusy(true);setError('');try{
  const response=await apiFetch(API_BASE_URL+'/api/workspace-settings/controls',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberCanPost:fields.has('memberCanPost'),requireJournalApproval:fields.has('requireJournalApproval'),separateCloseReviewer:fields.has('separateCloseReviewer'),reason:String(fields.get('reason'))})});const result=await response.json();if(!response.ok)throw new Error(result.error);onSaved();
 }catch(cause){setError(cause instanceof Error?cause.message:'Controls could not save.');}finally{setBusy(false);}}
 return <form onSubmit={submit} className="grid gap-4 p-4 sm:p-5"><fieldset disabled={!owner||busy} className="grid gap-4">
  <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="memberCanPost" defaultChecked={profile.memberCanPost}/><span><strong>Allow bookkeepers to post</strong><span className="mt-1 block text-slate-600">Otherwise bookkeepers prepare drafts; reviewers, admins and owners post them. Read-only users can inspect reports and records.</span></span></label>
  <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="requireJournalApproval" defaultChecked={profile.requireJournalApproval}/><span><strong>Require a different person to post manual journals</strong><span className="mt-1 block text-slate-600">The poster must differ from the person who last prepared the draft, including owners.</span></span></label>
  <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="separateCloseReviewer" defaultChecked={profile.separateCloseReviewer}/><span><strong>Require a separate period-close reviewer</strong><span className="mt-1 block text-slate-600">Separate account preparation from verification and period creation from sign-off.</span></span></label>
  {owner&&<label className="grid gap-1.5 text-sm font-semibold">Reason for changing these controls<textarea name="reason" className="workspace-field min-h-20" minLength={5} maxLength={1000} required/></label>}
 </fieldset>{!owner&&<p className="text-sm text-slate-600">Only the workspace owner can change these controls.</p>}{error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}{owner&&<button className="workspace-primary w-fit" disabled={busy}>{busy?'Saving…':'Save posting controls'}</button>}</form>;
}
export default function PostingControls(){const {retry}=useWorkspaces();const load=useCallback(()=>getWorkspaceProfile(),[]);const state=useWorkspaceData(load);const [message,setMessage]=useState('');
 return <section id="posting-controls" className="scroll-mt-8"><WorkspacePanel title="Posting and review controls" description="Financial actions check live membership and these settings again inside the accounting transaction.">
 {state.loading&&<p role="status" className="p-4">Loading posting controls…</p>}{state.error&&<WorkspaceNotice title="Posting controls could not load" onRetry={state.retry}/>}
 {state.data&&<ControlForm key={JSON.stringify([state.data.id,state.data.memberCanPost,state.data.requireJournalApproval,state.data.separateCloseReviewer])} profile={state.data} onSaved={()=>{setMessage('Posting controls saved and recorded in the audit history.');state.retry();retry();}}/>}{message&&<p role="status" className="p-4 text-sm text-emerald-800">{message}</p>}
 </WorkspacePanel></section>;
}
