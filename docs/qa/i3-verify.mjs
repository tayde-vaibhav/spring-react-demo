import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const module=join(root,'backend/springreactdemo');
const settings=join(root,'docs/qa/i3-maven-settings.xml');
const jdk = process.env.JAVA_HOME
  ? resolve(process.env.JAVA_HOME)
  : null;
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe'],...options}).trim();
const git=args=>run('git',args,{cwd:root});
const docker=args=>run('docker',args);
const ids=text=>text?text.split(/\s+/).filter(Boolean):[];
const tcIds=()=>ids(docker(['ps','-aq','--filter','label=org.testcontainers=true']));
const requireCheck=(condition,label)=>{if(!condition){console.log('PREREQUISITE_BLOCKED: '+label);throw new Error('blocked');}};
const testcontainersProperties = join(homedir(), '.testcontainers.properties');

function projectMongo(){
 const states=[];
 for(const id of ids(docker(['ps','-aq','--filter','label=com.docker.compose.service=mongodb']))){
  if(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project.working_dir"}}',id])!==root)continue;
  const state=docker(['inspect','--format','{{.State.Status}}|{{.State.StartedAt}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}',id]);
  states.push([id,state]);
 }
 return states.sort((a,b)=>a[0].localeCompare(b[0]));
}
const preservedPaths=['.gitignore','AGENTS.md','README.md','SECURITY.md','TEST-CODIFICATION-PLAN.md','backend/springreactdemo/pom.xml'];
const fingerprints=()=>preservedPaths.map(p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex'));
const started=Date.now();
try{
 requireCheck(git(['branch','--show-current'])==='showcase-app','intended branch');
 requireCheck(
  jdk !== null &&
  existsSync(join(jdk, 'bin', 'java')) &&
  existsSync(join(jdk, 'bin', 'javac')) &&
  existsSync(join(jdk, 'release')) &&
  existsSync(settings),
  'JAVA_HOME must point to a complete JDK with explicit Maven settings'
);

const release = readFileSync(join(jdk, 'release'), 'utf8');

requireCheck(
  /^JAVA_VERSION="25(?:\.|")/m.test(release),
  'Java 25 is required'
);
 requireCheck(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'default Docker without endpoint overrides');
 if(existsSync(testcontainersProperties)){
 const entries=readFileSync(testcontainersProperties,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^[#!]/.test(s));
  requireCheck(entries.length===1&&/^docker\.client\.strategy\s*[=:]\s*org\.testcontainers\.dockerclient\.UnixSocketClientProviderStrategy\s*$/.test(entries[0]),'only reviewed local discovery cache');
 }
 const endpoint=new URL(JSON.parse(docker(['context','inspect','--format','{{json .Endpoints.docker.Host}}'])));
 requireCheck(endpoint.protocol==='unix:'&&!endpoint.hostname&&!endpoint.username&&!endpoint.password&&endpoint.pathname.startsWith('/'),'local Unix Docker endpoint');
 requireCheck(existsSync('/var/run/docker.sock'),'default Docker socket present');
 const server=docker(['version','--format','{{.Server.Version}}']);
 requireCheck(/^\d+(?:\.\d+)+(?:[-+\w.]*)?$/.test(server),'Docker server reachable');
 console.log('DOCKER: local Unix endpoint; server '+server);
 for(const image of ['mongo:7.0.45','testcontainers/ryuk:0.14.0','alpine:3.17']){docker(['image','inspect','--format','{{.Id}}',image]);console.log('CACHED_IMAGE: '+image);}
 const beforeTc=tcIds(),beforeMongo=projectMongo(),beforeStatus=git(['status','--porcelain']),beforeHead=git(['rev-parse','HEAD']),beforeFiles=fingerprints();
 console.log('BASELINE: Testcontainers resources='+beforeTc.length+'; project Mongo containers='+beforeMongo.length);
 const env={};for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','TZ','TERM'])if(process.env[key]!==undefined)env[key]=process.env[key];env.JAVA_HOME=jdk;
 requireCheck(!Object.keys(env).some(k=>/MONGODB|^MONGO(?:_|$)|PASSWORD|JWT|^SPRING_|MAVEN_OPTS|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS/.test(k)),'no database/development credential/configuration overrides');
 console.log('CHILD_ENV: database variables=0; development credentials/JWT/configuration overrides=0; Java 25');
 console.log('MAVEN: offline working-tree clean verify including approved jacoco-check; 185-second process bound');
 const child=spawn('timeout',['-k','5s','185s','./mvnw','-o','-B','-ntp','-gs',settings,'-s',settings,'-Dspring.test.mockmvc.print=NONE','clean','verify'],{cwd:module,env,stdio:['ignore','pipe','pipe']});
 let raw='',pending='',containerStarts=0;
 const consume=chunk=>{
  const text=chunk.toString();raw+=text;if(raw.length>32*1024*1024){child.kill('SIGTERM');return;}pending+=text;
  let end;while((end=pending.indexOf('\n'))>=0){
   const line=pending.slice(0,end).replace(/\r$/,'');pending=pending.slice(end+1);
   if(/Container .* started in/.test(line))containerStarts++;
   if(/^\[INFO\] (?:--- (?:clean|jacoco|resources|compiler|surefire|jar|spring-boot):|Tests run: \d+|BUILD (?:SUCCESS|FAILURE)|Total time:|Analyzed bundle|All coverage checks have been met\.)/.test(line)&&!/eyJ|Cookie|password|secret|token|mongodb:\/\//i.test(line))console.log(line);
  }
 };
 child.stdout.on('data',consume);child.stderr.on('data',consume);
 const heartbeat=setInterval(()=>console.log('PROGRESS: I3 full verification running; existing services are not controlled'),20000);
 const result=await new Promise(resolve=>{child.on('error',()=>resolve({code:null}));child.on('close',(code,signal)=>resolve({code,signal}));});clearInterval(heartbeat);
 const totals={tests:0,failures:0,errors:0,skipped:0};const live=new Map();
 const reports=join(module,'target/surefire-reports');
 if(existsSync(reports))for(const file of readdirSync(reports).filter(f=>/^TEST-.*\.xml$/.test(f))){
  const xml=readFileSync(join(reports,file),'utf8'),header=xml.match(/<testsuite\b[^>]*>/)?.[0]||'';
  for(const key of Object.keys(totals))totals[key]+=Number(header.match(new RegExp('\\b'+key+'="(\\d+)"'))?.[1]||0);
  for(const name of ['ownedContainerConnectionRespondsToPing','containerConnectionOverridesExternalMongoSettings','qaOwnedProductRoundTripPreservesAuditingAndVersion']){
   const match=xml.match(new RegExp('<testcase\\b[^>]*\\bname="'+name+'"[^>]*(?:/\\s*>|>([\\s\\S]*?)</testcase>)'));if(match)live.set(name,!/<(?:failure|error|skipped)\b/.test(match[1]||''));
  }
 }
 console.log('MAVEN_EXIT: '+result.code);console.log('SUREFIRE_TOTALS: '+JSON.stringify(totals));
 for(const[name,passed]of live)console.log('LIVE_REGRESSION: '+name+' '+(passed?'PASSED':'FAILED'));
 const checkExecuted=/--- jacoco:0\.8\.16:check \(jacoco-check\)/.test(raw);
 const checksMet=/\[INFO\] All coverage checks have been met\./.test(raw);
 console.log('JACOCO_CHECK: executed='+checkExecuted+'; all-coverage-checks-met='+checksMet);
 let artifacts=true;
 for(const p of ['springreactdemo-0.0.1-SNAPSHOT.jar','site/jacoco/index.html','site/jacoco/jacoco.xml']){const full=join(module,'target',p);const present=existsSync(full)&&statSync(full).size>0;artifacts&&=present;console.log('ARTIFACT: '+p+' '+(present?'present':'missing'));}
 let newTc=[];
 for(let i=0;i<30;i++){newTc=tcIds().filter(id=>!beforeTc.includes(id));if(newTc.length===0)break;await new Promise(resolve=>setTimeout(resolve,500));}
 const mongoUnchanged=JSON.stringify(beforeMongo)===JSON.stringify(projectMongo());
 const sourceUnchanged=git(['rev-parse','HEAD'])===beforeHead&&git(['status','--porcelain'])===beforeStatus&&JSON.stringify(fingerprints())===JSON.stringify(beforeFiles);
 console.log('CLEANUP: new Testcontainers resources='+newTc.length+'; observed container starts='+containerStarts);
 console.log('PRESERVATION: development Mongo identity/state/start/health unchanged='+mongoUnchanged+'; source HEAD/status/modified-file contents unchanged='+sourceUnchanged);
 console.log('ELAPSED_SECONDS: '+((Date.now()-started)/1000).toFixed(1));
 const passed=result.code===0&&totals.tests===296&&totals.failures===0&&totals.errors===0&&totals.skipped===0&&live.size===3&&[...live.values()].every(Boolean)&&checkExecuted&&checksMet&&artifacts&&newTc.length===0&&mongoUnchanged&&sourceUnchanged;
 console.log('I3_FULL_VERIFY: '+(passed?'PASSED':'FAILED'));
 if(!passed){
  console.log('SAFE_DIAGNOSTICS: offline-cache-miss='+/Cannot access .*offline|has not been downloaded|not been cached|not available in offline/i.test(raw)+'; coverage-violation='+/Rule violated|Coverage checks have not been met/.test(raw)+'; compilation-error='+/COMPILATION ERROR|Compilation failure/.test(raw));
  console.log('CAUSE_CLASSES: '+[...new Set([...raw.matchAll(/Caused by:\s+([A-Za-z0-9_.$]+)/g)].map(m=>m[1]))].join(', '));process.exitCode=2;
 }
}catch{
 console.log('I3_FULL_VERIFY: BLOCKED (prerequisite/tooling failure; raw diagnostics withheld)');console.log('ELAPSED_SECONDS: '+((Date.now()-started)/1000).toFixed(1));process.exitCode=2;
}
