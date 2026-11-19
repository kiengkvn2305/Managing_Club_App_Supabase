// Real Auth/PostgREST/Storage integration, strictly loopback. Never production.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';
import { createSupabaseApiClient } from '../frontend/src/supabase-api.js';
const report=[];
const runId=Date.now().toString(36);
const url='http://127.0.0.1:54321';
let key;
const clients=[];
const fixtures={runId,environment:'local only; QA records retained for inspection'};
function checked(r) { if(r.error) throw Error(`${r.error.code || ''}: ${r.error.message}`); return r.data; }
async function run(id,module,steps,fn) {
 const t=Date.now();
 try { await fn(); report.push({id,module,steps,expected:'Assertions succeed against real local services',actual:'Verified',status:'PASS',ms:Date.now()-t}); }
 catch(e) { report.push({id,module,steps,expected:'Assertions succeed against real local services',actual:e.message,status:'FAIL',ms:Date.now()-t}); }
 console.log(`${report.at(-1).status} ${id}: ${report.at(-1).actual}`);
}
function client() { const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}); clients.push(c); return c; }
async function account(label) {
 const c=client(), email=`qa-${runId}-${label}@example.test`, password=randomUUID()+'Aa1!';
 const signed=checked(await c.auth.signUp({email,password,options:{data:{name:`QA ${label}`}}}));
 assert.ok(signed.session,'Local signup must return a session');
 return {c,email,password,id:signed.user.id,api:createSupabaseApiClient({client:c})};
}
async function denied(q) { const r=await q; assert.ok(r.error || (Array.isArray(r.data) && r.data.length===0),'Unauthorized operation unexpectedly succeeded'); }
let a,b,member,manager,outsider,clubA,clubB,team,player,item,match;
try {
 // Read only public anon key; never print CLI status or privileged keys.
 const raw=execFileSync('npx.cmd',['--yes','supabase','status','-o','json'],{shell:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const status=JSON.parse(raw.slice(raw.indexOf('{'))); key=status.ANON_KEY;
 assert.ok(key,'Local anon key unavailable');
 await run('AUTH-01','Auth','Register five roles via local Auth HTTP',async()=>{a=await account('owner-a');b=await account('owner-b');member=await account('member');manager=await account('manager');outsider=await account('outsider'); fixtures.users=[a,b,member,manager,outsider].map(u=>({id:u.id,email:u.email}));});
 if(!a || !outsider) throw Error('Cannot continue without test users');
 await run('AUTH-02','Auth','Logout, login, reject wrong password',async()=>{checked(await a.c.auth.signOut()); assert.ok((await a.c.auth.signInWithPassword({email:a.email,password:'wrong'})).error); checked(await a.c.auth.signInWithPassword({email:a.email,password:a.password}));});
 await run('AUTH-03','Auth','Refresh token then fetch confirmed user',async()=>{checked(await a.c.auth.refreshSession());assert.equal(checked(await a.c.auth.getUser()).user.id,a.id);});
 await run('AUTH-04','Profile','Update name and re-read via adapter',async()=>{await a.api.patch('/auth/profile',{name:'QA renamed'});assert.equal((await a.api.get('/auth/user')).data.name,'QA renamed');});
 await run('CLUB-01','Clubs','Create A and B using RPC, list A',async()=>{clubA=(await a.api.post('/clubs',{name:`QA A ${runId}`,formats:['7']})).data.id;clubB=(await b.api.post('/clubs',{name:`QA B ${runId}`,formats:['7']})).data.id;fixtures.clubs=[clubA,clubB];assert.equal((await a.api.get('/clubs')).data[0].id,clubA);});
 const base=`/clubs/${clubA}`;
 await run('CLUB-02','Invitations','Invite member and manager, accept real token',async()=>{for(const [u,role] of [[member,'member'],[manager,'general_manager']]){const inv=(await a.api.post(base+'/invitations',{email:u.email,role})).data;await u.api.post('/invitations/accept',{token:inv.token});}});
 await run('CLUB-03','Clubs','Edit club and re-read',async()=>{await a.api.patch(base,{city:'QA City'});assert.equal((await a.api.get('/clubs')).data[0].city,'QA City');});
 await run('TEAM-01','Teams','Create team and re-read',async()=>{team=(await a.api.post(base+'/teams',{name:'QA Team',format:'7'})).data.id;assert.ok((await a.api.get(base+'/teams')).data.some(t=>t.id===team));});
 await run('TEAM-02','Teams','Assign manager then reload teams',async()=>{const ms=(await a.api.get(base+'/team-manager-candidates')).data;const m=ms.find(m=>m.email===manager.email);assert.ok(m);await a.api.patch(base+`/teams/${team}`,{name:'QA Team renamed',membership_ids:[m.id]});assert.equal((await a.api.get(base+'/teams')).data[0].managers[0].id,m.id);});
 await run('HR-01','Roster','Create and update player then read',async()=>{player=(await a.api.post(base+'/members',{full_name:'QA Player',email:`qa-player-${runId}@example.test`,status:'active'})).data.id;await a.api.patch(base+`/members/${player}`,{full_name:'QA Player updated',status:'active'});assert.equal((await a.api.get(base+`/members/${player}`)).data.full_name,'QA Player updated');});
 await run('TEAM-03','Roster','Assign player, re-read team count and roster',async()=>{await a.api.patch(base+`/teams/${team}/players`,{player_ids:[player]});assert.equal((await a.api.get(base+'/teams')).data[0].members_count,1);assert.equal((await a.api.get(base+`/members?team_id=${team}`)).data[0].id,player);});
 await run('TEAM-04','Captain','Set captain and reload',async()=>{await a.api.patch(base+`/teams/${team}/captain`,{captain_id:player});assert.equal((await a.api.get(base+'/teams')).data[0].captain_name,'QA Player updated');});
 await run('DASH-01','Dashboard','Verify total, active and management counts',async()=>{const d=(await a.api.get(base+'/dashboard')).data;assert.equal(d.members_count,1);assert.equal(d.active_members_count,1);assert.equal(d.managers_count,2);});
 const month=new Date().toISOString().slice(0,7), today=new Date().toISOString().slice(0,10);
 await run('DUES-01','Rates','Save rate, reload team card',async()=>{await a.api.patch(base+`/teams/${team}/dues-rate`,{dues_amount:'100',dues_month:month});assert.equal(Number((await a.api.get(base+'/teams')).data[0].monthly_dues.amount),100);});
 await run('DUES-02','Dues','Unpaid member appears BEFORE first payment',async()=>{assert.ok((await a.api.get(base+`/dues?month=${month}`)).data.some(d=>d.player_id===player),'Rate+roster exists but unpaid member missing');});
 await run('DUES-03','Dues','Record payment and read ledger/dues',async()=>{await a.api.post(base+'/dues',{player_id:player,month,months:1,status:'paid'});assert.equal((await a.api.get(base+`/dues?month=${month}`)).data[0].teams[0].status,'paid');});
 await run('FIN-01','Finance','Income and expense real RPC',async()=>{await a.api.post(base+'/finance',{type:'income',amount:'100.25',occurred_on:today,description:'QA income',idempotency_key:randomUUID()});await a.api.post(base+'/finance',{type:'expense',amount:'25.10',occurred_on:today,description:'QA expense',idempotency_key:randomUUID()});const f=(await a.api.get(base+`/finance?from=${today}&to=${today}`));assert.ok(f.data.length>=2);});
 await run('FIN-02','Finance','Concurrent identical requests return same transaction',async()=>{const args={p_club_id:clubA,p_type:'income',p_amount:'1.25',p_occurred_on:today,p_description:'QA replay',p_idempotency_key:randomUUID()};const rs=await Promise.all(Array.from({length:6},()=>a.c.rpc('record_finance_transaction',args)));const ids=rs.map(r=>checked(r).id);assert.equal(new Set(ids).size,1);});
 await run('FIN-03','Finance','Reject same key with different amount',async()=>{const args={p_club_id:clubA,p_type:'income',p_amount:1,p_occurred_on:today,p_description:'QA conflict',p_idempotency_key:randomUUID()};checked(await a.c.rpc('record_finance_transaction',args));assert.ok((await a.c.rpc('record_finance_transaction',{...args,p_amount:9})).error);});
 await run('FIN-04','Finance','Reversal nets zero and replay returns original reversal',async()=>{const before=checked(await a.c.rpc('finance_summary',{p_club_id:clubA,p_from:today,p_to:today}));const tx=checked(await a.c.rpc('record_finance_transaction',{p_club_id:clubA,p_type:'expense',p_amount:9,p_occurred_on:today,p_description:'QA reverse'}));const args={p_club_id:clubA,p_transaction_id:tx.id,p_reason:'QA reverse',p_idempotency_key:randomUUID()};const one=checked(await a.c.rpc('reverse_finance_transaction',args));const two=checked(await a.c.rpc('reverse_finance_transaction',args));assert.equal(one.reversal.id,two.reversal.id);const after=checked(await a.c.rpc('finance_summary',{p_club_id:clubA,p_from:today,p_to:today}));assert.equal(Number(after.income)-Number(after.expense),Number(before.income)-Number(before.expense));});
 await run('FIN-05','Finance','Chart derives actual entries',async()=>{assert.ok((await a.api.get(base+`/finance?from=${today}&to=${today}`)).chart.length>0,'chart is empty despite ledger data');});
 await run('PLAN-01','Planned expenses','Create and read month-expanded row for editing',async()=>{await a.api.post(base+'/finance/planned',{description:'QA planned',amount:10,effective_from:month});const rows=(await a.api.get(base+`/finance/planned?from=${month}&to=${month}`)).data;assert.equal(rows[0].month,month);});
 await run('INV-01','Inventory','Create, rename, receive, issue and reload',async()=>{item=(await a.api.post(base+'/inventory',{name:'QA Ball',kind:'asset',unit:'cái',low_stock_threshold:1})).data.id;await a.api.patch(base+`/inventory/${item}`,{name:'QA Ball renamed',kind:'asset',unit:'cái',low_stock_threshold:1});await a.api.post(base+`/inventory/${item}/movements`,{type:'in',quantity:5,reason:'QA receive'});await a.api.post(base+`/inventory/${item}/movements`,{type:'out',quantity:2,reason:'QA issue'});assert.equal((await a.api.get(base+'/inventory')).data[0].quantity,3);});
 await run('INV-02','Inventory','Prevent negative stock',async()=>{await assert.rejects(a.api.post(base+`/inventory/${item}/movements`,{type:'out',quantity:100,reason:'QA negative'}));assert.equal((await a.api.get(base+'/inventory')).data[0].quantity,3);});
 await run('INV-03','Inventory','Assign and return asset',async()=>{const asg=(await a.api.post(base+`/inventory/${item}/assignments`,{player_id:player,quantity:1,reason:'QA assign'})).data;await a.api.post(base+`/inventory/${item}/assignments/${asg.id}/return`,{quantity:1,reason:'QA return'});assert.equal((await a.api.get(base+'/inventory')).data[0].quantity,3);});
 await run('MATCH-01','Matches','Create, edit completed result and read',async()=>{match=(await a.api.post(base+'/matches',{team_id:team,opponent:'QA Opponent',match_date:today,start_time:'18:00',match_type:'friendly',status:'scheduled'})).data.id;await a.api.patch(base+`/matches/${match}`,{team_id:team,status:'completed',our_score:2,opponent_score:1});const row=(await a.api.get(base+'/matches')).data[0];assert.equal(row.our_score,2);assert.ok(row.team_name,'Missing team_name for UI');});
 await run('ATT-01','Attendance','Upsert match attendance twice and read',async()=>{for(const status of ['absent','present']) await a.api.request(base+`/matches/${match}/attendance`,{method:'PUT',body:{player_id:player,attendance:status,rsvp:'yes'}});assert.equal((await a.api.get(base+`/matches/${match}/attendance`)).data[0].attendance,'present');});
 await run('STAT-01','Statistics','Save match stats and aggregate',async()=>{await a.api.request(base+`/matches/${match}/player-stats`,{method:'PUT',body:{player_id:player,goals:2}});assert.equal((await a.api.get(base+`/matches/${match}/player-stats`)).data[0].goals,2);const summary=(await a.api.get(base+'/player-stats')).data;assert.ok(summary.players?.length,'UI expects players/teams/club aggregation');});
 await run('TRAIN-01','Training','Create training and save attendance',async()=>{const t=(await a.api.post(base+'/activities/trainings',{team_id:team,training_date:today,training_time:'18:00',location:'QA Pitch'})).data;await a.api.patch(base+`/activities/trainings/${t.id}/attendance`,{players:[{player_id:player,status:'present'}]});assert.equal((await a.api.get(base+'/activities')).data.trainings[0].attendance[0].status,'present');});
 await run('EVENT-01','Activities','Save celebration and award',async()=>{await a.api.post(base+'/activities/celebrations',{title:'QA event',event_date:today});await a.api.post(base+'/activities/awards',{player_id:player,award_year:2026,title:'QA award'});const d=(await a.api.get(base+'/activities')).data;assert.equal(d.celebrations.length,1);assert.equal(d.awards.length,1);});
 let boardMemberId, sharedRateId;
 await run('BOARD-01','Board','Add and rename board member',async()=>{const r=(await a.api.post(base+'/board-members',{player_id:player,title:'Thư ký'})).data;boardMemberId=r.id;await a.api.patch(base+`/board-members/${r.id}`,{title:'Hậu cần'});assert.equal((await a.api.get(base+'/board-members')).data[0].title,'Hậu cần');});
 await run('BOARD-02','Board dues','Create shared dues rate and verify board member pays discounted dues',async()=>{
  const player2 = (await a.api.post(base+'/members',{full_name:'QA Regular Player',email:`qa-reg-${runId}@example.test`,status:'active'})).data.id;
  await a.api.patch(base+`/teams/${team}/players`,{player_ids:[player, player2]});
  const nextMonth = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 7);
  const sr = (await a.api.post(base+'/board-dues-rate',{team_id:team,amount:40,effective_month:nextMonth})).data;
  sharedRateId = sr.id;
  const duesList = (await a.api.get(base+`/dues?month=${nextMonth}`)).data;
  const bMemberDues = duesList.find(d => d.player_id === player);
  const regMemberDues = duesList.find(d => d.player_id === player2);
  assert.equal(bMemberDues.total, 40, 'Board member should have board discount dues');
  assert.equal(regMemberDues.total, 100, 'Regular member should have standard team dues');
  const paid = (await a.api.post(base+'/dues',{player_id:player,month:nextMonth,months:1,status:'paid'})).data;
  assert.equal(paid.amount, 40, 'Paid amount must match discounted rate');
 });
 await run('BOARD-03','Board rate delete','Delete shared dues rate and verify revert to standard rate',async()=>{
  assert.ok(sharedRateId, 'Must have sharedRateId');
  await a.api.delete(base+`/board-dues-rates/${sharedRateId}`);
  const bmData = await a.api.get(base+'/board-members');
  assert.ok(!bmData.shared_rates.some(r => r.id === sharedRateId), 'Deleted rate must not appear in shared_rates');
 });
 await run('BOARD-04','Board member remove','Remove member from board and verify archived',async()=>{
  assert.ok(boardMemberId, 'Must have boardMemberId');
  await a.api.delete(base+`/board-members/${boardMemberId}`);
  const bmData = await a.api.get(base+'/board-members');
  assert.ok(!bmData.data.some(m => m.id === boardMemberId), 'Removed member must not appear in active board members');
 });
 await run('POLL-01','Voting','Create poll, member votes, duplicate denied',async()=>{const p=(await a.api.post(base+'/polls',{title:'QA poll',deadline:new Date(Date.now()+86400000).toISOString(),options:['A','B']})).data;const poll=(await member.api.get(base+'/polls')).data.find(v=>v.id===p.id);await member.api.post(base+`/polls/${p.id}/vote`,{option_id:poll.options[0].id});await assert.rejects(member.api.post(base+`/polls/${p.id}/vote`,{option_id:poll.options[0].id}));});
 await run('REC-01','Recruitment','Create post and applicant, edit and reload',async()=>{const p=(await a.api.post(base+'/recruitment/posts',{title:'QA keeper',status:'open'})).data;const app=(await a.api.post(base+`/recruitment/posts/${p.id}/applications`,{full_name:'QA Candidate'})).data;await a.api.patch(base+`/recruitment/posts/${p.id}/applications/${app.id}`,{status:'reviewing'});assert.equal((await a.api.get(base+`/recruitment/posts/${p.id}/applications`)).data[0].status,'reviewing');});
 await run('DISC-01','Discipline','Create case, check history',async()=>{const d=(await a.api.post(base+'/discipline',{player_id:player,incident_date:today,title:'QA case',description:'QA',status:'open',fine_amount:''})).data;assert.equal((await a.api.get(base+`/discipline/${d.id}/history`)).data.length,1);});
 await run('SPON-01','Sponsorship','Create sponsor, agreement, receipt and read total',async()=>{const s=(await a.api.post(base+'/sponsors',{name:'QA sponsor'})).data;const p=(await a.api.post(base+'/sponsorships',{sponsor_id:s.id,title:'QA agreement',type:'cash',value:100,starts_on:today,ends_on:today})).data;await a.api.post(base+`/sponsorships/${p.id}/receipts`,{value:30,received_on:today});assert.equal((await a.api.get(base+'/sponsorships')).data[0].received_value,30);});
 await run('IMPORT-01','Excel commit','Preview then commit real rows',async()=>{const players=[{full_name:'QA imported',status:'active'}];assert.equal((await a.api.post(base+'/members/import/preview',{players})).data.length,1);assert.equal((await a.api.post(base+'/members/import/commit',{players,decisions:[{action:'create'}]})).data.created,1);});
 for(const [label,u] of [['ownerB',b],['outsider',outsider]]){
  await run(`SEC-${label}-READ`,'Isolation','Read private A roster from unauthorized account',async()=>assert.equal(checked(await u.c.from('player_profiles').select('id').eq('club_id',clubA)).length,0));
  await run(`SEC-${label}-WRITE`,'Isolation','Attempt to change A player',async()=>await denied(u.c.from('player_profiles').update({full_name:'ATTACK'}).eq('id',player).select('id')));
  await run(`SEC-${label}-RPC`,'Isolation','Attempt to sync A team roster',async()=>assert.ok((await u.c.rpc('sync_team_players',{p_club_id:clubA,p_team_id:team,p_player_ids:[]})).error));
 }
 await run('SEC-ADMIN','Privilege','Attempt self system-admin promotion',async()=>assert.ok((await member.c.from('profiles').update({is_system_admin:true}).eq('id',member.id)).error));
 await run('SEC-OWNER','Privilege','Attempt self club-owner promotion',async()=>assert.ok((await member.c.from('club_members').update({role:'owner'}).eq('user_id',member.id)).error));
 await run('SEC-FIN','Privilege','Member cannot write ledger or call finance RPC',async()=>{assert.ok((await member.c.from('finance_transactions').insert({club_id:clubA,type:'income',amount:100,created_by:member.id,occurred_on:today,description:'ATTACK'})).error);await assert.rejects(member.api.post(base+'/finance',{type:'income',amount:100,occurred_on:today,description:'ATTACK'}));});
 await run('SEC-LINK','Privilege','Roster manager cannot link arbitrary auth account directly',async()=>assert.ok((await manager.c.from('player_profiles').update({user_id:b.id}).eq('id',player)).error));
 await run('SEC-ANON','Privilege','Anon cannot execute manager sync',async()=>assert.ok((await client().rpc('sync_team_managers',{p_club_id:clubA,p_team_id:team,p_membership_ids:[]})).error));
 await run('STORE-01','Storage','Owner uploads private image, outsider cannot sign it',async()=>{const path=`clubs/${clubA}/qa-${runId}.png`;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7gAAAABJRU5ErkJggg==','base64');checked(await a.c.storage.from('fcms-private').upload(path,png,{contentType:'image/png'}));assert.ok(checked(await a.c.storage.from('fcms-private').createSignedUrl(path,60)).signedUrl);assert.ok((await outsider.c.storage.from('fcms-private').createSignedUrl(path,60)).error);checked(await a.c.storage.from('fcms-private').remove([path]));});
 await run('FIN-LOCK','Finance','Close period then reject new ledger entry',async()=>{const p=checked(await a.c.rpc('create_financial_period',{p_club_id:clubA,p_starts_on:today,p_ends_on:today}));checked(await a.c.rpc('close_financial_period',{p_club_id:clubA,p_period_id:p.id}));await assert.rejects(a.api.post(base+'/finance',{type:'income',amount:1,occurred_on:today,description:'QA closed'}));});
} catch(e) { report.push({id:'ENV-API',module:'Environment',status:'BLOCKED',actual:e.message}); }
finally {
 for(const c of clients) c.auth.stopAutoRefresh();
 mkdirSync('qa-reports/evidence',{recursive:true});
 writeFileSync('qa-reports/evidence/integration.json',JSON.stringify({at:new Date().toISOString(),fixtures,tests:report},null,2));
 console.log(JSON.stringify(report.reduce((s,r)=>(s[r.status]=(s[r.status]||0)+1,s),{})));
 process.exitCode=report.some(r=>r.status!=='PASS')?1:0;
}
