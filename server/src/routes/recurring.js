import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, ledgerDate, ledgerTransaction, nextDay, sendLedgerError } from '../lib/ledger.js';
import { createDraftBill } from '../lib/billDraft.js';
import { advance, occurrences, scheduleInput } from '../lib/recurrence.js';
import { audit } from '../lib/audit.js';
const router = express.Router();
router.get('/preview', (req,res) => {
  try { const schedule = scheduleInput(req.query); res.json({ dates: occurrences(schedule.nextDueDate,schedule.recurrenceInterval,schedule.recurrenceAnchorDay) }); }
  catch(error) { sendLedgerError(res,error,'Schedule preview could not load.'); }
});
router.post('/run', async (req,res) => {
  const workspaceId=req.workspace.id; const requestId=req.body?.requestId; const kind=req.body?.kind ?? 'bill';
  try {
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)||!['bill','journal','all'].includes(kind)) throw new LedgerError('Choose a template kind and provide a stable run request ID.');
    const result=await ledgerTransaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${workspaceId} FOR UPDATE`;
      const existing=await tx.recurringRun.findUnique({where:{workspaceId_requestId:{workspaceId,requestId}}});
      if(existing){if(existing.kind!==kind)throw new LedgerError('This request ID belongs to another template kind.',409);return {...existing.result,replayed:true};}
      const cutoffDate=ledgerDate(new Date().toISOString()); const cutoff=nextDay(cutoffDate.toISOString());
      const [bills,entries]=await Promise.all([
        kind==='journal'?[]:tx.bill.findMany({where:{workspaceId,isRecurring:true,status:{not:'VOID'},nextDueDate:{lt:cutoff}},include:{lines:true},orderBy:[{nextDueDate:'asc'},{id:'asc'}],take:20}),
        kind==='bill'?[]:tx.journalEntry.findMany({where:{workspaceId,isRecurring:true,status:{not:'ARCHIVED'},nextDueDate:{lt:cutoff}},include:{journalLines:true},orderBy:[{nextDueDate:'asc'},{id:'asc'}],take:20}),
      ]);
      const due=[...bills.map(source=>({source,type:'bill'})),...entries.map(source=>({source,type:'journal'}))].sort((a,b)=>a.source.nextDueDate-b.source.nextDueDate||a.source.id.localeCompare(b.source.id)).slice(0,20);
      const run=await tx.recurringRun.create({data:{workspaceId,requestId,kind,cutoffDate,createdById:req.user.id,result:{}}});
      const details=[]; const instances=[];
      for(const {source,type} of due){
        const scheduledDate=ledgerDate(source.nextDueDate.toISOString());
        const interval=source.recurrenceInterval??'monthly';const anchor=source.recurrenceAnchorDay??scheduledDate.getUTCDate();
        const nextDate=advance(scheduledDate,interval,anchor);const delegate=type==='bill'?'bill':'journalEntry';
        const occurrence=await tx.recurringOccurrence.findUnique({where:{workspaceId_sourceType_sourceId_scheduledDate:{workspaceId,sourceType:type,sourceId:source.id,scheduledDate}}});
        if(!occurrence){
          let created;
          if(type==='bill'){
            const dueDate=new Date(scheduledDate.valueOf()+Math.max(0,ledgerDate(source.dueDate.toISOString())-ledgerDate(source.date.toISOString())));
            created=await createDraftBill(tx,workspaceId,{vendorId:source.vendorId,date:scheduledDate.toISOString(),dueDate:dueDate.toISOString(),notes:source.notes,tax:source.tax,taxCodeId:source.taxCodeId,isRecurring:false,lines:source.lines});
          }else{
            created=await tx.journalEntry.create({data:{workspaceId,date:scheduledDate,description:source.description,referenceNo:'REC-'+source.id+'-'+scheduledDate.toISOString().slice(0,10),status:'DRAFT',isRecurring:false,createdById:req.user.id,lastPreparedById:req.user.id,lastPreparedAt:new Date(),
              journalLines:{create:source.journalLines.map(line=>({accountId:line.accountId,debit:line.debit,credit:line.credit,description:line.description}))}}});
          }
          await tx.recurringOccurrence.create({data:{workspaceId,runId:run.id,sourceType:type,sourceId:source.id,scheduledDate,instanceId:created.id}});
          details.push((type==='bill'?'Bill '+created.billNo:'Journal '+created.referenceNo)+' created as a draft.');instances.push({kind:type,id:created.id,sourceId:source.id,date:scheduledDate.toISOString().slice(0,10)});
        }
        await tx[delegate].update({where:{id:source.id,workspaceId},data:{nextDueDate:nextDate,recurrenceAnchorDay:anchor}});
      }
      const [billCount,journalCount]=await Promise.all([
        kind==='journal'?0:tx.bill.count({where:{workspaceId,isRecurring:true,status:{not:'VOID'},nextDueDate:{lt:cutoff}}}),
        kind==='bill'?0:tx.journalEntry.count({where:{workspaceId,isRecurring:true,status:{not:'ARCHIVED'},nextDueDate:{lt:cutoff}}}),
      ]);
      const outcome={runId:run.id,created:instances.length,details,instances,remainingTemplates:billCount+journalCount};
      await tx.recurringRun.update({where:{id:run.id},data:{result:outcome}});
      await audit(tx,workspaceId,'RECURRING_DRAFTS_GENERATED',run.id,outcome);
      return outcome;
    },{timeout:20000});res.json(result);
  }catch(error){
    if(error.code==='P2002'&&typeof requestId==='string'){
      const previous=await prisma.recurringRun.findUnique({where:{workspaceId_requestId:{workspaceId,requestId}}});
      if(previous?.kind===kind)return res.json({...previous.result,replayed:true});
    }
    sendLedgerError(res,error,'Recurring drafts could not be generated. The run was rolled back; review the template and retry.');
  }
});
router.get('/bills',async(req,res)=>{
  try{const rows=await prisma.bill.findMany({where:{workspaceId:req.workspace.id,isRecurring:true,status:{not:'VOID'}},include:{vendor:{select:{name:true}},lines:true},orderBy:{nextDueDate:'asc'},take:100});
    res.json(rows.map(row=>({...row,nextOccurrences:occurrences(row.nextDueDate,row.recurrenceInterval??'monthly',row.recurrenceAnchorDay)})));
  }catch(error){sendLedgerError(res,error,'Recurring bill templates could not load.');}
});
router.put('/bills/:id/schedule',async(req,res)=>{
  try{
    if(typeof req.body.isRecurring!=='boolean')throw new LedgerError('Confirm whether the schedule is active.');
    const result=await ledgerTransaction(async tx=>{
      const where={id:req.params.id,workspaceId:req.workspace.id}; const bill=await tx.bill.findFirst({where});if(!bill||bill.status==='VOID')throw new LedgerError('Active bill template not found.',404);
      const data=req.body.isRecurring?{isRecurring:true,...scheduleInput(req.body,bill.date)}:{isRecurring:false,nextDueDate:null};
      const updated=await tx.bill.update({where,data});await audit(tx,req.workspace.id,'RECURRING_SCHEDULE_CHANGED',bill.id,{before:{isRecurring:bill.isRecurring,nextDueDate:bill.nextDueDate,recurrenceInterval:bill.recurrenceInterval,recurrenceAnchorDay:bill.recurrenceAnchorDay},after:data});return updated;
    });res.json(result);
  }catch(error){sendLedgerError(res,error,'Recurring schedule could not save.');}
});
router.get('/journal-entries',async(req,res)=>{
  try{const rows=await prisma.journalEntry.findMany({where:{workspaceId:req.workspace.id,isRecurring:true,status:{not:'ARCHIVED'}},include:{journalLines:{include:{account:{select:{name:true,code:true}}}}},orderBy:{nextDueDate:'asc'},take:100});
    res.json(rows.map(row=>({...row,nextOccurrences:occurrences(row.nextDueDate,row.recurrenceInterval??'monthly',row.recurrenceAnchorDay)})));
  }catch(error){sendLedgerError(res,error,'Recurring journal templates could not load.');}
});
export default router;
