import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from './core/config.mjs';

const config=loadConfig();const pool=new pg.Pool({connectionString:config.databaseUrl,max:1});const client=await pool.connect();
try{await client.query('select pg_advisory_lock(73190521)');await client.query('create table if not exists schema_migrations (name text primary key,checksum text not null,applied_at timestamptz not null default now())');for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');const checksum=createHash('sha256').update(sql).digest('hex');const existing=(await client.query('select checksum from schema_migrations where name=$1',[name])).rows[0];if(existing){if(existing.checksum!==checksum)throw new Error(`Applied migration changed: ${name}`);continue}await client.query('begin');try{await client.query(sql);await client.query('insert into schema_migrations (name,checksum) values ($1,$2)',[name,checksum]);await client.query('commit');console.log(`Applied ${name}`)}catch(error){await client.query('rollback');throw error}}}finally{await client.query('select pg_advisory_unlock(73190521)').catch(()=>{});client.release();await pool.end()}
