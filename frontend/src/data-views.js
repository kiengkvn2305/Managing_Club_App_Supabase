// Read-model calculations only. Money mutations are performed by database RPCs.
export function cents(value) {
 const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? 0));
 if(!match) throw new Error('Số tiền trả về không hợp lệ.');
 return (BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')))*(match[1]?-1n:1n);
}
const decimal=n=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
export function ledgerView(rows, from='', to='9999-12-31', group='day') {
 const visible=rows.filter(r=>['posted','reversed'].includes(r.status));
 const accounted=visible.filter(r=>r.status==='posted');
 const period=visible.filter(r=>r.occurred_on>=from && r.occurred_on<=to);
 const accountingPeriod=accounted.filter(r=>r.occurred_on>=from && r.occurred_on<=to);
 const sum=(data,type)=>data.filter(r=>r.type===type).reduce((n,r)=>n+cents(r.amount),0n);
 const income=sum(accountingPeriod,'income'),expense=sum(accountingPeriod,'expense');
 const chart=new Map();
 for(const row of accountingPeriod){const p=row.occurred_on.slice(0,group==='month'?7:10),key=p+':'+row.type;const entry=chart.get(key)||{period:p,type:row.type,total:0n};entry.total+=cents(row.amount);chart.set(key,entry);}
 const until=accounted.filter(r=>r.occurred_on<=to);
 return {data:period,summary:{income:decimal(income),expense:decimal(expense),balance:decimal(income-expense),remaining:decimal(sum(until,'income')-sum(until,'expense')),change:null},chart:[...chart.values()].map(r=>({...r,total:decimal(r.total)}))};
}
export function expandPlanned(rows,from,to) {
 if(!/^\d{4}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}$/.test(to||'')) throw new Error('Khoảng tháng không hợp lệ.');
 const index=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
 const first=index(from),last=index(to); if(last<first||last-first>11) throw new Error('Chọn tối đa 12 tháng.');
 return Array.from({length:last-first+1},(_,i)=>{const n=first+i;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;}).flatMap(month=>rows.filter(r=>r.effective_from.slice(0,7)<=month && (!r.effective_to || r.effective_to.slice(0,7)>=month)).map(r=>({...r,month})));
}
export function statisticsView(rows) {
 const players=new Map(),teams=new Map(),matches=new Set();
 for(const r of rows){
  if(r.match?.status!=='completed') continue;
  matches.add(r.match_id);
  const p=players.get(r.player_id)||{player_id:r.player_id,...r.player,matches_played:0,goals:0,assists:0,yellow_cards:0,red_cards:0,goals_conceded:0,goalkeeper_matches:0,clean_sheets:0,ratings:[]};
  p.matches_played++; for(const k of ['goals','assists','yellow_cards','red_cards']) p[k]+=Number(r[k]||0);
  if(r.goals_conceded!=null){p.goalkeeper_matches++;p.goals_conceded+=Number(r.goals_conceded);if(Number(r.goals_conceded)===0)p.clean_sheets++;}
  if(r.rating!=null)p.ratings.push(Number(r.rating)); players.set(r.player_id,p);
  const t=teams.get(r.match.team_id)||{team_id:r.match.team_id,team_name:r.match.team?.name||'Chưa có đội',ids:new Set(),player_appearances:0,goals:0,assists:0};t.ids.add(r.match_id);t.player_appearances++;t.goals+=Number(r.goals||0);t.assists+=Number(r.assists||0);teams.set(r.match.team_id,t);
 }
 const ps=[...players.values()].map(({ratings,...p})=>({...p,average_rating:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null})).sort((a,b)=>b.goals-a.goals);
 return {players:ps,teams:[...teams.values()].map(({ids,...t})=>({...t,matches:ids.size})),club:{matches:matches.size,player_appearances:ps.reduce((n,p)=>n+p.matches_played,0),goals:ps.reduce((n,p)=>n+p.goals,0),assists:ps.reduce((n,p)=>n+p.assists,0)}};
}
