import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, sendLedgerError } from '../lib/ledger.js';

import { profitLoss, balanceSheet, trialBalance } from '../lib/financialReports.js';
import { exportReport } from '../lib/reportExports.js';
import { accountActivity } from '../lib/accountActivity.js';
import { agingReport } from '../lib/aging.js';
import {contractorReport} from '../lib/contractors.js';

const router = express.Router();
router.get('/contractors.csv',async(req,res)=>{try{const report=await contractorReport(prisma,req.workspace,{...req.query,page:'1',exportAll:true});if(report.total>10000)throw new LedgerError('This workpaper exceeds 10,000 suppliers. Use a reviewed data export for this population.',409);const cell=value=>{const s=String(value??'');return '"'+(/^[=+@-]/.test(s)&&!/^[-+]?\d+(?:\.\d+)?$/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};const rows=[['Year','Currency','Supplier','Bank and cash paid net of corrections','Card paid net of corrections','W9 status','Reporting category for review','TIN last four','Supporting reference'],...report.items.map(r=>[report.year,report.currency,r.name,r.bankCashPaid,r.cardPaid,r.taxProfile?.w9Status??'NOT_REVIEWED',r.taxProfile?.reportingCategory??'NOT_REVIEWED',r.taxProfile?.tinLast4??'',r.taxProfile?.support??''])];res.type('text/csv').attachment('contractor-review-'+report.year+'.csv').send(rows.map(row=>row.map(cell).join(',')).join('\n'));}catch(e){sendLedgerError(res,e,'Contractor export could not generate.');}});
router.get('/contractors',async(req,res)=>{try{res.json(await contractorReport(prisma,req.workspace,req.query));}catch(e){sendLedgerError(res,e,'Contractor review could not load.');}});
router.get('/aging', async (req, res) => {
  try { res.json(await agingReport(prisma, req.workspace, req.query)); }
  catch (error) { sendLedgerError(res, error, 'The aging report could not load.'); }
});

router.get('/account-activity', async (req, res) => {
  try { res.json(await accountActivity(prisma, req.workspace.id, req.query)); }
  catch (error) { sendLedgerError(res, error, 'Failed to load account activity.'); }
});

router.get('/export', exportReport);

router.get('/profit-loss', async (req, res) => {
  try { res.json(await profitLoss(prisma, req.workspace, req.query)); }
  catch (error) { sendLedgerError(res, error, 'The report could not load.'); }
});

router.get('/balance-sheet', async (req, res) => {
  try { res.json(await balanceSheet(prisma, req.workspace, req.query)); }
  catch (error) { sendLedgerError(res, error, 'The report could not load.'); }
});

router.get('/trial-balance', async (req, res) => {
  try { res.json(await trialBalance(prisma, req.workspace, req.query)); }
  catch (error) { sendLedgerError(res, error, 'The report could not load.'); }
});

export default router;
