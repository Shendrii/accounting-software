import {PrismaClient} from '@prisma/client';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sourceUrl=process.env.DRILL_SOURCE_URL,destinationUrl=process.env.DRILL_DESTINATION_URL;
for(const value of [sourceUrl,destinationUrl])if(!value||!['localhost','127.0.0.1'].includes(new URL(value).hostname))throw new Error('The drill accepts explicit localhost source and destination URLs only.');
if(sourceUrl===destinationUrl)throw new Error('Use a separate empty destination.');
const source=new PrismaClient({datasources:{db:{url:sourceUrl}}}),dest=new PrismaClient({datasources:{db:{url:destinationUrl}}});
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex');
async function snapshot(client){return client.$transaction(async tx=>{
 const columns=await tx.$queryRaw`SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.column_name`;
 const result={};for(const table of [...new Set(columns.map(c=>c.table_name))].filter(t=>t!=='_prisma_migrations')){
  const names=columns.filter(c=>c.table_name===table).map(c=>c.column_name);
  // PostgreSQL quotes its own typed values. This preserves exact decimals,
  // bytea, timestamps and the distinction between SQL NULL and JSON null.
  const rows=await tx.$queryRawUnsafe('SELECT ARRAY['+names.map(c=>'quote_nullable(t.'+quote(c)+')').join(',')+'] AS row FROM '+quote(table)+' t');
  result[table]={columns:names,rows:rows.map(r=>r.row)};
 }return result;
},{isolationLevel:'RepeatableRead',timeout:120000});}
let directory;
try{
 const [state]=await dest.$queryRaw`SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public'`;
 if(state.count)throw new Error('Drill destination must be empty. No data was changed.');
 const bootstrap=spawnSync(process.execPath,[fileURLToPath(new URL('./bootstrap-empty-database.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:destinationUrl},stdio:'pipe'});
 if(bootstrap.status!==0)throw new Error('Empty-database bootstrap failed: '+bootstrap.stderr.toString().slice(-2000));
 const original=await snapshot(source);directory=await mkdtemp(join(tmpdir(),'accountrix-restore-'));const archive=join(directory,'synthetic-backup.json.gz');
 await writeFile(archive,gzipSync(JSON.stringify(original)),{mode:0o600});
 const backup=JSON.parse(gunzipSync(await readFile(archive)).toString());
 await dest.$transaction(async tx=>{
  // Local superuser drill only. Disable FK/order/closed-period triggers while replaying an exact full snapshot; validate every FK below before success.
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
  for(const [table,data] of Object.entries(backup))for(let offset=0;offset<data.rows.length;offset+=500)await tx.$executeRawUnsafe('INSERT INTO '+quote(table)+' ('+data.columns.map(quote).join(',')+') VALUES '+data.rows.slice(offset,offset+500).map(row=>'('+row.join(',')+')').join(','));
 },{timeout:120000});
 const restored=await snapshot(dest);
 for(const [table,data] of Object.entries(original))if(JSON.stringify(data.columns)!==JSON.stringify(restored[table]?.columns)||fingerprint(data.rows)!==fingerprint(restored[table]?.rows??[]))throw new Error('Restored data differs in '+table);
 const fks=await dest.$queryRaw`SELECT c.conrelid::regclass::text AS child,c.confrelid::regclass::text AS parent,array_agg(a.attname ORDER BY k.ordinality) AS children,array_agg(b.attname ORDER BY k.ordinality) AS parents FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(a,b,ordinality) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.b WHERE c.contype='f' GROUP BY c.oid`;
 for(const fk of fks){const [r]=await dest.$queryRawUnsafe('SELECT count(*)::integer AS count FROM '+fk.child+' c WHERE '+fk.children.map(c=>'c.'+quote(c)+' IS NOT NULL').join(' AND ')+' AND NOT EXISTS(SELECT 1 FROM '+fk.parent+' p WHERE '+fk.children.map((c,i)=>'c.'+quote(c)+'=p.'+quote(fk.parents[i])).join(' AND ')+')');if(r.count)throw new Error('Orphaned references in '+fk.child);}
 const [ledger]=await dest.$queryRaw`SELECT COALESCE(sum(l."debit"-l."credit"),0)::text AS difference FROM "JournalLine" l JOIN "JournalEntry" j ON j."id"=l."journalEntryId" WHERE j."status"='POSTED'`;
 if(Number(ledger.difference)!==0)throw new Error('Restored posted ledger does not balance.');
 const [guards]=await dest.$queryRaw`SELECT count(*)::integer AS count FROM pg_trigger WHERE tgname IN ('audit_append_only','journal_period_lock','posted_lines_immutable','balanced_posted_entry')`;
 if(guards.count!==4)throw new Error('Required database controls were not restored.');
 console.log(JSON.stringify({result:'PASS',tables:Object.keys(original).length,rows:Object.values(original).reduce((n,r)=>n+r.rows.length,0),postedLedgerDifference:ledger.difference,allTableHashesMatch:true,foreignKeysValid:true,controlTriggers:guards.count}));
}finally{await source.$disconnect();await dest.$disconnect();if(directory)await rm(directory,{recursive:true,force:true});}
