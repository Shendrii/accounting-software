'use client';
import {useState,type FormEvent} from 'react';
import {API_BASE_URL,apiFetch,type Bill} from '@/lib/api';
import AccountingDialog from './AccountingDialog';
import RecurringScheduleFields from './RecurringScheduleFields';
export default function RecurringScheduleEditor({bill,onSaved}:{bill:Bill;onSaved:()=>void}){
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [enabled,setEnabled]=useState(true);
 const [schedule,setSchedule]=useState({nextDueDate:bill.nextDueDate?.slice(0,10)||'',recurrenceInterval:bill.recurrenceInterval||'monthly',recurrenceAnchorDay:bill.recurrenceAnchorDay||Number(bill.nextDueDate?.slice(8,10))||1});
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{
  const response=await apiFetch(API_BASE_URL+'/api/recurring/bills/'+bill.id+'/schedule',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...schedule,isRecurring:enabled})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Schedule could not save.');setOpen(false);onSaved();
 }catch(cause){setError(cause instanceof Error?cause.message:'Schedule could not save.');}finally{setBusy(false);}}
 return <><button type="button" className="workspace-text-action" onClick={()=>setOpen(true)}>Edit schedule</button>{open&&<AccountingDialog title={'Recurring schedule · '+bill.billNo} busy={busy} onDismiss={()=>setOpen(false)}><form onSubmit={submit} className="grid gap-4">
  <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={event=>setEnabled(event.target.checked)}/>Generate future drafts from this template</label>
  {enabled&&<RecurringScheduleFields value={schedule} onChange={setSchedule} disabled={busy}/>}
  {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={busy}>{busy?'Saving…':'Save schedule'}</button>
 </form></AccountingDialog>}</>;
}
