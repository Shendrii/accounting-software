import {PrismaClient} from '@prisma/client';
import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL explicitly to the empty destination.');
const db=new PrismaClient();
try{const [result]=await db.$queryRaw`SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public'`;
 if(result.count)throw new Error('Destination is not empty. Bootstrap never replaces an existing database.');
}finally{await db.$disconnect();}
function prisma(args){const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js',...args],{cwd,env:process.env,stdio:'inherit'});if(result.status!==0)throw new Error('Bootstrap stopped; inspect the database before retrying.');}
prisma(['db','execute','--file','prisma/baseline/pre-readiness.sql','--schema','prisma/schema.prisma']);
for(const migration of (await readdir(new URL('../prisma/migrations/',import.meta.url))).filter(name=>/^\d/.test(name)&&name<'20261108130000_auth_security').sort())prisma(['migrate','resolve','--applied',migration]);
prisma(['migrate','deploy']);
console.log('Empty-database baseline and all subsequent migrations applied. Existing migration files were preserved.');
