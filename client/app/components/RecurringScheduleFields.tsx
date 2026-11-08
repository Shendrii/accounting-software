'use client';
import {useCallback} from 'react';
import {API_BASE_URL,apiFetch} from '@/lib/api';
import {useWorkspaceData} from '@/lib/use-workspace-data';
export type Schedule={recurrenceInterval:string;nextDueDate:string;recurrenceAnchorDay:number};
export default function RecurringScheduleFields({value,onChange,disabled=false}:{value:Schedule;onChange:(value:Schedule)=>void;disabled?:boolean}){
 const load=useCallback(async()=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value.nextDueDate))return [] as string[];
  const query=new URLSearchParams({nextDueDate:value.nextDueDate,recurrenceInterval:value.recurrenceInterval,recurrenceAnchorDay:String(value.recurrenceAnchorDay)});
  const response=await apiFetch(API_BASE_URL+'/api/recurring/preview?'+query);const data=await response.json();if(!response.ok)throw new Error(data.error);return data.dates as string[];
 },[value.nextDueDate,value.recurrenceInterval,value.recurrenceAnchorDay]);
 const preview=useWorkspaceData(load);
 return <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
  <label className="grid gap-1.5 text-sm font-semibold">Repeat interval<select className="workspace-field" value={value.recurrenceInterval} onChange={event=>onChange({...value,recurrenceInterval:event.target.value})}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
  <label className="grid gap-1.5 text-sm font-semibold">Next draft date<input type="date" className="workspace-field" required value={value.nextDueDate} onChange={event=>onChange({...value,nextDueDate:event.target.value,recurrenceAnchorDay:Number(event.target.value.slice(8,10))||1})}/></label>
  {value.recurrenceInterval!=='weekly'&&<label className="grid gap-1.5 text-sm font-semibold">Repeat day<select className="workspace-field" value={value.recurrenceAnchorDay} onChange={event=>onChange({...value,recurrenceAnchorDay:Number(event.target.value)})}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}{i===30?' · last available day':''}</option>)}</select></label>}
  <div className="space-y-2 text-sm sm:col-span-2"><p className="text-slate-600">Short months use their last available day; later months return to the selected repeat day. Bills keep the original number of days between document and due date.</p>
   {preview.data?.length?<p><strong>Next drafts:</strong> {preview.data.join(' · ')}</p>:<p className="text-slate-600">Choose a next draft date to preview three occurrences.</p>}
   {preview.error&&<p role="alert" className="text-rose-800">Schedule preview could not load. Check the date and repeat day.</p>}
   <p className="text-xs text-slate-600">Use Run due templates to generate drafts for review. Nothing posts automatically.</p>
  </div>
 </fieldset>;
}
