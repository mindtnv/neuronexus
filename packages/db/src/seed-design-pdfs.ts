/** Replace only the eight disposable text fixtures in reomi_design, preserving
 * their source IDs/notebook links. Requires a DB backup before invocation. */
import postgres from 'postgres';
const dbUrl = new URL(process.env.DATABASE_URL!);
if (dbUrl.pathname !== '/reomi_design' || !['localhost', '127.0.0.1'].includes(dbUrl.hostname)) throw Error('Dedicated design database required');
const base = process.env.BETTER_AUTH_URL!;
if (new URL(base).port !== '4312') throw Error('Design API required');
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const origin = process.env.WEB_ORIGIN!;
const docs = [
 ['.NET: Основные понятия','Architecting Modern Web Applications with ASP.NET Core and Azure','Microsoft','https://github.com/dotnet-architecture/eBooks/raw/main/current/architecting-modern-web-apps-azure/Architecting-Modern-Web-Applications-with-ASP.NET-Core-and-Azure.pdf'],
 ['.NET: Практика и примеры','Azure Quick Start for .NET Developers','Microsoft','https://github.com/dotnet-architecture/eBooks/raw/main/current/azure-quick-start/Azure-Quick-Start-for-NET-Developers.pdf'],
 ['Frontend: Основные понятия','Eloquent JavaScript — 4th Edition','Marijn Haverbeke','https://eloquentjavascript.net/Eloquent_JavaScript.pdf'],
 ['Frontend: Практика и примеры','CSS 2.1 Specification','W3C','https://www.w3.org/TR/CSS2/css2.pdf'],
 ['Computer Science: Основные понятия','MIT 6.006 — Introduction to Algorithms','MIT OpenCourseWare','https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/477c78e0af2df61fa205bcc6cb613ceb_MIT6_006S20_lec1.pdf'],
 ['Computer Science: Практика и примеры','MIT 6.006 — Data Structures','MIT OpenCourseWare','https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/79a07dc1cb47d76dae2ffedc701e3d2b_MIT6_006S20_lec2.pdf'],
 ['English: Основные понятия','Access — English Reading','American English — U.S. Department of State','https://americanenglish.state.gov/files/ae/resource_files/access_5.pdf'],
 ['English: Практика и примеры','Introduction to Readers Theater','American English — U.S. Department of State','https://americanenglish.state.gov/files/ae/resource_files/readerstheater_taylor.pdf'],
] as const;
try {
 const [owner] = await sql`select id from "user" where email='demo@neuronexus.local'`;
 if (!owner) throw Error('Demo owner missing');
 const login=await fetch(`${base}/api/auth/sign-in/email`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:'demo@neuronexus.local',password:'demodemo123'})});
 if(!login.ok) throw Error(`Sign-in ${login.status}`);
 const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 async function request(path:string,method='GET',body?:unknown) {
  const r=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',origin,cookie},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json(); if(!r.ok && data.error!=='duplicate_source') throw Error(`API ${r.status}`); return data;
 }
 const capabilities = await request('/ai/status');
 console.log({ embeddingsEnabled: capabilities.embeddingEnabled, notebooksEnabled: capabilities.notebooksEnabled });
 const downloaded = await Promise.allSettled(docs.map(async ([old,title,author,url],i) => {
  const [source]=await sql`select id from sources where user_id=${owner.id} and title=${old} and kind='text'`;
  if(!source) return null;
  const cached = [0,1,4,5].includes(i) ? Bun.file(`/tmp/reomi-pdfs/library-${i}.pdf`) : null;
  const r = cached && await cached.exists() ? null : await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(r && !r.ok) throw Error(`${title}: download ${r.status}`);
  const bytes = r ? await r.arrayBuffer() : await cached!.arrayBuffer(); if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') throw Error(`${title}: not PDF`);
  if(bytes.byteLength>25*1024*1024) throw Error(`${title}: too large`);
  await Bun.write(`/tmp/reomi-pdfs/library-${i}.pdf`,bytes);
  return {old,title,author,url,sourceId:source.id as string,bytes};
 }));
 let failures = 0;
 for(const result of downloaded) {
  if(result.status==='rejected') { failures++; console.error(String(result.reason)); continue; }
  const d=result.value; if(!d) continue;
  const claim=await request('/library/items/presign','POST',{title:d.title,mime:'application/pdf',size:d.bytes.byteLength});
  const form=new FormData(); for(const [k,v] of Object.entries(claim.upload.fields)) form.append(k,String(v));
  form.set('Content-Type','application/pdf');form.append('file',new File([d.bytes],'source.pdf',{type:'application/pdf'}));
  const upload=await fetch(claim.upload.url,{method:'POST',body:form});if(!upload.ok) throw Error(`Upload ${upload.status}`);
  const final=await request(`/library/items/${claim.sourceId}/finalize`,'POST',{});
  const freshId=final.existingSourceId??final.id;
  if(freshId===d.sourceId) continue;
  let ready=false;
  for(let n=0;n<90;n++) {
   const [s]=await sql`select status,chunk_count from sources where id=${freshId}`;
   if(s && (['ready','error'].includes(s.status) || (s.status==='indexing' && !capabilities.embeddingEnabled))) { ready=s.chunk_count>0;break; }
   await Bun.sleep(1000);
  }
  if(!ready) throw Error(`${d.title}: parsing did not finish`);
  await sql.begin(async tx=>{
   const [old]=await tx`select id from sources where id=${d.sourceId} and user_id=${owner.id} and title=${d.old} and kind='text' for update`;
   const [fresh]=await tx`select * from sources where id=${freshId} and user_id=${owner.id} and kind='pdf' and verified=true for update`;
   if(!old||!fresh) throw Error('Replacement precondition changed');
   const [refs]=await tx`select (select count(*) from card_sources where source_id=${d.sourceId})+(select count(*) from source_marks where source_id=${d.sourceId})+(select count(*) from source_annotations where source_id=${d.sourceId}) as n`;
   if(Number(refs.n)>0) throw Error('Preserve annotated source: replacement aborted');
   await tx`delete from source_chunks where source_id=${d.sourceId}`;
   await tx`delete from kb_chunk where source_id=${d.sourceId}`;
   await tx`delete from source_reading_state where source_id=${d.sourceId}`;
   await tx`update sources set kind='pdf', title=${d.title}, author=${d.author}, description=${'Original PDF: '+d.url}, language='en', url=${d.url}, storage_key=${fresh.storage_key}, mime=${fresh.mime}, byte_size=${fresh.byte_size}, byte_hash=${fresh.byte_hash}, status=${fresh.status}, error_code=${fresh.status==='error'?'index_failed':null}, char_count=${fresh.char_count}, chunk_count=${fresh.chunk_count}, verified=true, cover_media_id=${fresh.cover_media_id}, page_count=${fresh.page_count}, updated_at=now() where id=${d.sourceId}`;
   await tx`update source_chunks set source_id=${d.sourceId} where source_id=${freshId}`;
   await tx`update kb_chunk set source_id=${d.sourceId}, parent_id=${d.sourceId} where source_id=${freshId}`;
   // Only our temporary import row is removed; uploaded bytes are retained by the original ID.
   await tx`delete from sources where id=${freshId}`;
  });
  console.log(JSON.stringify({id:d.sourceId,title:d.title,bytes:d.bytes.byteLength}));
 }
 if (failures) process.exitCode = 1;
} finally { await sql.end(); }
