const D=["Pull A","Push A","Legs A","Pull B","Push B","Legs B"];
const T0={
"Dag 1 – Bryst & triceps":["Incline barbell bench press 4x6-8","Bench press 3x6-8","Incline dumbbell press 2x8-10","Dumbbell flyes 2x12-15","Overhead extension 2x12-15","Lateral raises 2x12-15","Push-ups 1-2xAMRAP"],
"Dag 2 – Ryg & biceps":["Barbell row 4x8-10","One-arm dumbbell row 3x8-10","Face pulls 2x12-15","Reverse flyes 2x12-15","Barbell curls 2x8-10","Hammer curls 2x12-15"],
"Dag 3 – Deadlift-fokus":["Deadlift 3x5-6","Romanian deadlift 3x8-10","Bulgarian split squat 2x10-12","Calf raises 3x12-15","Dragon flags 2x6-8","Woodchopper 2x12-15"],
"Dag 4 – Skuldre & triceps":["Overhead press 4x6-8","Close-grip bench press 3x8-10","Dumbbell press 2x8-10","Skull crushers 2x12-15","Lateral raises 2x12-15","Push-ups 1xAMRAP"],
"Dag 5 – Ryg & biceps":["Barbell curls 3x8-10","Concentration curls 2x12-15","Pendlay row 4x6-8","Chest-supported row 3x8-10","Seated cable row 3x10-12","Reverse flyes 2x12-15"],
"Dag 6 – Squat-fokus":["Back squat 4x5-6","Walking lunges 3x12","Hip thrust 3x8-10","Calf raises 3x12-15","Dragon flags 2x6-8","Woodchopper 2x12-15"]
};
const SCHEMA_VERSION=2;
const DEFAULT_REP_RANGE_MIN=6;
const DEFAULT_REP_RANGE_MAX=10;
const NOTES_SAVE_DEBOUNCE_MS=1200;
const PROGRESS_SAVE_DEBOUNCE_MS=300;
let s={split:D.slice(),w:{},n:{},last:null,ci:0,cd:{},wd:{},t:{},a:{},pg:{},meta:{schemaVersion:SCHEMA_VERSION,statsLastComputedAt:null}};
let localPersistCache={};
let notesSaveTimers={};
let progressSaveTimer=null;
const $=(i)=>document.getElementById(i);const C=(t,cl)=>{let e=document.createElement(t);if(cl)e.className=cl;return e;};
function exName(x){if(typeof x==='string')return x;return x&&typeof x.name==='string'&&x.name.trim()?x.name:'Ukendt øvelse';}
function exId(x){if(typeof x==='string')return `legacy:${x}`;if(!x||typeof x!=='object')return `legacy:${exName(x)}`;return x.id||x.exerciseId||`legacy:${exName(x)}`;}
function occKey(exerciseEntry,idx){return `${exId(exerciseEntry)}#${idx}`;}
function exRef(x){if(typeof x==='string'){return{id:`legacy:${x}`,exerciseId:null,name:x,bodyParts:[],targetMuscles:[],equipments:[],gifUrl:null,source:'legacy'};}if(!x||typeof x!=='object'){let n=exName(x);return{id:`legacy:${n}`,exerciseId:null,name:n,bodyParts:[],targetMuscles:[],equipments:[],gifUrl:null,source:'legacy'};}let n=exName(x);let id=x.id||x.exerciseId||`legacy:${n}`;let out={id,exerciseId:x.exerciseId||null,name:n,bodyParts:Array.isArray(x.bodyParts)?x.bodyParts:[],targetMuscles:Array.isArray(x.targetMuscles)?x.targetMuscles:[],equipments:Array.isArray(x.equipments)?x.equipments:[],gifUrl:x.gifUrl||null,source:x.source||'exercisedb'};if(typeof x.todayOccurrenceId==='string'&&x.todayOccurrenceId.trim())out.todayOccurrenceId=x.todayOccurrenceId;return out;}
function createOccurrenceId(){return `tod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function ensureTodayOccurrence(entry){let ex=exRef(entry);if(!ex.todayOccurrenceId)ex.todayOccurrenceId=createOccurrenceId();return ex;}
function occKeyForDateExercise(exerciseEntry,idx){if(exerciseEntry&&typeof exerciseEntry==='object'&&exerciseEntry.todayOccurrenceId)return `${exId(exerciseEntry)}@${exerciseEntry.todayOccurrenceId}`;return occKey(exerciseEntry,idx);}
function normalizeWorkoutEntries(arr){if(!Array.isArray(arr))return[];return arr.map(exRef);}
function toNum(v){let n=typeof v==='number'?v:parseFloat(v);return Number.isFinite(n)?n:null;}
function sanitizeSetEntry(setEntry,idx){let repsRaw=toNum(setEntry&&setEntry.reps);let kilosRaw=toNum(setEntry&&setEntry.kilos);let reps=repsRaw===null?0:Math.max(0,Math.round(repsRaw));let kilos=kilosRaw===null?0:Math.max(0,Math.round(kilosRaw*2)/2);let rirRaw=toNum(setEntry&&setEntry.rir);let rpeRaw=toNum(setEntry&&setEntry.rpe);return{setIndex:idx+1,reps,kilos,rir:rirRaw===null?null:Math.max(0,Math.min(5,Math.round(rirRaw))),rpe:rpeRaw===null?null:Math.max(1,Math.min(10,Math.round(rpeRaw*10)/10)),isWarmup:!!(setEntry&&setEntry.isWarmup)};}
function deriveExerciseMetrics(progress){let sets=Array.isArray(progress&&progress.sets)?progress.sets:[];let workSets=sets.filter(st=>!st.isWarmup);let volumeKg=workSets.reduce((acc,st)=>acc+((st.reps||0)*(st.kilos||0)),0);let totalReps=workSets.reduce((acc,st)=>acc+(st.reps||0),0);let totalSets=workSets.length;let bestSetByLoad=workSets.reduce((best,st)=>{if(!best)return st;if((st.kilos||0)>(best.kilos||0))return st;if((st.kilos||0)===(best.kilos||0)&&(st.reps||0)>(best.reps||0))return st;return best;},null);let estimated1RM=bestSetByLoad?(bestSetByLoad.kilos*(1+(bestSetByLoad.reps/30))):0;let topSet=bestSetByLoad?{reps:bestSetByLoad.reps||0,kilos:bestSetByLoad.kilos||0}:null;return{sets,topSet,volumeKg:Math.round(volumeKg*100)/100,totalReps,totalSets,estimated1RM:Math.round(estimated1RM*100)/100};}
function progressionDefaultsForExercise(exerciseEntry){let ex=exRef(exerciseEntry);let bps=(ex.bodyParts||[]).map(x=>String(x).toLowerCase());let isLower=bps.some(bp=>bp.includes('leg')||bp.includes('glute')||bp.includes('hamstring')||bp.includes('quad'));return{repRangeMin:DEFAULT_REP_RANGE_MIN,repRangeMax:DEFAULT_REP_RANGE_MAX,incrementKg:isLower?5:2.5,primaryMetric:'topSet'};}
function normalizeProgressionGoal(goal,exerciseEntry){let d=progressionDefaultsForExercise(exerciseEntry);let repRangeMin=Math.max(1,Math.round(toNum(goal&&goal.repRangeMin)??d.repRangeMin));let repRangeMax=Math.max(repRangeMin,Math.round(toNum(goal&&goal.repRangeMax)??d.repRangeMax));let incrementKg=Math.max(0.5,Math.round((toNum(goal&&goal.incrementKg)??d.incrementKg)*2)/2);let pm=(goal&&typeof goal.primaryMetric==='string')?goal.primaryMetric:d.primaryMetric;let primaryMetric=['topSet','e1RM','volume'].includes(pm)?pm:d.primaryMetric;return{repRangeMin,repRangeMax,incrementKg,primaryMetric};}
function normalizeExerciseProgress(progress,exerciseEntry){let legacyReps=toNum(progress&&progress.reps);let legacyKilos=toNum(progress&&progress.kilos);let setsSrc=Array.isArray(progress&&progress.sets)?progress.sets:[];if(!setsSrc.length&&(legacyReps!==null||legacyKilos!==null)){setsSrc=[{reps:legacyReps||0,kilos:legacyKilos||0,isWarmup:false}];}
let sets=setsSrc.map((st,idx)=>sanitizeSetEntry(st,idx));
if(!sets.length){sets=[sanitizeSetEntry({reps:0,kilos:0,isWarmup:false},0)];}
let metrics=deriveExerciseMetrics({sets});
let topSet=metrics.topSet||{reps:legacyReps===null?0:legacyReps,kilos:legacyKilos===null?0:legacyKilos};
let reps=topSet.reps||0;
let kilos=topSet.kilos||0;
return{done:!!(progress&&progress.done),reps,kilos,sets:metrics.sets,topSet,volumeKg:metrics.volumeKg,totalReps:metrics.totalReps,totalSets:metrics.totalSets,estimated1RM:metrics.estimated1RM,exerciseNotes:typeof(progress&&progress.exerciseNotes)==='string'?progress.exerciseNotes:'',painFlag:!!(progress&&progress.painFlag)};
}
function updateProgressMetrics(dateIso,dayName,exerciseOccurrenceKey,exerciseEntry){let p=getExerciseProgress(dateIso,dayName,exerciseOccurrenceKey,exerciseEntry);let normalized=normalizeExerciseProgress(p,exerciseEntry);let dayLog=getDayLog(dateIso,dayName);dayLog.exercises[exerciseOccurrenceKey]=normalized;return normalized;}
function aggregateDayLog(dateIso,dayName){let dayLog=getDayLog(dateIso,dayName);let vals=Object.values(dayLog.exercises||{}).map(v=>normalizeExerciseProgress(v,null));let dayVolumeKg=vals.reduce((a,v)=>a+(v.volumeKg||0),0);let daySets=vals.reduce((a,v)=>a+(v.totalSets||0),0);let dayReps=vals.reduce((a,v)=>a+(v.totalReps||0),0);let completedExerciseCount=vals.reduce((a,v)=>a+(v.done?1:0),0);dayLog.summary={dayVolumeKg:Math.round(dayVolumeKg*100)/100,daySets,dayReps,completedExerciseCount};return dayLog.summary;}
function metricsDeltaStatus(currentValue,previousValue,tolerance=0.0001){if(previousValue===null||previousValue===undefined)return'baseline';if(currentValue>previousValue+tolerance)return'up';if(currentValue<previousValue-tolerance)return'down';return'flat';}
function getExerciseLogMetric(exLog,metric){if(!exLog)return 0;if(metric==='e1RM')return toNum(exLog.estimated1RM)||0;if(metric==='volume')return toNum(exLog.volumeKg)||0;let top=exLog.topSet||null;if(top&&toNum(top.kilos)!==null)return (toNum(top.kilos)||0)*1000+(toNum(top.reps)||0);let kilos=toNum(exLog.kilos)||0;let reps=toNum(exLog.reps)||0;return kilos*1000+reps;}
function listCompletedDates(){return Object.keys(s.cd||{}).filter(k=>s.cd[k]&&typeof s.cd[k]==='object').sort();}
function findExerciseHistory(exerciseKey,untilDateExclusive){let out=[];listCompletedDates().forEach(dateIso=>{if(untilDateExclusive&&dateIso>=untilDateExclusive)return;let day=s.cd[dateIso];if(!day||!Array.isArray(day.exerciseLogs))return;day.exerciseLogs.forEach((log,idx)=>{let key=log.exerciseKey||log.id||`legacy:${log.name||idx}`;if(key===exerciseKey)out.push({dateIso,log});});});return out;
}
function getLastComparableSession(exerciseKey,todayIso){let hist=findExerciseHistory(exerciseKey,todayIso);if(!hist.length)return null;return hist[hist.length-1];}
function getProgressionGoal(exerciseEntry){let key=exId(exerciseEntry);if(!s.pg||typeof s.pg!=='object')s.pg={};if(!s.pg[key])s.pg[key]=normalizeProgressionGoal(null,exerciseEntry);else s.pg[key]=normalizeProgressionGoal(s.pg[key],exerciseEntry);return s.pg[key];}
function getNextTarget(exerciseEntry,todayIso){let key=exId(exerciseEntry),goal=getProgressionGoal(exerciseEntry),prev=getLastComparableSession(key,todayIso);if(!prev)return{label:'Start baseline',status:'baseline'};let prevTop=prev.log.topSet||{reps:prev.log.reps||0,kilos:prev.log.kilos||0};let nextKilos=prevTop.kilos;let nextReps=Math.min(goal.repRangeMax,Math.max(goal.repRangeMin,prevTop.reps));if(prevTop.reps>=goal.repRangeMax)nextKilos=Math.round((prevTop.kilos+goal.incrementKg)*2)/2;else nextReps=Math.min(goal.repRangeMax,prevTop.reps+1);return{label:`Mål: ${nextKilos} kg × ${nextReps} reps`,status:'target',last:`Sidst: ${prevTop.kilos} kg × ${prevTop.reps} reps (${prev.dateIso})`};
}
function getIsoWeekKey(dateIso){let d=fromIso(dateIso);let day=(d.getDay()+6)%7;d.setDate(d.getDate()-day+3);let thursday= new Date(d.getFullYear(),0,4);let thDay=(thursday.getDay()+6)%7;thursday.setDate(thursday.getDate()-thDay+3);let week=1+Math.round((d-thursday)/(7*864e5));return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;}
function getWeekSummary(targetDateIso){let targetWeek=getIsoWeekKey(targetDateIso);let sum={weekKey:targetWeek,totalVolumeKg:0,totalSets:0,totalReps:0,sessions:0,prCount:0};Object.entries(s.cd||{}).forEach(([dateIso,day])=>{if(getIsoWeekKey(dateIso)!==targetWeek)return;sum.sessions++;(day.exerciseLogs||[]).forEach(log=>{sum.totalVolumeKg+=toNum(log.volumeKg)||0;sum.totalSets+=toNum(log.totalSets)||0;sum.totalReps+=toNum(log.totalReps)||0;if(log.isPR_load||log.isPR_repsAtLoad||log.isPR_e1RM||log.isPR_volume)sum.prCount++;});});sum.totalVolumeKg=Math.round(sum.totalVolumeKg*100)/100;return sum;}
function getPreviousWeekKey(weekKey){let [yy,ww]=String(weekKey||'').split('-W');let year=parseInt(yy,10),week=parseInt(ww,10);if(!year||!week)return null;let d=new Date(Date.UTC(year,0,4));let day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3+(week-1)*7-7);let y=d.getUTCFullYear();let first=new Date(Date.UTC(y,0,4));let firstDay=(first.getUTCDay()+6)%7;first.setUTCDate(first.getUTCDate()-firstDay+3);let w=1+Math.round((d-first)/(7*864e5));return `${y}-W${String(w).padStart(2,'0')}`;}
function getBlockKey(dateIso){let dates=listCompletedDates();if(!dates.length)return null;let anchorWeek=getIsoWeekKey(dates[0]);let [ay,aw]=anchorWeek.split('-W');let [cy,cw]=getIsoWeekKey(dateIso).split('-W');let anchor= parseInt(ay,10)*53+parseInt(aw,10);let current=parseInt(cy,10)*53+parseInt(cw,10);let offset=Math.max(0,current-anchor);let block=Math.floor(offset/4)+1;return `B${String(block).padStart(2,'0')}`;}
function getBlockSummary(targetDateIso){let blockKey=getBlockKey(targetDateIso);if(!blockKey)return{blockKey:'B01',totalVolumeKg:0,totalSets:0,sessions:0,prCount:0};let sum={blockKey,totalVolumeKg:0,totalSets:0,sessions:0,prCount:0};Object.entries(s.cd||{}).forEach(([dateIso,day])=>{if(getBlockKey(dateIso)!==blockKey)return;sum.sessions++;(day.exerciseLogs||[]).forEach(log=>{sum.totalVolumeKg+=toNum(log.volumeKg)||0;sum.totalSets+=toNum(log.totalSets)||0;if(log.isPR_load||log.isPR_repsAtLoad||log.isPR_e1RM||log.isPR_volume)sum.prCount++;});});sum.totalVolumeKg=Math.round(sum.totalVolumeKg*100)/100;return sum;}
function ensureStateShape(){
if(!s||typeof s!=='object')s={};
if(!s.w||typeof s.w!=='object')s.w={};
if(!s.n||typeof s.n!=='object')s.n={};
if(!s.cd||typeof s.cd!=='object')s.cd={};
if(!s.wd||typeof s.wd!=='object')s.wd={};
if(!s.t||typeof s.t!=='object')s.t={...T0};
if(!s.a||typeof s.a!=='object')s.a={};
if(!s.pg||typeof s.pg!=='object')s.pg={};
if(!s.meta||typeof s.meta!=='object')s.meta={schemaVersion:SCHEMA_VERSION,statsLastComputedAt:null};
if(!s.meta.ui||typeof s.meta.ui!=='object')s.meta.ui={};
if(typeof s.meta.ui.activeTab!=='string')s.meta.ui.activeTab='today';
if(!s.meta.ui.todayCollapsed||typeof s.meta.ui.todayCollapsed!=='object')s.meta.ui.todayCollapsed={};
if(!s.meta.ui.planCollapsed||typeof s.meta.ui.planCollapsed!=='object')s.meta.ui.planCollapsed={};
if(!Object.keys(s.t).length)s.t={...T0};
if(!Array.isArray(s.split))s.split=D.slice();
Object.keys(s.w).forEach(d=>{s.w[d]=normalizeWorkoutEntries(s.w[d]);});
Object.keys(s.pg).forEach(k=>{s.pg[k]=normalizeProgressionGoal(s.pg[k],null);});
Object.entries(s.wd).forEach(([dateIso,dayLog])=>{if(!dayLog||typeof dayLog!=='object')s.wd[dateIso]={dayName:nameFor(dateIso),exercises:{}};let dl=s.wd[dateIso];if(!dl.exercises||typeof dl.exercises!=='object')dl.exercises={};if(Array.isArray(dl.plannedExercises))dl.plannedExercises=dl.plannedExercises.map(ensureTodayOccurrence);else if(dl.plannedExercises!==undefined)delete dl.plannedExercises;Object.keys(dl.exercises).forEach(k=>{dl.exercises[k]=normalizeExerciseProgress(dl.exercises[k],null);});aggregateDayLog(dateIso,dl.dayName||nameFor(dateIso));});
Object.entries(s.cd).forEach(([dateIso,entry])=>{if(!entry||typeof entry!=='object'){delete s.cd[dateIso];return;}if(!Array.isArray(entry.exerciseLogs))entry.exerciseLogs=[];entry.exerciseLogs=entry.exerciseLogs.map((log,idx)=>{let exKey=log.exerciseKey||log.id||`legacy:${log.name||idx}`;let nlog=normalizeExerciseProgress(log,null);let top=nlog.topSet||{reps:nlog.reps||0,kilos:nlog.kilos||0};return{...log,id:exKey,exerciseKey:exKey,name:log.name||'Ukendt øvelse',done:!!log.done,reps:nlog.reps,kilos:nlog.kilos,topSet:top,sets:nlog.sets,volumeKg:nlog.volumeKg,totalReps:nlog.totalReps,totalSets:nlog.totalSets,estimated1RM:nlog.estimated1RM,isPR_load:!!log.isPR_load,isPR_repsAtLoad:!!log.isPR_repsAtLoad,isPR_e1RM:!!log.isPR_e1RM,isPR_volume:!!log.isPR_volume};});});
if((s.meta.schemaVersion||1)<SCHEMA_VERSION){s.meta.schemaVersion=SCHEMA_VERSION;}
if(s.meta.statsLastComputedAt!==null&&typeof s.meta.statsLastComputedAt!=='string')s.meta.statsLastComputedAt=null;
}
function setActiveTab(tab){ensureStateShape();s.meta.ui.activeTab=tab;save({sync:false});}
function getActiveTab(){ensureStateShape();return s.meta.ui.activeTab||'today';}
function getTodayCollapseKey(dayName,exerciseEntry,idx){return `${dayName}:${occKeyForDateExercise(exerciseEntry,idx)}`;}
function getDateExercises(dateIso,dayName){let dayLog=getDayLog(dateIso,dayName);if(Array.isArray(dayLog.plannedExercises))return dayLog.plannedExercises.map(exRef);return (s.w[dayName]||[]).map(exRef);}
function ensureDateExerciseOverride(dateIso,dayName){let dayLog=getDayLog(dateIso,dayName);if(!Array.isArray(dayLog.plannedExercises))dayLog.plannedExercises=(s.w[dayName]||[]).map(ensureTodayOccurrence);else dayLog.plannedExercises=dayLog.plannedExercises.map(ensureTodayOccurrence);return dayLog.plannedExercises;}
function addExerciseForToday(dateIso,dayName,exerciseEntry){let list=ensureDateExerciseOverride(dateIso,dayName);list.push(ensureTodayOccurrence(exerciseEntry));let dayLog=getDayLog(dateIso,dayName);dayLog.plannedExercises=list;s.last=latestCompletedDate();if(s.cd&&s.cd[dateIso])delete s.cd[dateIso];save();}
function removeExerciseForToday(dateIso,dayName,index){let list=ensureDateExerciseOverride(dateIso,dayName);if(index<0||index>=list.length)return;let removed=list[index];list.splice(index,1);let dayLog=getDayLog(dateIso,dayName);dayLog.plannedExercises=list;let removedKey=occKeyForDateExercise(removed,index);if(dayLog.exercises&&dayLog.exercises[removedKey])delete dayLog.exercises[removedKey];s.last=latestCompletedDate();if(s.cd&&s.cd[dateIso])delete s.cd[dateIso];save();}
function openAddExerciseForToday(){let t=iso(new Date()),dayName=nameFor(t);openAddExerciseModal(dayName,{onAdd:(exercise)=>{addExerciseForToday(t,dayName,exercise);},refreshPlan:false,refreshToday:true});}
function isTodayCollapsed(dayName,exerciseEntry,idx){ensureStateShape();let key=getTodayCollapseKey(dayName,exerciseEntry,idx);if(typeof s.meta.ui.todayCollapsed[key]==='boolean')return s.meta.ui.todayCollapsed[key];return true;}
function setTodayCollapsed(dayName,exerciseEntry,idx,value){ensureStateShape();let key=getTodayCollapseKey(dayName,exerciseEntry,idx);s.meta.ui.todayCollapsed[key]=!!value;save({sync:false});}
/* Modal infrastructure */function openMod(id){let m=$(id);if(m)m.setAttribute('aria-hidden','false');}function closeMod(id){let m=$(id);if(m)m.setAttribute('aria-hidden','true');}function createMod(id,title,body,footer){let m=C('div','modal');m.id=id;m.setAttribute('aria-hidden','true');let bd=C('div','modal-backdrop');m.appendChild(bd);let mc=C('div','modal-content');mc.setAttribute('role','dialog');mc.setAttribute('aria-modal','true');if(title){let h=C('h3');h.textContent=title;mc.appendChild(h);}mc.appendChild(body);if(footer)mc.appendChild(footer);let cb=C('button','icon-btn');cb.textContent='✕';cb.title='Luk';cb.addEventListener('click',()=>closeMod(id));mc.appendChild(cb);m.appendChild(mc);bd.addEventListener('click',()=>closeMod(id));return m;}let cur_rename_day=null,cur_rename_idx=null;function openRenameModal(idx,oldName){cur_rename_idx=idx;cur_rename_day=oldName;let b=C('div');let inp=C('input');inp.type='text';inp.value=oldName;inp.placeholder='Nyt navn...';inp.autoFocus=true;inp.className='modal-input';b.appendChild(inp);let ft=C('div','modal-footer');let cb=C('button','secondary-btn');cb.textContent='Annullér';cb.addEventListener('click',()=>closeMod('rename-modal'));let sb=C('button','primary-btn');sb.textContent='Gem';sb.addEventListener('click',()=>{let n=inp.value.trim();if(!n){alert('Navn må ikke være tomt');return;}if(n===oldName){closeMod('rename-modal');return;}if(s.split.includes(n)){alert('Navn findes allerede');return;}rename(idx,n);closeMod('rename-modal');});inp.addEventListener('keydown',e=>{if(e.key==='Enter')sb.click();});ft.appendChild(cb);ft.appendChild(sb);b.appendChild(ft);let m=$('rename-modal');let mc=m.querySelector('.modal-content');mc.innerHTML='';let h=C('h3');h.textContent='Omdøb dag';mc.appendChild(h);mc.appendChild(b);let xb=C('button','icon-btn');xb.textContent='✕';xb.title='Luk';xb.addEventListener('click',()=>closeMod('rename-modal'));xb.style.position='absolute';xb.style.right='0.5rem';xb.style.top='0.5rem';mc.appendChild(xb);openMod('rename-modal');}let cur_tem_mode=null,cur_tem_name=null;function openTemplateModal(mode,name){cur_tem_mode=mode;cur_tem_name=name;let isEdit=mode==='edit';let curr=isEdit?s.t[name]||[]:[];let b=C('div');let nb=C('label');nb.textContent='Navn:';nb.className='modal-label';b.appendChild(nb);let ninp=C('input');ninp.type='text';ninp.value=isEdit?name:'';ninp.placeholder='Navn...';ninp.className='modal-input';b.appendChild(ninp);let eb=C('label');eb.textContent='Øvelser (komma-adskilt):';eb.className='modal-label';eb.style.marginTop='0.5rem';b.appendChild(eb);let einp=C('textarea');einp.value=curr.join(', ');einp.placeholder='Øvelse 1, Øvelse 2, ...';einp.className='modal-textarea';b.appendChild(einp);let ft=C('div','modal-footer');let cancelbtn=C('button','secondary-btn');cancelbtn.textContent='Annullér';cancelbtn.addEventListener('click',()=>closeMod('template-modal'));let savebtn=C('button','primary-btn');savebtn.textContent='Gem';savebtn.addEventListener('click',()=>{let nn=ninp.value.trim();let ex=einp.value.split(',').map(st=>st.trim()).filter(Boolean);if(!nn){alert('Navn må ikke være tomt');return;}if(!ex.length){alert('Mindst en øvelse skal angives');return;}if(isEdit&&nn!==name&&s.t[nn]){alert('Navn eksisterer allerede');return;}if(isEdit&&nn!==name){delete s.t[name];for(let d in s.a)if(s.a[d]===name)s.a[d]=nn;}s.t[nn]=ex;save();rTem();rPlan();closeMod('template-modal');});ft.appendChild(cancelbtn);ft.appendChild(savebtn);b.appendChild(ft);let m=$('template-modal');let mc=m.querySelector('.modal-content');mc.innerHTML='';let h=C('h3');h.textContent=isEdit?'Rediger skabelon':'Ny skabelon';mc.appendChild(h);mc.appendChild(b);let xb=C('button','icon-btn');xb.textContent='✕';xb.title='Luk';xb.addEventListener('click',()=>closeMod('template-modal'));xb.style.position='absolute';xb.style.right='0.5rem';xb.style.top='0.5rem';mc.appendChild(xb);openMod('template-modal');}let cur_add_ex_day=null;function openAddExerciseModal(dayName,opts={}){cur_add_ex_day=dayName;let onAdd=typeof opts.onAdd==='function'?opts.onAdd:(exercise)=>add(dayName,exercise);let refreshPlan=opts.refreshPlan!==false;let refreshToday=opts.refreshToday!==false;let b=C('div');let q=C('input','modal-input');q.type='text';q.placeholder='Søg øvelse...';q.autoFocus=true;b.appendChild(q);let fr=C('div','template-row');let bp=C('select');let mu=C('select');let eq=C('select');[bp,mu,eq].forEach(sel=>{let o=C('option');o.value='';o.textContent='Alle';sel.appendChild(o);});fr.append(bp,mu,eq);b.appendChild(fr);let rs=C('div');rs.style.maxHeight='280px';rs.style.overflow='auto';rs.style.marginTop='0.4rem';b.appendChild(rs);let manual=C('input','modal-input');manual.placeholder='Tilføj manuelt (valgfrit)';manual.style.marginTop='0.5rem';b.appendChild(manual);let ft=C('div','modal-footer');let cancelbtn=C('button','secondary-btn');cancelbtn.textContent='Annullér';cancelbtn.addEventListener('click',()=>closeMod('add-ex-modal'));let addManualBtn=C('button','primary-btn');addManualBtn.textContent='Tilføj manuelt';addManualBtn.addEventListener('click',()=>{let v=(manual.value||q.value||'').trim();if(!v){alert('Øvelsesnavn må ikke være tomt');return;}onAdd({id:`legacy:${v}`,exerciseId:null,name:v,bodyParts:[],targetMuscles:[],equipments:[],gifUrl:null,source:'manual'});closeMod('add-ex-modal');if(refreshPlan)rPlan();if(refreshToday)rToday();});ft.append(cancelbtn,addManualBtn);b.appendChild(ft);let m=$('add-ex-modal');let mc=m.querySelector('.modal-content');mc.innerHTML='';let h=C('h3');h.textContent='Tilføj øvelse fra katalog';mc.append(h,b);let xb=C('button','icon-btn');xb.textContent='✕';xb.title='Luk';xb.addEventListener('click',()=>closeMod('add-ex-modal'));xb.style.position='absolute';xb.style.right='0.5rem';xb.style.top='0.5rem';mc.appendChild(xb);async function fillMeta(){if(typeof exerciseCatalogMeta!=='function')return;let meta=await exerciseCatalogMeta();[['bodyParts',bp,'Alle bodyparts'],['muscles',mu,'Alle muskler'],['equipments',eq,'Alt udstyr']].forEach(([k,sel,label])=>{let first=sel.querySelector('option');if(first)first.textContent=label;(meta[k]||[]).forEach(x=>{let o=C('option');o.value=x.name;o.textContent=x.name;sel.appendChild(o);});});}async function searchAndRender(){if(typeof exerciseCatalogSearch!=='function'){rs.textContent='Katalog er ikke tilgængeligt';return;}rs.innerHTML='';let res=await exerciseCatalogSearch({search:q.value.trim(),bodyPart:bp.value,muscle:mu.value,equipment:eq.value,limit:25,offset:0});if(!res.data.length){let empty=C('div','card-subtitle');empty.textContent='Ingen øvelser fundet';rs.appendChild(empty);return;}res.data.forEach(ex=>{let row=C('div','exercise-item');let nm=C('span','exercise-name');nm.textContent=ex.name;let addBtn=C('button','primary-btn');addBtn.textContent='Tilføj';addBtn.style.padding='0.45rem 0.7rem';addBtn.addEventListener('click',()=>{onAdd(ex);closeMod('add-ex-modal');if(refreshPlan)rPlan();if(refreshToday)rToday();});row.append(nm,addBtn);rs.appendChild(row);});}q.addEventListener('input',()=>{searchAndRender();});bp.addEventListener('change',()=>{searchAndRender();});mu.addEventListener('change',()=>{searchAndRender();});eq.addEventListener('change',()=>{searchAndRender();});fillMeta().then(()=>searchAndRender());openMod('add-ex-modal');}function showConfirm(title,message,onConfirm,onCancel){let b=C('div');let msg=C('p');msg.textContent=message;msg.className='modal-message';b.appendChild(msg);let ft=C('div','modal-footer');let cancelbtn=C('button','secondary-btn');cancelbtn.textContent='Annullér';cancelbtn.addEventListener('click',()=>{closeMod('confirm-modal');if(onCancel)onCancel();});let confirmbtn=C('button','danger-btn');confirmbtn.textContent='Slet';confirmbtn.addEventListener('click',()=>{closeMod('confirm-modal');onConfirm();});ft.appendChild(cancelbtn);ft.appendChild(confirmbtn);b.appendChild(ft);let m=$('confirm-modal');let mc=m.querySelector('.modal-content');mc.innerHTML='';let h=C('h3');h.textContent=title;mc.appendChild(h);mc.appendChild(b);let xb=C('button','icon-btn');xb.textContent='✕';xb.title='Luk';xb.addEventListener('click',()=>closeMod('confirm-modal'));xb.style.position='absolute';xb.style.right='0.5rem';xb.style.top='0.5rem';mc.appendChild(xb);openMod('confirm-modal');}
function load(stateObj){try{let f,r=localStorage;
 if(stateObj){s=stateObj;ensureStateShape();save({sync:false});return;}
 f=r.getItem("splitOrder");if(f){f=JSON.parse(f);if(Array.isArray(f)&&f.length==6)s.split=f;}
 f=r.getItem("workouts");if(f){f=JSON.parse(f);if(f&&typeof f=="object")s.w=f;}
 f=r.getItem("notes");if(f){f=JSON.parse(f);if(f&&typeof f=="object")s.n=f;}
 f=r.getItem("lastPlannedDate");if(f)s.last=f;
 f=r.getItem("currentDayIndex");if(f!==null){f=parseInt(f,10);if(!isNaN(f)&&f>=0&&f<s.split.length)s.ci=f;}
 f=r.getItem("completedDays");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.cd=c;}catch{} }
 f=r.getItem("workoutDayLogs");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.wd=c;}catch{} }
 f=r.getItem("templates");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.t=c;}catch{} }
 if(!s.t||typeof s.t!="object")s.t={...T0};
 f=r.getItem("appliedTemplates");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.a=c;}catch{} }
 f=r.getItem("progressionGoals");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.pg=c;}catch{} }
 f=r.getItem("stateMeta");if(f){try{let c=JSON.parse(f);if(c&&typeof c=="object")s.meta=c;}catch{} }
 if(!s.wd||typeof s.wd!="object")s.wd={};
 if(!s.a||typeof s.a!="object")s.a={};
 if(!s.pg||typeof s.pg!="object")s.pg={};
 if(!s.meta||typeof s.meta!="object")s.meta={schemaVersion:SCHEMA_VERSION,statsLastComputedAt:null};
 ensureStateShape();
 save({sync:false});}catch(e){init();}}
function init(){s={split:D.slice(),w:{},n:{},last:null,ci:0,cd:{},wd:{},t:{...T0},a:{},pg:{},meta:{schemaVersion:SCHEMA_VERSION,statsLastComputedAt:null}};ensureStateShape();save({sync:false});}
function buildLocalPersistSnapshot(){return{workouts:JSON.stringify(s.w),splitOrder:JSON.stringify(s.split),notes:JSON.stringify(s.n),lastPlannedDate:s.last||"",currentDayIndex:String(s.ci),completedDays:JSON.stringify(s.cd||{}),workoutDayLogs:JSON.stringify(s.wd||{}),templates:JSON.stringify(s.t||{}),appliedTemplates:JSON.stringify(s.a||{}),progressionGoals:JSON.stringify(s.pg||{}),stateMeta:JSON.stringify(s.meta||{})};}
function writeLocalPersistSnapshot(snapshot){let r=localStorage;Object.entries(snapshot).forEach(([key,value])=>{if(localPersistCache[key]===value)return;r.setItem(key,value);localPersistCache[key]=value;});}
function buildSyncState(){let meta=s.meta&&typeof s.meta==='object'?{...s.meta}:{};if(meta&&typeof meta==='object'&&meta.ui)delete meta.ui;return{...s,meta};}
function save(opts={}){ensureStateShape();writeLocalPersistSnapshot(buildLocalPersistSnapshot());let shouldSync=opts&&opts.sync===false?false:true;let canSync=shouldSync&&typeof syncStateDebounced==='function'&&typeof authIsLoggedIn==='function'&&authIsLoggedIn();if(canSync){syncStateDebounced(buildSyncState());}}
function scheduleProgressSave(){if(progressSaveTimer)clearTimeout(progressSaveTimer);progressSaveTimer=setTimeout(()=>{progressSaveTimer=null;save();},PROGRESS_SAVE_DEBOUNCE_MS);}
function flushProgressSave(){if(!progressSaveTimer)return;clearTimeout(progressSaveTimer);progressSaveTimer=null;save();}
function iso(d){let y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");return`${y}-${m}-${dd}`;}
function fromIso(i){return new Date(i+"T00:00:00");}
function diff(a,b){return Math.floor((fromIso(b)-fromIso(a))/(864e5));}
function nameFor(i){if(!s.last)s.last=iso(new Date());let d=diff(s.last,i),idx=((s.ci+d)%s.split.length+s.split.length)%s.split.length;return s.split[idx];}
function latestCompletedDate(){let ks=Object.keys(s.cd||{}).filter(k=>s.cd[k]&&typeof s.cd[k]==='object');if(!ks.length)return null;ks.sort();return ks[ks.length-1];}
function getDayLog(dateIso,dayName){if(!s.wd||typeof s.wd!="object")s.wd={};if(!s.wd[dateIso]||typeof s.wd[dateIso]!="object")s.wd[dateIso]={dayName:dayName,exercises:{}};if(dayName&&s.wd[dateIso].dayName!==dayName)s.wd[dateIso].dayName=dayName;if(!s.wd[dateIso].exercises||typeof s.wd[dateIso].exercises!="object")s.wd[dateIso].exercises={};return s.wd[dateIso];}
function getExerciseProgress(dateIso,dayName,exerciseOccurrenceKey,exerciseEntry){let dl=getDayLog(dateIso,dayName);if(!dl.exercises[exerciseOccurrenceKey]||typeof dl.exercises[exerciseOccurrenceKey]!="object")dl.exercises[exerciseOccurrenceKey]=normalizeExerciseProgress({done:false,reps:0,kilos:0,sets:[{reps:0,kilos:0,isWarmup:false}]},exerciseEntry);else dl.exercises[exerciseOccurrenceKey]=normalizeExerciseProgress(dl.exercises[exerciseOccurrenceKey],exerciseEntry);return dl.exercises[exerciseOccurrenceKey];}
function setExerciseProgress(dateIso,dayName,exerciseOccurrenceKey,exerciseEntry,patch){let p=getExerciseProgress(dateIso,dayName,exerciseOccurrenceKey,exerciseEntry);let dayLog=getDayLog(dateIso,dayName);dayLog.exercises[exerciseOccurrenceKey]=normalizeExerciseProgress({...p,...patch},exerciseEntry);aggregateDayLog(dateIso,dayName);scheduleProgressSave();}
function rToday(){
let t=iso(new Date()),nm=nameFor(t),todayComp=s.cd&&s.cd[t]?s.cd[t]:null,lastComp=s.last||latestCompletedDate();
$("today-day-name").textContent=nm;
let statusEl=$("today-completion-status"),lastEl=$("today-last-planned"),btn=$("mark-today");
let todayExercises=getDateExercises(t,nm);
let doneCount=todayExercises.reduce((a,entry,idx)=>a+(getExerciseProgress(t,nm,occKeyForDateExercise(entry,idx),entry).done?1:0),0);
if(statusEl){
if(todayComp){
let at=todayComp.completedAt?new Date(todayComp.completedAt):new Date();
let tm=isNaN(at.getTime())?"":` (${at.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})})`;
let prCount=(todayComp.exerciseLogs||[]).reduce((a,log)=>a+((log.isPR_load||log.isPR_repsAtLoad||log.isPR_e1RM||log.isPR_volume)?1:0),0);
statusEl.textContent=`✅ Gennemført i dag${tm}${prCount?` · ${prCount} PR`:''}`;
statusEl.style.color="#16a34a";
}else{
statusEl.textContent=`Progress: ${doneCount}/${todayExercises.length||0} øvelser markeret`;
statusEl.style.color="#6b7280";
}
}
if(lastEl){lastEl.textContent=lastComp?`Sidst gennemført: ${new Date(lastComp).toLocaleDateString("da-DK")}`:"Ingen træning er markeret som gennemført endnu";}
if(btn){
let isDone=!!todayComp;
btn.classList.toggle("marked",isDone);
btn.textContent=isDone?"Fortryd: Markér ikke gennemført":"Markér dagens pas som gennemført";
btn.setAttribute("aria-pressed",isDone?"true":"false");
}
let addTodayBtn=$("today-add-exercise");
if(addTodayBtn){
addTodayBtn.textContent="➕ Tilføj øvelse til i dag";
addTodayBtn.onclick=()=>{openAddExerciseForToday();};
}
let l=$("today-exercise-list");
l.innerHTML="";
if(!todayExercises.length){let li=C("li","exercise-item");li.textContent="Ingen øvelser planlagt endnu.";l.appendChild(li);return;}
let autoExpandedFirst=false;
todayExercises.forEach((entry,idx)=>{
let exerciseKey=exId(entry),entryKey=occKeyForDateExercise(entry,idx),name=exName(entry),p=getExerciseProgress(t,nm,entryKey,entry),last=getLastComparableSession(exerciseKey,t),goal=getProgressionGoal(entry),target=getNextTarget(entry,t);
let li=C("li","exercise-item exercise-progress-item");
if(p.done)li.classList.add("done");
let head=C('div','exercise-top-row');
let left=C("div","exercise-progress-left");
let chk=C("input","exercise-done-checkbox");
chk.type='checkbox';
chk.checked=!!p.done;
chk.setAttribute('aria-label',`Marker ${name} som gennemført`);
let sp=C("span","exercise-name");
sp.textContent=name;
left.append(chk,sp);
let mini=C('div','card-subtitle exercise-mini-metrics');
mini.textContent=`${p.totalSets||0} sæt · ${p.totalReps||0} reps · ${p.volumeKg||0} kg vol · e1RM ${p.estimated1RM||0}`;
let toggle=C('button','icon-btn exercise-expand-btn');
let collapseKey=getTodayCollapseKey(nm,entry,idx);
let hasSavedCollapse=!!(s.meta&&s.meta.ui&&s.meta.ui.todayCollapsed&&typeof s.meta.ui.todayCollapsed[collapseKey]==='boolean');
let collapsed=hasSavedCollapse?isTodayCollapsed(nm,entry,idx):true;
if(!hasSavedCollapse&&!autoExpandedFirst&&!p.done){collapsed=false;autoExpandedFirst=true;}
toggle.textContent=collapsed?'▼':'▲';
toggle.title=collapsed?'Vis detaljer':'Skjul detaljer';
toggle.addEventListener('click',()=>{
collapsed=!collapsed;
setTodayCollapsed(nm,entry,idx,collapsed);
details.hidden=collapsed;
toggle.textContent=collapsed?'▼':'▲';
toggle.title=collapsed?'Vis detaljer':'Skjul detaljer';
});
let removeBtn=C('button','icon-btn exercise-remove-btn');
removeBtn.textContent='✕';
removeBtn.title='Fjern øvelse fra i dag';
removeBtn.addEventListener('click',()=>{removeExerciseForToday(t,nm,idx);rToday();rCal(new Date());});
head.append(left,mini,removeBtn,toggle);
li.appendChild(head);

let chips=C('div','info-chips');
let lastChip=C('span','card-subtitle info-chip');
lastChip.textContent=last?`Sidst: ${(last.log.topSet&&last.log.topSet.kilos)||last.log.kilos||0}kg × ${(last.log.topSet&&last.log.topSet.reps)||last.log.reps||0} (${last.dateIso})`:'Sidst: ingen data';
let targetChip=C('span','card-subtitle info-chip info-chip-target');
targetChip.textContent=target.label;
chips.append(lastChip,targetChip);
if(target.last){let lastTargetChip=C('span','card-subtitle info-chip');lastTargetChip.textContent=target.last;chips.append(lastTargetChip);}
li.appendChild(chips);

let details=C('div','exercise-details');
details.hidden=collapsed;
let setsWrap=C('div','exercise-sets-wrap');
let refreshMini=()=>{let pp=getExerciseProgress(t,nm,entryKey,entry);mini.textContent=`${pp.totalSets||0} sæt · ${pp.totalReps||0} reps · ${pp.volumeKg||0} kg vol · e1RM ${pp.estimated1RM||0}`;};
let renderSetRows=()=>{
setsWrap.innerHTML='';
let stateP=getExerciseProgress(t,nm,entryKey,entry);
(stateP.sets||[]).forEach((st,setIdx)=>{
let setRow=C('div','exercise-progress-controls set-row');
let setMain=C('div','set-row-main');
let lbl=C('span','card-subtitle');
lbl.classList.add('set-row-label');
lbl.textContent=`Sæt ${setIdx+1}`;
let repsGroup=C('div','metric-input-group');
let repsLabel=C('span','metric-input-label');
repsLabel.textContent='Reps';
let repsWrap=C('div','stepper-group');
let repsMinus=C('button','secondary-btn stepper-btn');repsMinus.type='button';repsMinus.textContent='−';
let reps=C('input','exercise-progress-input');reps.type='number';reps.min='0';reps.step='1';reps.placeholder='Reps';reps.value=st.reps??0;
reps.inputMode='numeric';
reps.setAttribute('aria-label',`Reps for sæt ${setIdx+1}`);
let repsPlus=C('button','secondary-btn stepper-btn');repsPlus.type='button';repsPlus.textContent='+';
repsWrap.append(repsMinus,reps,repsPlus);
let repsQuick=C('div','quick-adjust-group');
let repsQuickOne=C('button','secondary-btn compact-btn quick-adjust-btn');repsQuickOne.type='button';repsQuickOne.textContent='+1';
repsQuick.append(repsQuickOne);
repsGroup.append(repsLabel,repsWrap);
let kgGroup=C('div','metric-input-group');
let kgLabel=C('span','metric-input-label');
kgLabel.textContent='Kg';
let kgWrap=C('div','stepper-group');
let kgMinus=C('button','secondary-btn stepper-btn');kgMinus.type='button';kgMinus.textContent='−';
let kilos=C('input','exercise-progress-input');kilos.type='number';kilos.min='0';kilos.step='0.5';kilos.placeholder='Kg';kilos.value=st.kilos??0;
kilos.inputMode='decimal';
kilos.setAttribute('aria-label',`Kilo for sæt ${setIdx+1}`);
let kgPlus=C('button','secondary-btn stepper-btn');kgPlus.type='button';kgPlus.textContent='+';
kgWrap.append(kgMinus,kilos,kgPlus);
let kgQuick=C('div','quick-adjust-group');
let kgQuickTwo=C('button','secondary-btn compact-btn quick-adjust-btn');kgQuickTwo.type='button';kgQuickTwo.textContent='+2.5';
let kgQuickFive=C('button','secondary-btn compact-btn quick-adjust-btn');kgQuickFive.type='button';kgQuickFive.textContent='+5';
kgQuick.append(kgQuickTwo,kgQuickFive);
kgGroup.append(kgLabel,kgWrap);
let warmLbl=C('label','card-subtitle warmup-label');
let warm=C('input');warm.type='checkbox';warm.checked=!!st.isWarmup;warmLbl.append(warm,document.createTextNode('Warmup'));
let dupBtn=C('button','secondary-btn compact-btn');dupBtn.type='button';dupBtn.textContent='Dupl';
let delBtn=C('button','danger-btn compact-btn');delBtn.type='button';delBtn.textContent='✕';
let moreBtn=C('button','icon-btn set-more-btn');moreBtn.type='button';moreBtn.textContent='⋯';moreBtn.title='Flere handlinger';
let secondaryActions=C('div','set-secondary-actions hidden');
secondaryActions.append(dupBtn,delBtn);
let commitSet=(patch)=>{let current=getExerciseProgress(t,nm,entryKey,entry);let sets=(current.sets||[]).map((x,i)=>i===setIdx?{...x,...patch}:x);setExerciseProgress(t,nm,entryKey,entry,{sets});refreshMini();};
let setReps=(val)=>{let v=Math.max(0,Math.round(val));reps.value=v;commitSet({reps:v});};
let setKg=(val)=>{let v=Math.max(0,Math.round(val*2)/2);kilos.value=v;commitSet({kilos:v});};
reps.addEventListener('change',()=>setReps(toNum(reps.value)||0));
kilos.addEventListener('change',()=>setKg(toNum(kilos.value)||0));
repsMinus.addEventListener('click',()=>setReps((toNum(reps.value)||0)-1));
repsPlus.addEventListener('click',()=>setReps((toNum(reps.value)||0)+1));
repsQuickOne.addEventListener('click',()=>setReps((toNum(reps.value)||0)+1));
kgMinus.addEventListener('click',()=>setKg((toNum(kilos.value)||0)-0.5));
kgPlus.addEventListener('click',()=>setKg((toNum(kilos.value)||0)+0.5));
kgQuickTwo.addEventListener('click',()=>setKg((toNum(kilos.value)||0)+2.5));
kgQuickFive.addEventListener('click',()=>setKg((toNum(kilos.value)||0)+5));
warm.addEventListener('change',()=>commitSet({isWarmup:warm.checked}));
moreBtn.addEventListener('click',()=>{secondaryActions.classList.toggle('hidden');});
dupBtn.addEventListener('click',()=>{let current=getExerciseProgress(t,nm,entryKey,entry);let source=current.sets[setIdx]||{reps:0,kilos:0,isWarmup:false};let sets=[...(current.sets||[]),sanitizeSetEntry(source,(current.sets||[]).length)];setExerciseProgress(t,nm,entryKey,entry,{sets});renderSetRows();refreshMini();});
delBtn.addEventListener('click',()=>{let current=getExerciseProgress(t,nm,entryKey,entry);if((current.sets||[]).length<=1)return;let sets=(current.sets||[]).filter((_,i)=>i!==setIdx).map((x,i)=>sanitizeSetEntry(x,i));setExerciseProgress(t,nm,entryKey,entry,{sets});renderSetRows();refreshMini();});
setMain.append(lbl,repsGroup,repsQuick,kgGroup,kgQuick,warmLbl,moreBtn);
setRow.append(setMain,secondaryActions);
setsWrap.appendChild(setRow);
});
let goalRow=C('div','card-subtitle');
goalRow.textContent=`Målzone: ${goal.repRangeMin}-${goal.repRangeMax} reps · +${goal.incrementKg} kg · metric: ${goal.primaryMetric}`;
setsWrap.appendChild(goalRow);
};
renderSetRows();
let note=C('input','exercise-progress-input exercise-note-input');
note.placeholder='Øvelsesnote (valgfri)';
note.value=p.exerciseNotes||'';
note.addEventListener('change',()=>{setExerciseProgress(t,nm,entryKey,entry,{exerciseNotes:note.value||''});});
let bottom=C('div','exercise-bottom-row');
let addSetBtn=C('button','primary-btn compact-btn');
addSetBtn.type='button';
addSetBtn.textContent='➕ Sæt';
addSetBtn.addEventListener('click',()=>{let current=getExerciseProgress(t,nm,entryKey,entry);let sets=[...(current.sets||[]),sanitizeSetEntry({reps:0,kilos:0,isWarmup:false},(current.sets||[]).length)];setExerciseProgress(t,nm,entryKey,entry,{sets});renderSetRows();refreshMini();});
let painLbl=C('label','card-subtitle warmup-label');
let pain=C('input');
pain.type='checkbox';
pain.checked=!!p.painFlag;
pain.addEventListener('change',()=>{setExerciseProgress(t,nm,entryKey,entry,{painFlag:pain.checked});});
painLbl.append(pain,document.createTextNode('Smerte-flag'));
bottom.append(addSetBtn,painLbl);
details.append(setsWrap,note,bottom);
li.appendChild(details);
chk.addEventListener('change',()=>{
setExerciseProgress(t,nm,entryKey,entry,{done:chk.checked});
li.classList.toggle('done',chk.checked);
let dc=todayExercises.reduce((a,x,i)=>a+(getExerciseProgress(t,nm,occKeyForDateExercise(x,i),x).done?1:0),0);
if(statusEl&&!todayComp)statusEl.textContent=`Progress: ${dc}/${todayExercises.length||0} øvelser markeret`;
});
l.appendChild(li);
});
}
function rPlan(){
let p=$("plan-accordion");
p.innerHTML="";
rTem();
s.split.forEach((d,i)=>{
let c=C("div","card");
let h=C("div","card-header"),t=C("div","card-title");
let sn=C("span");
sn.textContent=d;
t.appendChild(sn);
let ap=s.a[d];
if(ap&&s.t[ap]){let lb=C("span","template-label");lb.textContent=` [${ap}]`;t.appendChild(lb);}
let rb=C("button","icon-btn rename-btn");
rb.title="Omdøb dag";
rb.textContent="✎";
rb.addEventListener("click",e=>{e.stopPropagation();openRenameModal(i,d);});
t.appendChild(rb);
h.appendChild(t);
let act=C("div","card-actions");
let ml=C("button","icon-btn");
ml.textContent="◀";
ml.title="Flyt tilbage";
ml.addEventListener("click",e=>{e.stopPropagation();mv(i,-1);});
let mr=C("button","icon-btn");
mr.textContent="▶";
mr.title="Flyt frem";
mr.addEventListener("click",e=>{e.stopPropagation();mv(i,1);});
let tog=C("button","icon-btn");
act.append(ml,mr,tog);
h.appendChild(act);
c.appendChild(h);
let b=C("div","card-body");
let sub=C("div","card-subtitle");
sub.textContent="Træk for at omarrangere øvelser. På mobil kan du også bruge ◀/▶ pr. øvelse.";
b.appendChild(sub);
let tr=C("div","template-row");
let lab=C("label");
lab.textContent="Skabelon (anvendes med det samme): ";
lab.htmlFor=`templ-${i}`;
tr.appendChild(lab);
let sel=C("select");
sel.id=`templ-${i}`;
let none=C("option");
none.value="";
none.textContent="Ingen";
sel.appendChild(none);
Object.keys(s.t).forEach(tn=>{let o=C("option");o.value=tn;o.textContent=`${tn} (${(s.t[tn]||[]).length})`;sel.appendChild(o);});
sel.value=s.a[d]||"";
sel.addEventListener("change",()=>{if(sel.value)applyT(d,sel.value);else{delete s.a[d];save();rPlan();rToday();}});
tr.appendChild(sel);
b.appendChild(tr);
let ul=C("ul","exercise-list");
ul.dataset.dayName=d;
let exs=s.w[d]||[];
if(exs.length){
exs.forEach((e,j)=>{
let row=liMake(d,e,j);
row.style.flexDirection='column';
row.style.alignItems='stretch';
let ex=exRef(e),goal=getProgressionGoal(ex),key=exId(ex),hist=findExerciseHistory(key,null);
let trendWrap=C('div','card-subtitle');
trendWrap.style.margin='0.35rem 0 0';
let outcomes=hist.slice(-4).map(x=>x.log).reduce((acc,log,idx,arr)=>{if(idx===0)return acc;let prev=arr[idx-1];let st=metricsDeltaStatus(getExerciseLogMetric(log,goal.primaryMetric),getExerciseLogMetric(prev,goal.primaryMetric),0.1);acc.push(st==='up'?'↑':(st==='down'?'↓':'→'));return acc;},[]).slice(-3);
trendWrap.textContent=`Trend: ${outcomes.length?outcomes.join(' '):'ingen historik'}`;
let goalRow=C('div');
goalRow.className='template-row';
goalRow.style.margin='0.35rem 0 0';
let minInp=C('input','exercise-progress-input');minInp.type='number';minInp.min='1';minInp.step='1';minInp.value=goal.repRangeMin;
let maxInp=C('input','exercise-progress-input');maxInp.type='number';maxInp.min='1';maxInp.step='1';maxInp.value=goal.repRangeMax;
let incInp=C('input','exercise-progress-input');incInp.type='number';incInp.min='0.5';incInp.step='0.5';incInp.value=goal.incrementKg;
let metricSel=C('select');
['topSet','e1RM','volume'].forEach(v=>{let o=C('option');o.value=v;o.textContent=v;metricSel.appendChild(o);});
metricSel.value=goal.primaryMetric;
let commitGoal=()=>{s.pg[key]=normalizeProgressionGoal({repRangeMin:parseInt(minInp.value,10),repRangeMax:parseInt(maxInp.value,10),incrementKg:parseFloat(incInp.value),primaryMetric:metricSel.value},ex);save();trendWrap.textContent=`Trend: ${outcomes.length?outcomes.join(' '):'ingen historik'}`;};
[minInp,maxInp,incInp].forEach(inp=>inp.addEventListener('change',commitGoal));
metricSel.addEventListener('change',commitGoal);
goalRow.append(C('span','card-subtitle'),minInp,maxInp,incInp,metricSel);
goalRow.firstChild.textContent='Mål';
row.append(trendWrap,goalRow);
ul.appendChild(row);
});
}else{let li=C("li","exercise-item");li.textContent="Ingen øvelser endnu.";ul.appendChild(li);}
b.appendChild(ul);
let ir=C("div","exercise-input-row");
let ab=C("button","primary-btn");
ab.textContent="➕ Tilføj øvelse";
ab.addEventListener("click",()=>{openAddExerciseModal(d);});
ir.appendChild(ab);
b.appendChild(ir);
let nl=C("div","card-subtitle");
nl.textContent="Noter til dagen (valgfrit):";
b.appendChild(nl);
let ta=C("textarea","notes-textarea");
ta.value=s.n[d]||"";
ta.addEventListener("input",()=>{s.n[d]=ta.value;if(notesSaveTimers[d])clearTimeout(notesSaveTimers[d]);notesSaveTimers[d]=setTimeout(()=>{save();delete notesSaveTimers[d];},NOTES_SAVE_DEBOUNCE_MS);});
ta.addEventListener("blur",()=>{if(notesSaveTimers[d]){clearTimeout(notesSaveTimers[d]);delete notesSaveTimers[d];}save();});
b.appendChild(ta);
c.appendChild(b);
let col=!!(s.meta&&s.meta.ui&&s.meta.ui.planCollapsed&&s.meta.ui.planCollapsed[d]);
b.classList.toggle("collapsed",col);
tog.textContent=col?"▲":"▼";
h.addEventListener("click",()=>{col=!col;b.classList.toggle("collapsed",col);tog.textContent=col?"▲":"▼";s.meta.ui.planCollapsed[d]=col;save({sync:false});});
p.appendChild(c);
});
setupDnD();
}
function rTem(){let m=$("template-manager");if(!m)return;m.innerHTML="";let c=C("div","card"),h=C("h2");h.textContent="Skabeloner";c.appendChild(h);let ul=C("ul","template-list");Object.keys(s.t).forEach(tn=>{let li=C("li","template-item"),sp=C("span");let exerciseCount=(s.t[tn]||[]).length;let usedCount=Object.values(s.a||{}).filter(v=>v===tn).length;sp.textContent=`${tn} · ${exerciseCount} øvelser${usedCount?` · bruges på ${usedCount} dag(e)`:''}`;li.appendChild(sp);let ed=C("button","icon-btn");ed.textContent="✎";ed.title="Rediger";ed.addEventListener("click",()=>{openTemplateModal('edit',tn);});li.appendChild(ed);let del=C("button","icon-btn");del.textContent="✕";del.title="Slet";del.addEventListener("click",()=>{showConfirm('Slet skabelon',`Slet '${tn}'?`,()=>{delete s.t[tn];for(let d in s.a)if(s.a[d]===tn)delete s.a[d];save();rTem();rPlan();});});li.appendChild(del);ul.appendChild(li);});c.appendChild(ul);let ab=C("button","primary-btn full-width");ab.textContent="Opret ny skabelon";ab.addEventListener("click",()=>{openTemplateModal('create',null);});c.appendChild(ab);m.appendChild(c);} 
function liMake(d,n,j){let li=C("li","exercise-item");li.draggable=true;li.dataset.index=j;li.dataset.dayName=d;let nm=exName(n);let sp=C("span","exercise-name");sp.textContent=nm;let ac=C("div","exercise-actions");let moveUp=C("button","icon-btn");moveUp.textContent="◀";moveUp.title="Flyt øvelse op";moveUp.addEventListener("click",()=>{moveExercise(d,j,-1);});let moveDown=C("button","icon-btn");moveDown.textContent="▶";moveDown.title="Flyt øvelse ned";moveDown.addEventListener("click",()=>{moveExercise(d,j,1);});let dh=C("button","icon-btn");dh.textContent="↕";dh.title="Træk";let db=C("button","icon-btn");db.textContent="✕";db.title="Slet";db.addEventListener("click",()=>{showConfirm('Slet øvelse',`Slet '${nm}'?`,()=>{del(d,j);rPlan();rToday();});});ac.append(moveUp,moveDown,dh,db);li.append(sp,ac);return li;} 
let dragSrc=null;function setupDnD(){document.querySelectorAll(".exercise-item[draggable='true']").forEach(it=>{it.addEventListener("dragstart",hDS);it.addEventListener("dragend",hDE);});document.querySelectorAll(".exercise-list").forEach(l=>{l.addEventListener("dragover",hDO);l.addEventListener("drop",hDrop);});}
function hDS(e){dragSrc=this;this.classList.add("dragging");e.dataTransfer.effectAllowed="move";}function hDE(){this.classList.remove("dragging");dragSrc=null;}function hDO(e){e.preventDefault();e.dataTransfer.dropEffect="move";const aft=getAfter(this,e.clientY);const dg=document.querySelector(".exercise-item.dragging");if(!dg)return;if(!aft)this.appendChild(dg);else this.insertBefore(dg,aft);}function hDrop(e){e.preventDefault();const d=this.dataset.dayName;if(!d)return;let arr=[];this.querySelectorAll(".exercise-item[draggable='true']").forEach(li=>{arr.push(s.w[d][parseInt(li.dataset.index,10)]);});s.w[d]=arr;save();rPlan();rToday();}
function getAfter(c,y){return [...c.querySelectorAll(".exercise-item[draggable='true']:not(.dragging)")].reduce((c,ch)=>{let b=ch.getBoundingClientRect(),off=y-b.top-b.height/2;return(off<0&&off>c.off)?{off,el:ch}:c;},{off:-1e9,el:null}).el;}function add(d,e){if(!d)return;if(!s.w||typeof s.w!="object")s.w={};if(!Array.isArray(s.w[d]))s.w[d]=[];s.w[d].push(exRef(e));save();}function del(d,i){s.w[d].splice(i,1);save();}function moveExercise(dayName,index,delta){if(!Array.isArray(s.w[dayName]))return;let next=index+delta;if(next<0||next>=s.w[dayName].length)return;[s.w[dayName][index],s.w[dayName][next]]=[s.w[dayName][next],s.w[dayName][index]];save();rPlan();rToday();}function rename(i,n){let o=s.split[i];if(n===o)return;if(s.split.includes(n)){alert("Navn findes");return;}s.split[i]=n;s.w[n]=s.w[o]||[];delete s.w[o];s.n[n]=s.n[o]||"";delete s.n[o];for(let k in s.cd)if(s.cd[k].dayName===o)s.cd[k].dayName=n;if(s.a[o]){s.a[n]=s.a[o];delete s.a[o];}save();rPlan();rToday();rCal();}function mv(i,dx){let ni=i+dx;let L=s.split.length;if(ni<0||ni>=L)return;[s.split[i],s.split[ni]]=[s.split[ni],s.split[i]];let cn=getCur();s.ci=s.split.indexOf(cn);save();rPlan();rToday();rCal();}function getCur(){return s.split[s.ci];}function applyT(d,tn){if(!tn||!s.t[tn])return; s.w[d]=(s.w[d]||[]).concat(s.t[tn].map(exRef));s.a[d]=tn;save();if(typeof showSyncToast==='function')showSyncToast(`Skabelon '${tn}' anvendt på ${d}`,'info');rPlan();rToday();}
function daySummaryFromExerciseLogs(exerciseLogs){let dayVolumeKg=0,daySets=0,dayReps=0,completedExerciseCount=0;(exerciseLogs||[]).forEach(log=>{dayVolumeKg+=toNum(log.volumeKg)||0;daySets+=toNum(log.totalSets)||0;dayReps+=toNum(log.totalReps)||0;if(log.done)completedExerciseCount++;});return{dayVolumeKg:Math.round(dayVolumeKg*100)/100,daySets,dayReps,completedExerciseCount};}
function buildCompletedDayEntry(dateIso,dayName){let ex=getDateExercises(dateIso,dayName),dayLog=getDayLog(dateIso,dayName);aggregateDayLog(dateIso,dayName);let exerciseLogs=ex.map((entry,idx)=>{let entryKey=occKeyForDateExercise(entry,idx),exerciseKey=exId(entry),p=normalizeExerciseProgress(dayLog.exercises&&dayLog.exercises[entryKey]?dayLog.exercises[entryKey]:{done:false,reps:0,kilos:0,sets:[{reps:0,kilos:0,isWarmup:false}]},entry);let history=findExerciseHistory(exerciseKey,dateIso);let prevBestLoad=history.reduce((m,h)=>Math.max(m,(h.log.topSet&&h.log.topSet.kilos)||h.log.kilos||0),0);let prevBestE1rm=history.reduce((m,h)=>Math.max(m,toNum(h.log.estimated1RM)||0),0);let prevBestVol=history.reduce((m,h)=>Math.max(m,toNum(h.log.volumeKg)||0),0);let sameLoadBestReps=history.reduce((m,h)=>{let top=(h.log.topSet||{kilos:h.log.kilos||0,reps:h.log.reps||0});if((top.kilos||0)!==(p.topSet&&p.topSet.kilos||0))return m;return Math.max(m,top.reps||0);},0);let top=p.topSet||{reps:p.reps||0,kilos:p.kilos||0};return{id:exerciseKey,exerciseKey,occurrenceKey:entryKey,name:exName(entry),exerciseId:entry.exerciseId||null,bodyParts:entry.bodyParts||[],targetMuscles:entry.targetMuscles||[],equipments:entry.equipments||[],done:!!p.done,reps:p.reps??0,kilos:p.kilos??0,topSet:top,sets:p.sets||[],volumeKg:p.volumeKg||0,totalReps:p.totalReps||0,totalSets:p.totalSets||0,estimated1RM:p.estimated1RM||0,exerciseNotes:p.exerciseNotes||'',painFlag:!!p.painFlag,isPR_load:(top.kilos||0)>prevBestLoad,isPR_repsAtLoad:(top.reps||0)>sameLoadBestReps,isPR_e1RM:(p.estimated1RM||0)>prevBestE1rm,isPR_volume:(p.volumeKg||0)>prevBestVol};});return{dayName:dayName,exercises:ex.map(exName),exerciseLogs:exerciseLogs,notes:s.n[dayName]||"",completedAt:new Date().toISOString(),summary:daySummaryFromExerciseLogs(exerciseLogs)};}
function recomputePRFlagsFrom(startDateIso){let dates=Object.keys(s.cd||{}).filter(k=>s.cd[k]&&typeof s.cd[k]==='object').sort();let bestByExercise={};dates.forEach(dateIso=>{let day=s.cd[dateIso];if(!day||!Array.isArray(day.exerciseLogs))return;day.exerciseLogs=day.exerciseLogs.map((log,idx)=>{let exerciseKey=log.exerciseKey||log.id||`legacy:${log.name||idx}`;let normalized=normalizeExerciseProgress(log,null);let top=normalized.topSet||{reps:normalized.reps||0,kilos:normalized.kilos||0};let state=bestByExercise[exerciseKey]||{bestLoad:0,bestE1rm:0,bestVol:0,repsAtLoad:{}};let load=toNum(top.kilos)||0;let reps=toNum(top.reps)||0;let e1rm=toNum(normalized.estimated1RM)||0;let vol=toNum(normalized.volumeKg)||0;let next={...log,id:exerciseKey,exerciseKey,name:log.name||'Ukendt øvelse',reps:normalized.reps,kilos:normalized.kilos,topSet:top,sets:normalized.sets,volumeKg:normalized.volumeKg,totalReps:normalized.totalReps,totalSets:normalized.totalSets,estimated1RM:normalized.estimated1RM,done:!!normalized.done};if(!startDateIso||dateIso>=startDateIso){next.isPR_load=load>state.bestLoad;next.isPR_repsAtLoad=reps>(toNum(state.repsAtLoad[load])||0);next.isPR_e1RM=e1rm>state.bestE1rm;next.isPR_volume=vol>state.bestVol;}bestByExercise[exerciseKey]={bestLoad:Math.max(state.bestLoad,load),bestE1rm:Math.max(state.bestE1rm,e1rm),bestVol:Math.max(state.bestVol,vol),repsAtLoad:{...state.repsAtLoad,[load]:Math.max(toNum(state.repsAtLoad[load])||0,reps)}};return next;});day.summary=daySummaryFromExerciseLogs(day.exerciseLogs);});}
function toggleCompletionForDate(dateIso,opts={}){let preserveAnchor=!!opts.preserveAnchor;let reopenModal=!!opts.reopenModal;flushProgressSave();let dayName=nameFor(dateIso);if(s.cd&&s.cd[dateIso]){delete s.cd[dateIso];}else{s.cd[dateIso]=buildCompletedDayEntry(dateIso,dayName);}recomputePRFlagsFrom(dateIso);if(!preserveAnchor)s.last=latestCompletedDate();save();rToday();rCal();if(reopenModal)openModal(dateIso);}
function mark(){toggleCompletionForDate(iso(new Date()),{preserveAnchor:false});}
function isFutureDateIso(dateIso){return dateIso>iso(new Date());}
function applyDraftProgressForDate(dateIso,dayName,exercises,draftProgress){let dayLog=getDayLog(dateIso,dayName);if(!dayLog.exercises||typeof dayLog.exercises!=='object')dayLog.exercises={};exercises.forEach((entry,idx)=>{let key=occKeyForDateExercise(entry,idx);let draft=draftProgress[key]||normalizeExerciseProgress({done:false,reps:0,kilos:0,sets:[{reps:0,kilos:0,isWarmup:false}]},entry);dayLog.exercises[key]=normalizeExerciseProgress(draft,entry);});aggregateDayLog(dateIso,dayName);}
let cur=new Date();function rCal(m){if(m)cur=m;let g=$("calendar-grid"),l=$("calendar-month-label"),w=$("calendar-weekly-summary");let y=cur.getFullYear(),mon=cur.getMonth();l.textContent=cur.toLocaleString('default',{month:'long',year:'numeric'});g.innerHTML='';let nowIso=iso(new Date());let weekCurrent=getWeekSummary(nowIso);let prevKey=getPreviousWeekKey(weekCurrent.weekKey);let weekPrev={totalVolumeKg:0,totalSets:0,totalReps:0,sessions:0,prCount:0};Object.keys(s.cd||{}).forEach(dateIso=>{if(getIsoWeekKey(dateIso)!==prevKey)return;let day=s.cd[dateIso];weekPrev.sessions++;(day.exerciseLogs||[]).forEach(log=>{weekPrev.totalVolumeKg+=(toNum(log.volumeKg)||0);weekPrev.totalSets+=(toNum(log.totalSets)||0);weekPrev.totalReps+=(toNum(log.totalReps)||0);if(log.isPR_load||log.isPR_repsAtLoad||log.isPR_e1RM||log.isPR_volume)weekPrev.prCount++;});});if(w){let delta=Math.round((weekCurrent.totalVolumeKg-weekPrev.totalVolumeKg)*100)/100;let block=getBlockSummary(nowIso);w.innerHTML='';let line1=C('div','calendar-summary-line');line1.textContent=`Uge ${weekCurrent.weekKey}: ${weekCurrent.sessions} pas · ${weekCurrent.totalVolumeKg} kg vol`;let line2=C('div','calendar-summary-line');line2.textContent=`PR: ${weekCurrent.prCount} · Δ vol: ${delta>=0?'+':''}${delta} · Block ${block.blockKey}: ${block.sessions} pas / ${block.totalVolumeKg} kg`;let legend=C('div','calendar-legend');let lgDone=C('span','calendar-legend-item');lgDone.textContent='● Gennemført';let lgPr=C('span','calendar-legend-item');lgPr.textContent='● PR dag';let lgReg=C('span','calendar-legend-item');lgReg.textContent='● Regression';lgDone.style.color='#16a34a';lgPr.style.color='#2563eb';lgReg.style.color='#dc2626';legend.append(lgDone,lgPr,lgReg);w.append(line1,line2,legend);}
['Søn','Man','Tir','Ons','Tor','Fre','Lør'].forEach(wd=>{let h=C('div','calendar-cell');h.style.fontWeight='700';h.style.textAlign='center';h.textContent=wd;g.appendChild(h);});let f=new Date(y,mon,1),sd=f.getDay(),dim=new Date(y,mon+1,0).getDate();for(let i=0;i<sd;i++){let c=C('div','calendar-cell');c.classList.add('empty');g.appendChild(c);}for(let d=1;d<=dim;d++){let dt=new Date(y,mon,d),isoD=iso(dt),dn=nameFor(isoD),comp=s.cd&&s.cd[isoD];let c=C('button','calendar-cell');c.type='button';if(dt>new Date())c.classList.add('future');let top=C('div');top.style.display='flex';top.style.alignItems='center';let num=C('div','calendar-day-num');num.textContent=d;let ind=C('div');if(comp)ind.className='completed-indicator';if(comp&&Array.isArray(comp.exerciseLogs)){let hasPr=comp.exerciseLogs.some(log=>log.isPR_load||log.isPR_repsAtLoad||log.isPR_e1RM||log.isPR_volume);let hasReg=comp.exerciseLogs.some(log=>{let hist=findExerciseHistory(log.exerciseKey||log.id,isoD);if(!hist.length)return false;let prev=hist[hist.length-1].log;return metricsDeltaStatus(getExerciseLogMetric(log,'topSet'),getExerciseLogMetric(prev,'topSet'),0.1)==='down';});if(hasPr)ind.style.background='#2563eb';if(hasReg){ind.style.background='#dc2626';ind.style.boxShadow='0 0 0 2px #fecaca';}}
top.append(num,ind);let name=C('div','calendar-day-name');name.textContent=dn;c.append(top,name);c.addEventListener('click',()=>openModal(isoD));g.appendChild(c);} }
function openModal(i){let m=$("day-modal"),t=$("modal-day-title"),me=$("modal-day-meta"),l=$("modal-exercise-list"),no=$("modal-notes"),actions=$("modal-day-actions");if(!m)return;let dn=nameFor(i);if(!actions&&no&&no.parentNode){actions=C('div','template-row modal-day-actions');actions.id='modal-day-actions';no.parentNode.insertBefore(actions,no.nextSibling);}t.textContent=`${i} — ${dn}`;l.innerHTML='';if(no)no.innerHTML='';if(actions)actions.innerHTML='';let comp=s.cd&&s.cd[i];let isFuture=isFutureDateIso(i);let canRegister=!isFuture;if(comp){let sum=comp.summary||{dayVolumeKg:0,daySets:0,dayReps:0,completedExerciseCount:0};me.textContent=`Gennemført · Vol: ${sum.dayVolumeKg||0} kg · Sæt: ${sum.daySets||0} · Reps: ${sum.dayReps||0}`;if(Array.isArray(comp.exerciseLogs)&&comp.exerciseLogs.length){comp.exerciseLogs.forEach(log=>{let li=C('li','exercise-item');let repTxt=log.reps===null||log.reps===undefined?'—':String(log.reps);let kgTxt=log.kilos===null||log.kilos===undefined?'—':String(log.kilos);let pr=[];if(log.isPR_load)pr.push('PR kg');if(log.isPR_repsAtLoad)pr.push('PR reps');if(log.isPR_e1RM)pr.push('PR e1RM');if(log.isPR_volume)pr.push('PR vol');li.textContent=`${log.done?'✅':'⬜'} ${log.name} · Top: ${kgTxt}kg × ${repTxt} · Vol: ${log.volumeKg||0}${pr.length?` · ${pr.join(', ')}`:''}`;l.appendChild(li);});}else{(comp.exercises||[]).forEach(e=>{let li=C('li','exercise-item');li.textContent=exName(e);l.appendChild(li);});}if(no)no.textContent=comp.notes||'';if(actions&&canRegister){let undoBtn=C('button','danger-btn');undoBtn.textContent='Fortryd registrering';undoBtn.addEventListener('click',()=>{toggleCompletionForDate(i,{preserveAnchor:true,reopenModal:true});});actions.appendChild(undoBtn);}}else{me.textContent=isFuture?'Planlagt (fremtidig dato)':'Planlagt / ikke markeret';let pl=getDateExercises(i,dn);let draftProgress={};if(pl.length===0){let li=C('li','exercise-item');li.textContent='Ingen øvelser planlagt.';l.appendChild(li);}else pl.forEach((entry,idx)=>{let key=occKeyForDateExercise(entry,idx);let current=normalizeExerciseProgress(getExerciseProgress(i,dn,key,entry),entry);draftProgress[key]={...current,sets:[...(current.sets||[{reps:current.reps||0,kilos:current.kilos||0,isWarmup:false}])],topSet:{...(current.topSet||{reps:current.reps||0,kilos:current.kilos||0})}};let li=C('li','exercise-item');let nm=C('div','exercise-name');nm.textContent=exName(entry);let row=C('div','exercise-progress-controls');let doneLbl=C('label','card-subtitle warmup-label');let done=C('input');done.type='checkbox';done.checked=!!current.done;doneLbl.append(done,document.createTextNode('Gennemført'));let reps=C('input','exercise-progress-input');reps.type='number';reps.min='0';reps.step='1';reps.placeholder='Reps';reps.value=current.reps??0;let kilos=C('input','exercise-progress-input');kilos.type='number';kilos.min='0';kilos.step='0.5';kilos.placeholder='Kg';kilos.value=current.kilos??0;let updateDraft=()=>{let repsVal=Math.max(0,Math.round(toNum(reps.value)||0));let kilosVal=Math.max(0,Math.round((toNum(kilos.value)||0)*2)/2);draftProgress[key]={...draftProgress[key],done:done.checked,reps:repsVal,kilos:kilosVal,topSet:{reps:repsVal,kilos:kilosVal},sets:[sanitizeSetEntry({reps:repsVal,kilos:kilosVal,isWarmup:false},0)]};};done.addEventListener('change',updateDraft);reps.addEventListener('change',updateDraft);kilos.addEventListener('change',updateDraft);row.append(doneLbl,reps,kilos);li.append(nm,row);l.appendChild(li);});if(no){let noteLabel=C('div','card-subtitle');noteLabel.textContent='Noter';let notesInput=C('textarea','notes-textarea');notesInput.value=s.n[dn]||'';no.append(noteLabel,notesInput);if(actions&&canRegister&&pl.length){let registerBtn=C('button','primary-btn');registerBtn.textContent='Registrér som gennemført';registerBtn.addEventListener('click',()=>{s.n[dn]=notesInput.value||'';applyDraftProgressForDate(i,dn,pl,draftProgress);toggleCompletionForDate(i,{preserveAnchor:true,reopenModal:true});});actions.appendChild(registerBtn);}}if(actions&&isFuture){let msg=C('div','card-subtitle');msg.textContent='Fremtidige dage kan ikke registreres som gennemført.';actions.appendChild(msg);}}
m.setAttribute('aria-hidden','false');}
function closeModal(){let m=$("day-modal");if(m)m.setAttribute('aria-hidden','true');}
function adminCanAccess(){return typeof authIsAdminAuthorized==='function'&&authIsAdminAuthorized();}
function adminGetQueueInfo(){try{let queue=JSON.parse(localStorage.getItem('_sync_queue')||'[]');if(!Array.isArray(queue))queue=[];let last=queue.length?queue[queue.length-1]:null;let lastAt=last&&last.timestamp?new Date(last.timestamp):null;return{count:queue.length,lastAt:lastAt&&!isNaN(lastAt.getTime())?lastAt.toLocaleString('da-DK'):null};}catch{return{count:0,lastAt:null};}}
let adminUsersState={loaded:false,loading:false,users:[],error:null};
function adminRenderRegisteredUsers(users,statusOverride){let status=$('admin-users-status'),list=$('admin-users-list');if(!status||!list)return;list.innerHTML='';if(statusOverride){status.textContent=statusOverride;}else{status.textContent=`Registrerede brugere: ${users.length}`;}if(!users.length){let li=C('li','exercise-item');li.textContent='Ingen registrerede brugere fundet';list.appendChild(li);return;}users.forEach(user=>{let li=C('li','exercise-item');let title=(user&&typeof user.username==='string'&&user.username.trim())?user.username.trim():'Ukendt bruger';if(user&&typeof user.email==='string'&&user.email.trim()&&user.email.trim()!==title){li.textContent=`${title} (${user.email.trim()})`;}else{li.textContent=title;}list.appendChild(li);});}
async function adminLoadRegisteredUsers(forceRefresh=false){let status=$('admin-users-status'),list=$('admin-users-list');if(!status||!list)return;if(!adminCanAccess()){adminUsersState={loaded:false,loading:false,users:[],error:null};adminRenderRegisteredUsers([], 'Registrerede brugere: utilgængelig uden admin-adgang');return;}if(adminUsersState.loading&&!forceRefresh)return;if(adminUsersState.loaded&&!forceRefresh){adminRenderRegisteredUsers(adminUsersState.users);return;}adminUsersState.loading=true;status.textContent='Registrerede brugere: indlæser...';list.innerHTML='';if(typeof authListRegisteredUsers!=='function'){adminUsersState.loading=false;adminUsersState.loaded=false;adminUsersState.error='authListRegisteredUsers() mangler';adminRenderRegisteredUsers([],`Registrerede brugere: ${adminUsersState.error}`);return;}let result=await authListRegisteredUsers();adminUsersState.loading=false;adminUsersState.loaded=true;if(result&&result.success){adminUsersState.users=Array.isArray(result.users)?result.users:[];adminUsersState.error=null;adminRenderRegisteredUsers(adminUsersState.users);}else{adminUsersState.users=[];adminUsersState.error=result&&result.error?result.error:'Kunne ikke hente registrerede brugere';adminRenderRegisteredUsers([],`Registrerede brugere: ${adminUsersState.error}`);}}
async function adminLoadRegisteredUsers(forceRefresh=false){let status=$('admin-users-status'),list=$('admin-users-list');if(!status||!list)return;if(!adminCanAccess()){adminUsersState={loaded:false,loading:false,users:[],error:null};adminRenderRegisteredUsers([], 'Registrerede brugere: utilgængelig uden admin-adgang');return;}if(adminUsersState.loading&&!forceRefresh)return;if(adminUsersState.loaded&&!forceRefresh){if(adminUsersState.error){adminRenderRegisteredUsers([],`Registrerede brugere: ${adminUsersState.error}`);}else{adminRenderRegisteredUsers(adminUsersState.users);}return;}adminUsersState.loading=true;status.textContent='Registrerede brugere: indlæser...';list.innerHTML='';if(typeof authListRegisteredUsers!=='function'){adminUsersState.loading=false;adminUsersState.loaded=false;adminUsersState.error='authListRegisteredUsers() mangler';adminRenderRegisteredUsers([],`Registrerede brugere: ${adminUsersState.error}`);return;}let result=await authListRegisteredUsers();adminUsersState.loading=false;if(result&&result.success){adminUsersState.loaded=true;adminUsersState.users=Array.isArray(result.users)?result.users:[];adminUsersState.error=null;adminRenderRegisteredUsers(adminUsersState.users);}else{adminUsersState.loaded=true;adminUsersState.users=[];adminUsersState.error=result&&result.error?result.error:'Kunne ikke hente registrerede brugere';adminRenderRegisteredUsers([],`Registrerede brugere: ${adminUsersState.error}`);}}
function updateAdminTabVisibility(){let tabBtn=$('admin-tab-btn');if(!tabBtn)return;let allowed=adminCanAccess();tabBtn.style.display=allowed?'':'none';if(!allowed&&getActiveTab()==='admin'){setActiveTab('today');let todayTab=[...document.querySelectorAll('.tab-button')].find(x=>x.dataset.tab==='today');if(todayTab)todayTab.click();}}
function rAdmin(forceUsersRefresh=false){let authStatus=$('admin-auth-status'),syncStatus=$('admin-sync-status'),queueStatus=$('admin-queue-status');if(!authStatus||!syncStatus||!queueStatus)return;let email=typeof authGetUserEmail==='function'?authGetUserEmail():null;let profile=typeof authGetUserProfile==='function'?authGetUserProfile():null;let roles=[];if(profile&&profile.app_metadata&&typeof profile.app_metadata==='object'){if(typeof profile.app_metadata.role==='string')roles.push(profile.app_metadata.role);if(Array.isArray(profile.app_metadata.roles))roles.push(...profile.app_metadata.roles);}roles=[...new Set(roles.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().toLowerCase()))];let allowed=adminCanAccess();authStatus.textContent=`Admin adgang: ${allowed?'JA':'NEJ'} · email: ${email||'ukendt'} · roller: ${roles.length?roles.join(', '):'ingen'}`;let ss=window.__syncDebugStatus||{status:'idle',message:'Ingen sync endnu',at:new Date().toISOString()};let syncAt='';try{syncAt=new Date(ss.at).toLocaleTimeString('da-DK');}catch{}syncStatus.textContent=`Sync status: ${ss.status}${ss.message?` (${ss.message})`:''}${syncAt?` @ ${syncAt}`:''}`;let q=adminGetQueueInfo();queueStatus.textContent=`Offline-kø: ${q.count} ændring(er)${q.lastAt?` · seneste ${q.lastAt}`:''}`;adminLoadRegisteredUsers(forceUsersRefresh);}
async function adminProcessQueue(){if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}if(typeof syncProcessOfflineQueue==='function')await syncProcessOfflineQueue();rAdmin();}
async function adminClearQueue(){if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}if(typeof syncClearOfflineQueue==='function')await syncClearOfflineQueue();showSyncToast('Offline-kø ryddet','info');rAdmin();}
async function adminForceSyncNow(){if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}if(typeof syncSaveState==='function'){await syncSaveState(s);rAdmin();}}
async function adminImportBackup(file){if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}if(!file||typeof syncImportState!=='function')return;let ok=await syncImportState(file);if(ok&&typeof syncFetchState==='function'){let state=await syncFetchState();if(state){load(state);rToday();rPlan();rCal(new Date());}}rAdmin();}
function setupTabs(){
	let bs=document.querySelectorAll(".tab-button"),cs=document.querySelectorAll(".tab-content");
	if(!bs.length||!cs.length){console.warn('[setupTabs] Missing tab buttons or tab content containers');return;}
	let activateTab=(tab)=>{let tabEl=$("tab-"+tab);if(!tabEl)return;if(tab==='admin'&&!adminCanAccess())return;bs.forEach(x=>x.classList.remove("active"));cs.forEach(x=>x.classList.remove("active"));let targetBtn=[...bs].find(x=>x.dataset.tab===tab);if(targetBtn)targetBtn.classList.add("active");tabEl.classList.add("active");if(tab==='admin')rAdmin();};
	let preferred=getActiveTab();
	if(preferred==='admin'&&!adminCanAccess())preferred='today';
	if(preferred&&$("tab-"+preferred)){activateTab(preferred);}else{let initial=[...bs].find(x=>x.classList.contains('active'));if(initial)setActiveTab(initial.dataset.tab);} 
	bs.forEach(b=>{
		if(b.dataset.boundClick==='1')return;
		b.dataset.boundClick='1';
		b.addEventListener("click",()=>{let t=b.dataset.tab;let tabEl=$("tab-"+t);if(!tabEl){console.warn(`[setupTabs] Missing tab container: tab-${t}`);return;}if(t==='admin'&&!adminCanAccess()){showSyncToast('Ingen admin-adgang for denne konto','warning');return;}activateTab(t);setActiveTab(t);});
	});
}
function ensureModalShell(id,onClose){let existing=$(id);if(existing)return existing;let m=C('div');m.id=id;m.className='modal';m.setAttribute('aria-hidden','true');let bd=C('div','modal-backdrop');bd.addEventListener('click',onClose);m.appendChild(bd);let mc=C('div','modal-content');mc.setAttribute('role','dialog');mc.setAttribute('aria-modal','true');let cb=C('button','icon-btn');cb.textContent='✕';cb.title='Luk';cb.addEventListener('click',onClose);mc.appendChild(cb);m.appendChild(mc);document.body.appendChild(m);return m;}
function setupModals(){ensureModalShell('rename-modal',()=>closeMod('rename-modal'));ensureModalShell('template-modal',()=>closeMod('template-modal'));ensureModalShell('add-ex-modal',()=>closeMod('add-ex-modal'));ensureModalShell('confirm-modal',()=>closeMod('confirm-modal'));}
function isLocalDevHost(){let h=window.location&&window.location.hostname;return h==='127.0.0.1'||h==='localhost';}
function renderDevDebugPanel(){let panel=$('dev-debug-panel');if(!panel)return;let authEl=$('dev-debug-auth');let syncEl=$('dev-debug-sync');let userId=typeof authGetUserId==='function'?authGetUserId():null;let localBypass=typeof authIsLocalDevBypassEnabled==='function'&&authIsLocalDevBypassEnabled();if(authEl)authEl.textContent=`auth user: ${userId|| (localBypass?'local-bypass':'none')}`;let ss=window.__syncDebugStatus||{status:'idle',message:'Ingen sync endnu',at:new Date().toISOString()};let tm='';try{tm=new Date(ss.at).toLocaleTimeString('da-DK');}catch{}if(syncEl)syncEl.textContent=`sync: ${ss.status}${ss.message?` (${ss.message})`:''}${tm?` @ ${tm}`:''}`;}
function setupDevDebugPanel(){if(!isLocalDevHost())return;let panel=$('dev-debug-panel');if(!panel){panel=C('div','card');panel.id='dev-debug-panel';panel.style.position='fixed';panel.style.bottom='1rem';panel.style.right='1rem';panel.style.zIndex='3500';panel.style.minWidth='260px';panel.style.padding='0.6rem';let t=C('div','card-subtitle');t.textContent='Dev Debug';let a=C('div','card-subtitle');a.id='dev-debug-auth';let sy=C('div','card-subtitle');sy.id='dev-debug-sync';panel.appendChild(t);panel.appendChild(a);panel.appendChild(sy);document.body.appendChild(panel);}if(panel.dataset.boundSync!=='1'){panel.dataset.boundSync='1';window.addEventListener('sync-status',()=>{renderDevDebugPanel();});}renderDevDebugPanel();}
function bindOnce(el,key,ev,fn){if(!el){console.warn(`[initApp] Missing required element for binding: ${key}`);return false;}let f=`bound${key}`;if(el.dataset[f]==='1')return true;el.dataset[f]='1';el.addEventListener(ev,fn);return true;}
function wireStaticHandlers(){
	bindOnce($("prev-day"),'PrevDay','click',()=>{s.ci=(s.ci-1+s.split.length)%s.split.length;save({sync:false});rToday();});
	bindOnce($("next-day"),'NextDay','click',()=>{s.ci=(s.ci+1)%s.split.length;save({sync:false});rToday();});
	bindOnce($("mark-today"),'MarkToday','click',mark);
	bindOnce($("calendar-prev"),'CalendarPrev','click',()=>{let d=new Date(cur);d.setMonth(d.getMonth()-1);rCal(d);});
	bindOnce($("calendar-next"),'CalendarNext','click',()=>{let d=new Date(cur);d.setMonth(d.getMonth()+1);rCal(d);});
	bindOnce($("modal-close"),'DayModalClose','click',closeModal);
	bindOnce($("modal-backdrop"),'DayModalBackdrop','click',closeModal);
	bindOnce($("signup-btn"),'SignupBtn','click',()=>{if(typeof showAuthModal==='function')showAuthModal('signup');else console.warn('[initApp] showAuthModal() is not available');});
	bindOnce($("logout-btn"),'LogoutBtn','click',()=>{if(typeof authLogout==='function')authLogout();else console.warn('[initApp] authLogout() is not available');});
	bindOnce($("admin-refresh"),'AdminRefresh','click',()=>{rAdmin(true);});
	bindOnce($("admin-process-queue"),'AdminProcessQueue','click',()=>{adminProcessQueue();});
	bindOnce($("admin-clear-queue"),'AdminClearQueue','click',()=>{adminClearQueue();});
	bindOnce($("admin-force-sync"),'AdminForceSync','click',()=>{adminForceSyncNow();});
	bindOnce($("admin-export"),'AdminExport','click',()=>{if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}if(typeof syncExportState==='function')syncExportState(s);});
	bindOnce($("admin-import-btn"),'AdminImportBtn','click',()=>{if(!adminCanAccess()){showSyncToast('Ingen admin-adgang','error');return;}let inp=$("admin-import-file");if(inp)inp.click();});
	bindOnce($("admin-import-file"),'AdminImportFile','change',async(e)=>{let file=e&&e.target&&e.target.files&&e.target.files[0]?e.target.files[0]:null;await adminImportBackup(file);if(e&&e.target)e.target.value='';});
}
async function initApp(opts={}){try{if(!opts.skipLoad)load();updateAdminTabVisibility();setupTabs();setupModals();setupDevDebugPanel();wireStaticHandlers();rToday();rPlan();rCal(new Date());rAdmin();if(document.body&&document.body.dataset.boundAdminSync!=='1'){document.body.dataset.boundAdminSync='1';window.addEventListener('sync-status',()=>{rAdmin();});}renderDevDebugPanel();}catch(err){console.error('[initApp] Initialization failed:',err);}}
document.addEventListener("DOMContentLoaded",async ()=>{try{let isLoggedIn=true;try{if(typeof authInit==='function'){isLoggedIn=await authInit();}else{console.warn('[startup] authInit() is not defined; continuing without auth gate');}}catch(err){console.error('[startup] authInit() failed:',err);isLoggedIn=false;}let backendState=null;if(isLoggedIn){try{if(typeof syncInit==='function'){backendState=await syncInit();}}catch(err){console.error('[startup] syncInit() failed; using local state:',err);}}else{console.warn('[startup] Running in logged-out mode; backend sync disabled until login');}if(backendState){load(backendState);await initApp({skipLoad:true});}else{await initApp();}}catch(err){console.error('[startup] Fatal bootstrap error:',err);}});