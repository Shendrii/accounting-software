import express from 'express';
import prisma from '../db/prisma.js';
import {LedgerError,sendLedgerError} from '../lib/ledger.js';
import {pageOptions} from '../lib/workbenchQueries.js';
const router=express.Router();
router.get('/',async(req,res)=>{
 try{
  const page=pageOptions(req.query);const entityId=req.query.entityId;
  if(entityId!==undefined&&(typeof entityId!=='string'||entityId.length>120))throw new LedgerError('Choose a valid audit entity.');
  const where={workspaceId:req.workspace.id,...(entityId&&{entityId}),...(page.q&&{action:{contains:page.q,mode:'insensitive'}})};
  const [items,total]=await Promise.all([prisma.auditEvent.findMany({where,select:{id:true,actorId:true,action:true,entityId:true,reason:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:page.offset,take:page.pageSize}),prisma.auditEvent.count({where})]);
  const actors=await prisma.user.findMany({where:{id:{in:[...new Set(items.map(row=>row.actorId))]}},select:{id:true,name:true}});
  res.json({items:items.map(row=>({...row,actorName:actors.find(actor=>actor.id===row.actorId)?.name||'Former member'})),total,page:page.page,pageSize:page.pageSize,totalPages:Math.max(1,Math.ceil(total/page.pageSize))});
 }catch(error){sendLedgerError(res,error,'Audit history could not load.');}
});
router.get('/:id',async(req,res)=>{
 try{const event=await prisma.auditEvent.findFirst({where:{id:req.params.id,workspaceId:req.workspace.id}});if(!event)throw new LedgerError('Audit event not found.',404);res.json(event);}
 catch(error){sendLedgerError(res,error,'Audit evidence could not load.');}
});
export default router;
