/* Bitácora V29: registros locales; datos observados, nunca dosis recomendadas */
(function(){
'use strict';
var KEY='diego.v29.bitacora', TIMERKEY='diego.v29.recheckAt', entries=[];
try{var old=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(old))entries=old.filter(function(x){return x&&typeof x==='object'&&Number.isFinite(x.t);});}catch(e){}
var $=function(id){return document.getElementById(id);};
var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});};
var fmt=function(n){return n==null||!Number.isFinite(+n)?'—':(+n).toLocaleString('es-CL',{maximumFractionDigits:2});};
var num=function(x){if(x==null||String(x).trim()==='')return null;var n=Number(String(x).replace(',','.'));return Number.isFinite(n)?n:null;};
var savedSnapshot=entries.map(function(e){return JSON.parse(JSON.stringify(e));});
var save=function(){if(window.DIEGO_FAMILY_READ_ONLY){entries=savedSnapshot.map(function(e){return JSON.parse(JSON.stringify(e));});render();alert('Esta cuenta tiene permiso de solo lectura. Pide acceso de edición para añadir o cambiar registros.');return false;}try{
  localStorage.setItem(KEY,JSON.stringify(entries));
  var old=new Map(savedSnapshot.map(function(e){return [e.id,JSON.stringify(e)];}));
  var now=new Map(entries.map(function(e){return [e.id,JSON.stringify(e)];}));
  var changed=entries.filter(function(e){return old.get(e.id)!==JSON.stringify(e);});
  var removed=savedSnapshot.filter(function(e){return !now.has(e.id);}).map(function(e){return e.id;});
  savedSnapshot=entries.map(function(e){return JSON.parse(JSON.stringify(e));});
  if(changed.length||removed.length)window.dispatchEvent(new CustomEvent('diego-bitacora-changed',{detail:{changed:changed,removed:removed}}));
  return true;
}catch(e){alert('No se pudo guardar. Revisa el espacio disponible y exporta una copia.');return false;}};
var localDate=function(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dd;};
var localStamp=function(d){return localDate(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
var dateOnly=function(ts){return localDate(new Date(ts));};
var dt=function(ts){return new Date(ts).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});};
var bridge=function(){return window.diegoBitacoraBridge||null;};
var selected=localDate(new Date()),month=new Date().getMonth(),year=new Date().getFullYear();
var timerId=null;
// Importar una sola vez el historial antiguo, sin borrar ni alterar la fuente.
try {
 if(localStorage.getItem('diego.v29.legacyImported')!=='1'){
   var legacy=JSON.parse(localStorage.getItem('diegoHistorial')||'[]');
   if(Array.isArray(legacy)) legacy.forEach(function(h){
     if(!h||!Number.isFinite(h.t)||entries.some(function(e){return e.id==='legacy-'+h.t;}))return;
     var names={Desayuno:'desayuno',Almuerzo:'almuerzo',Once:'once',Cena:'cena','Colación':'colacion'};
     entries.push({id:'legacy-'+h.t,type:'meal',t:h.t,mealId:names[h.meal]||null,mealName:h.meal||'Comida',glucose:Number.isFinite(+h.g)?+h.g:null,carbs:Number.isFinite(+h.c)?+h.c:null,given:Number.isFinite(+h.ap)?+h.ap:null,ratio:h.ratio||null,calculatedDose:Number.isFinite(+h.dose)?+h.dose:null,foods:[],note:'Importado del historial anterior. Datos originales conservados.'});
   });
   localStorage.setItem(KEY,JSON.stringify(entries));localStorage.setItem('diego.v29.legacyImported','1');
 }
}catch(e){}
var types={meal:'🍽️ Comida',glucose:'🩸 Glucosa',low:'🧃 Hipoglucemia',prevent:'🟡 Descenso preventivo',exercise:'⚽ Ejercicio',basal:'💉 Insulina basal',other:'📝 Otro registro'};
var foods=['Agua con azúcar','Jugo','Coca-Cola normal','Frugelé','Glucosa','Plátano','Pan','Yogur','Otro alimento'];
function download(name,content,mime){var blob=new Blob(['\ufeff',content],{type:mime||'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);}
function fld(id,label,type,value,opts){if(type==='select')return '<div class="bt-field"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+opts.map(function(v){var val=Array.isArray(v)?v[0]:v,l=Array.isArray(v)?v[1]:v;return '<option value="'+esc(val)+'"'+(String(val)===String(value)?' selected':'')+'>'+esc(l)+'</option>';}).join('')+'</select></div>';
return '<div class="bt-field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" '+(type==='number'?'inputmode="decimal" step="any" min="0"':'')+' value="'+esc(value==null?'':value)+'"></div>';}
function read(id){return $(id)?$(id).value:'';}
function optInt(id){return num(read(id));}
function mealCtx(){return bridge()&&bridge().context?bridge().context():{};}
function showForm(type,existing){var edit=!!existing,c=type==='meal'?mealCtx():{},n=new Date(),v=existing||{},t=v.t?localStamp(new Date(v.t)):localStamp(n),html='';
html+='<form id="btForm"><div class="bt-fields">'+fld('btWhen','Fecha y hora','datetime-local',t);
if(type==='meal'){
  html+=fld('btMeal','Comida','select',v.mealId||c.mealId||'desayuno',[['desayuno','Desayuno'],['colacion','Colación'],['almuerzo','Almuerzo'],['once','Once'],['cena','Cena']]);
  html+=fld('btCarbs','HC realmente consumidos (g)','number',v.carbs!=null?v.carbs:c.carbs);
  html+=fld('btGlucose','Glucosa antes (sensor, mg/dL)','number',v.glucose!=null?v.glucose:c.glucose);
  html+=fld('btCapillary','Accu-Chek antes (opcional)','number',v.capillary);
  html+=fld('btTrend','Tendencia','select',v.trend||'',[['','No registrada'],'↑↑','↑','↗','→','↘','↓','↓↓']);
  html+=fld('btGiven','Insulina realmente aplicada (U; opcional)','number',v.given);
  html+=fld('btInjection','Hora de insulina rápida','time',v.injection||'');
  html+=fld('btMealStart','Inicio de comida','time',v.mealStart||'');
  var preview=Array.isArray(v.foods)?v.foods:(c.foods||[]);
  html+='<div class="bt-field bt-wide"><label>Alimentos del plato (copiados automáticamente)</label><div class="bt-card" style="margin:0">'+(preview.length?preview.map(function(f){return '<div class="bt-small">'+esc(f.name)+' · '+fmt(f.quantity)+' '+(f.mode==='u'?'unidad(es)':'g')+' · '+fmt(f.hc)+' g HC</div>';}).join(''):'<span class="bt-small">No hay alimentos en el plato. Puedes registrar los HC manualmente.</span>')+'</div></div>';
  html+='<div class="bt-field bt-wide"><div class="bt-small"><b>Ratio registrado:</b> '+(edit?(v.ratio!=null?'1:'+v.ratio:'no registrado'):(c.ratio==null?'Colación: sin insulina':'1:'+c.ratio))+' · <b>Dosis de fórmula:</b> '+fmt(v.calculatedDose!=null?v.calculatedDose:c.calculatedDose)+' U. Esta cifra no es insulina administrada ni recomendación.</div></div>';
  html+='<div class="bt-field bt-wide"><b style="font-size:13px">Controles posteriores (todos opcionales)</b></div>';
  [30,60,90,120,180].forEach(function(m){html+=fld('btPost'+m,'Glucosa +'+m+' min (mg/dL)','number',v['post'+m]);});
}else if(type==='glucose'||type==='low'||type==='prevent'){
  html+=fld('btGlucose','Glucosa sensor (mg/dL)','number',v.glucose);
  html+=fld('btCapillary','Accu-Chek (opcional)','number',v.capillary);
  html+=fld('btTrend','Tendencia','select',v.trend||'',[['','No registrada'],'↑↑','↑','↗','→','↘','↓','↓↓']);
  if(type==='low'||type==='prevent'){
    html+=fld('btTreat','Qué se utilizó','select',v.treatment||foods[0],foods);
    html+=fld('btAmount','Cantidad (ej. 1 vaso, 3 unidades)','text',v.amount);
    html+=fld('btCarbs','HC del tratamiento (g)','number',v.carbs);
    html+=fld('btRecheck','Glucosa del control posterior (mg/dL)','number',v.recheck);
    html+='<div class="bt-wide"><button type="button" class="btn btn-secondary" id="btStartTimer">⏱️ Recordar control en 15 min</button><p class="bt-small">El aviso funciona mientras la app está abierta. No sustituye el protocolo de tratamiento ni las mediciones.</p></div>';
  }
}else if(type==='exercise'){
  html+=fld('btExercise','Actividad','select',v.exercise||'Fútbol',['Fútbol','Bicicleta','Caminata','Gimnasio','Otro']);
  html+=fld('btDuration','Duración (minutos)','number',v.duration);
  html+=fld('btIntensity','Intensidad','select',v.intensity||'Moderada',['Suave','Moderada','Intensa']);
  html+=fld('btGlucose','Glucosa inicial','number',v.glucose);
  html+=fld('btEnd','Glucosa final','number',v.endGlucose);
}else if(type==='basal'){
  html+=fld('btGiven','Insulina basal realmente aplicada (U)','number',v.given);
  html+=fld('btInjection','Hora de aplicación','time',v.injection||String(t).slice(11));
}else{html+=fld('btGlucose','Glucosa (opcional)','number',v.glucose);}
html+='<div class="bt-field bt-wide"><label for="btNote">Observaciones (opcionales)</label><textarea id="btNote" rows="2" maxlength="350" placeholder="Solo si hace falta">'+esc(v.note||'')+'</textarea></div></div><div class="bt-row"><button class="btn btn-primary" type="submit">'+(edit?'Guardar cambios':'Guardar en bitácora')+'</button><button type="button" class="btn btn-secondary" id="btCancel">Cancelar</button></div></form>';
var dialog=document.createElement('dialog');dialog.className='bt-dialog';dialog.setAttribute('aria-label','Registrar '+(types[type]||'evento'));dialog.innerHTML='<div class="bt-row"><h2 style="font-size:19px;margin:0">'+(edit?'Editar · ':'')+esc(types[type])+'</h2><button type="button" class="bt-pill" id="btClose" aria-label="Cerrar">✕</button></div>'+html;document.body.appendChild(dialog);
function close(){dialog.close();dialog.remove();}
dialog.querySelector('#btClose').onclick=close;dialog.querySelector('#btCancel').onclick=close;dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
dialog.showModal();
if(dialog.querySelector('#btStartTimer')) dialog.querySelector('#btStartTimer').onclick=function(){var future=Date.now()+15*60000;try{localStorage.setItem(TIMERKEY,String(future));}catch(e){}paintTimer();alert('Contador de 15 minutos iniciado. Mantén la app abierta para ver el aviso.');};
dialog.querySelector('#btForm').addEventListener('submit',function(e){e.preventDefault();var time=Date.parse(read('btWhen'));if(!Number.isFinite(time)){alert('Revisa la fecha y hora.');return;}
var x={id:edit?v.id:'bt-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),type:type,t:time,note:read('btNote').trim()};
function n(id,prop){var z=optInt(id);if(z!=null)x[prop||id]=z;}
if(type==='meal'){
  x.mealId=read('btMeal');x.mealName={'desayuno':'Desayuno','colacion':'Colación','almuerzo':'Almuerzo','once':'Once','cena':'Cena'}[x.mealId];
  x.ratio=x.mealId==='colacion'?null:(window.Calc&&typeof window.Calc.ratioForMeal==='function'?window.Calc.ratioForMeal(x.mealId):null);
  x.foods=edit?v.foods||[]:(c.foods||[]);x.calculatedDose=edit?v.calculatedDose:null;
  if(!edit&&c.mealId===x.mealId&&Number.isFinite(c.calculatedDose))x.calculatedDose=c.calculatedDose;
  n('btCarbs','carbs');n('btGlucose','glucose');n('btCapillary','capillary');n('btGiven','given');x.injection=read('btInjection');x.mealStart=read('btMealStart');x.trend=read('btTrend');
  [30,60,90,120,180].forEach(function(m){n('btPost'+m,'post'+m);});
  if(x.mealId==='colacion'){x.ratio=null;x.calculatedDose=null;}
}else if(type==='glucose'||type==='low'||type==='prevent'){
  n('btGlucose','glucose');n('btCapillary','capillary');x.trend=read('btTrend');
  if(type==='low'||type==='prevent'){x.treatment=read('btTreat');x.amount=read('btAmount');n('btCarbs','carbs');n('btRecheck','recheck');}
}else if(type==='exercise'){
 x.exercise=read('btExercise');n('btDuration','duration');x.intensity=read('btIntensity');n('btGlucose','glucose');n('btEnd','endGlucose');
}else if(type==='basal'){n('btGiven','given');x.injection=read('btInjection');}
else n('btGlucose','glucose');
if(x.glucose!=null&&(x.glucose<20||x.glucose>600)){if(!confirm('Glucosa fuera del rango habitual de medición. ¿Confirmas que se registró correctamente?'))return;}
if(edit){var k=entries.findIndex(function(y){return y.id===v.id;});if(k>=0)entries[k]=x;}else entries.push(x);
if(save()){close();selected=dateOnly(time);month=new Date(time).getMonth();year=new Date(time).getFullYear();render();}
});
}
function paintTimer(){var el=$('btTimer');if(!el)return;var target=Number(localStorage.getItem(TIMERKEY)||0),remaining=target-Date.now();if(!target){el.hidden=true;return;}el.hidden=false;
if(remaining<=0){el.innerHTML='<div class="bt-row"><strong>⏱️ Han pasado 15 minutos: corresponde revisar la glucosa según el plan clínico.</strong><button class="bt-pill" id="btStopTimer">Cerrar</button></div>';}
else{var min=Math.floor(remaining/60000),sec=Math.floor(remaining%60000/1000);el.innerHTML='<div class="bt-row"><strong>⏱️ Próximo control: '+min+':'+String(sec).padStart(2,'0')+'</strong><button class="bt-pill" id="btStopTimer">Cancelar</button></div>';}
$('btStopTimer').onclick=function(){localStorage.removeItem(TIMERKEY);paintTimer();};}
function level(day){var arr=entries.filter(function(x){return dateOnly(x.t)===day;});if(!arr.length)return 'gray';if(arr.some(function(x){return x.type==='low';}))return 'red';if(arr.some(function(x){return x.type==='prevent';}))return 'yellow';return 'green';}
function timeline(){var period=$('btTimelinePeriod')?$('btTimelinePeriod').value:'day';var selectDate=new Date(selected+'T12:00');var start=new Date(selectDate);if(period==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);if(period==='month')start.setDate(1);start.setHours(0,0,0,0);var end=new Date(start);if(period==='week')end.setDate(end.getDate()+7);else if(period==='month')end.setMonth(end.getMonth()+1);else end.setDate(end.getDate()+1);
var list=entries.filter(function(x){return x.t>=start.getTime()&&x.t<end.getTime();}).sort(function(a,b){return b.t-a.t;});$('btDayTitle').textContent=period==='day'?selectDate.toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'}):period==='week'?'Semana del '+start.toLocaleDateString('es-CL',{day:'numeric',month:'short'}):start.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
$('btTimeline').innerHTML=list.length?list.map(function(x){var desc= x.type==='meal'?((x.mealName||'Comida')+' · '+fmt(x.carbs)+' g HC · '+(x.ratio!=null?'ratio histórico 1:'+x.ratio:'ratio histórico no registrado')+(x.calculatedDose!=null?' · fórmula registrada '+fmt(x.calculatedDose)+' U':' · fórmula no registrada')+(x.given!=null?' · aplicada '+fmt(x.given)+' U':' · aplicada no registrada')):
(x.type==='low'||x.type==='prevent')?('Glucosa '+fmt(x.glucose)+' · '+(x.treatment||'')+' '+(x.amount||'')+' · '+fmt(x.carbs)+' g HC'):
x.type==='exercise'?(x.exercise+' · '+fmt(x.duration)+' min · inicio '+fmt(x.glucose)+' mg/dL'):
x.type==='basal'?('Basal registrada '+fmt(x.given)+' U'):'Glucosa '+fmt(x.glucose)+' mg/dL '+(x.trend||'');
return '<div class="bt-item"><div class="bt-row"><div><span class="bt-timing">'+dt(x.t)+'</span><div class="bt-type">'+esc(types[x.type])+'</div><div class="bt-muting">'+esc(desc)+'</div>'+(x.note?'<div class="bt-small">'+esc(x.note)+'</div>':'')+'</div><div style="display:flex;gap:5px"><button class="bt-pill" data-edit="'+esc(x.id)+'" aria-label="Editar registro">✎</button><button class="bt-pill" data-delete="'+esc(x.id)+'" aria-label="Eliminar registro">×</button></div></div></div>';}).join(''):'<p class="bt-muting">Aún no hay registros este día. Puedes añadir uno en segundos.</p>';
}
function calendar(){var label=new Date(year,month,1).toLocaleDateString('es-CL',{month:'long',year:'numeric'});$('btMonthLabel').textContent=label;var dayStart=(new Date(year,month,1).getDay()+6)%7,last=new Date(year,month+1,0).getDate(),out=['L','M','M','J','V','S','D'].map(function(x){return '<span style="text-align:center;font-size:12px">'+x+'</span>';}).join('');for(var j=0;j<dayStart;j++)out+='<span></span>';for(var d=1;d<=last;d++){var key=localDate(new Date(year,month,d));out+='<button type="button" data-day="'+key+'" data-level="'+level(key)+'" data-selected="'+(key===selected)+'" aria-label="'+key+'">'+d+'</button>';} $('btCalendar').innerHTML=out;}
function stats(){var period=Number($('btStatsPeriod').value||7),cutoff=Date.now()-period*86400000,arr=entries.filter(function(x){return x.t>=cutoff;});var lows=arr.filter(function(x){return x.type==='low';}),gluc=[];arr.forEach(function(x){if(x.glucose!=null)gluc.push({t:x.t,g:x.glucose});/* El control posterior carece de hora registrada: no inventar instante en el gráfico. */});var min=gluc.length?Math.min.apply(null,gluc.map(function(x){return x.g;})):null,max=gluc.length?Math.max.apply(null,gluc.map(function(x){return x.g;})):null;
var hours={};lows.forEach(function(x){var h=new Date(x.t).getHours(),band=h<6?'00–06':h<12?'06–12':h<18?'12–18':'18–24';hours[band]=(hours[band]||0)+1;});var freq=Object.keys(hours).sort(function(a,b){return hours[b]-hours[a];});
var nearbyMeals=lows.reduce(function(sum,l){var prior=arr.filter(function(x){return x.type==='meal'&&x.t<=l.t&&l.t-x.t<=3*3600000;}).sort(function(a,b){return b.t-a.t;})[0];if(prior){sum[prior.mealName]=(sum[prior.mealName]||0)+1;}return sum;},{});
$('btStats').innerHTML='<div class="bt-fields"><div class="bt-card" style="margin:0"><div class="bt-small">Bajas registradas</div><b>'+lows.length+'</b></div><div class="bt-card" style="margin:0"><div class="bt-small">Descensos preventivos</div><b>'+arr.filter(function(x){return x.type==='prevent';}).length+'</b></div><div class="bt-card" style="margin:0"><div class="bt-small">Glucosa mínima registrada</div><b>'+fmt(min)+' mg/dL</b></div><div class="bt-card" style="margin:0"><div class="bt-small">Glucosa máxima registrada</div><b>'+fmt(max)+' mg/dL</b></div></div><p class="bt-small">Tramo con más bajas registradas: '+(freq[0]||'sin datos')+'. Comidas en las 3 h previas: '+(Object.keys(nearbyMeals).map(function(k){return k+' ('+nearbyMeals[k]+')';}).join(', ')||'sin datos')+'. Coincidencia temporal, no causalidad.</p>';
// Solo puntos realmente medidos; la línea entre puntos no equivale a mediciones intermedias.
gluc.sort(function(a,b){return a.t-b.t;});var shown=gluc.slice(-35),chart=$('btGlucoseChart');if(!shown.length){chart.innerHTML='<p class="bt-small">Sin glucosas registradas para representar.</p>';return;}
var gmin=Math.min(65,Math.min.apply(null,shown.map(function(x){return x.g;}))-15),gmax=Math.max(190,Math.max.apply(null,shown.map(function(x){return x.g;}))+15),tmin=shown[0].t,tmax=shown[shown.length-1].t,xpos=function(t){return 25+340*(t-tmin)/Math.max(1,tmax-tmin);},ypos=function(g){return 155-130*(g-gmin)/Math.max(1,gmax-gmin);};
var dots=shown.map(function(x){return '<circle cx="'+xpos(x.t).toFixed(1)+'" cy="'+ypos(x.g).toFixed(1)+'" r="4" fill="#33876a"><title>'+esc(dt(x.t))+' · '+x.g+' mg/dL</title></circle>';}).join('');
chart.innerHTML='<p class="bt-small">Glucosas registradas (puntos reales, sin interpolar lecturas)</p><svg class="bt-chart" viewBox="0 0 390 180" role="img" aria-label="Puntos de glucosa registrados"><path d="M25 25V155H375" fill="none" stroke="currentColor" opacity=".2"/>'+[70,140,180].map(function(g){var y=ypos(g);return '<line x1="25" x2="375" y1="'+y+'" y2="'+y+'" stroke="currentColor" stroke-dasharray="3 5" opacity=".15"/>';}).join('')+dots+'</svg>';
}
function render(){if(!$('s-bitacora'))return;$('btToday').textContent=new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});timeline();calendar();stats();paintTimer();}
function csvCell(x){return '"'+String(x==null?'':x).replace(/"/g,'""')+'"';}
function exportCSV(){var header=['Fecha/hora','Tipo','Comida','HC','Glucosa sensor','Accu-Chek','Tendencia','Ratio','Dosis fórmula','Dosis aplicada','Hora insulina','Inicio comida','Tratamiento','Cantidad','Control posterior','Ejercicio','Duración','Intensidad','Glucosa final','Observación','Alimentos','Glucosa +30','+60','+90','+120','+180'];var rows=entries.slice().sort(function(a,b){return a.t-b.t;}).map(function(x){return [localStamp(new Date(x.t)),types[x.type],x.mealName,x.carbs,x.glucose,x.capillary,x.trend,x.ratio,x.calculatedDose,x.given,x.injection,x.mealStart,x.treatment,x.amount,x.recheck,x.exercise,x.duration,x.intensity,x.endGlucose,x.note,(x.foods||[]).map(function(f){return f.name+' '+f.quantity+' '+(f.mode==='u'?'u':'g');}).join('; '),x.post30,x.post60,x.post90,x.post120,x.post180].map(csvCell).join(',');});download('Bitacora-Diego-'+localDate(new Date())+'.csv',header.map(csvCell).join(',')+'\r\n'+rows.join('\r\n'),'text/csv;charset=utf-8');}
function report(){var since=Date.now()-7*86400000,arr=entries.filter(function(x){return x.t>=since;}).sort(function(a,b){return a.t-b.t;}),lows=arr.filter(function(x){return x.type==='low';}),text='BITÁCORA DE DIEGO — 7 DÍAS\nGenerado: '+new Date().toLocaleString('es-CL')+'\nRegistros: '+arr.length+'; hipoglucemias registradas: '+lows.length+'; descensos preventivos: '+arr.filter(function(x){return x.type==='prevent';}).length+'\n\n';text+=arr.map(function(x){return dt(x.t)+' | '+types[x.type]+' | '+(x.mealName||x.exercise||x.treatment||'')+' | HC '+fmt(x.carbs)+' | Glucosa '+fmt(x.glucose)+' | Insulina aplicada '+fmt(x.given)+' U | '+(x.note||'');}).join('\n');text+='\n\nReporte descriptivo. Puede haber registros omitidos; no establece relaciones causales ni recomienda cambios de insulina.';download('Informe-Diego-7-dias-'+localDate(new Date())+'.txt',text);}
var actions={btAddMeal:'meal',btAddGlucose:'glucose',btAddLow:'low',btAddExercise:'exercise',btAddBasal:'basal',btAddOther:'other'};
Object.keys(actions).forEach(function(id){if($(id))$(id).onclick=function(){showForm(actions[id]);};});
if($('btFromPauta'))$('btFromPauta').onclick=function(){if(bridge())bridge().open();showForm('meal');};
if($('btFromPlate'))$('btFromPlate').onclick=function(){if(bridge())bridge().open();showForm('meal');};
if($('btStatsPeriod'))$('btStatsPeriod').onchange=stats;
if($('btTimelinePeriod'))$('btTimelinePeriod').onchange=timeline;
if($('btPrevMonth'))$('btPrevMonth').onclick=function(){month--;if(month<0){month=11;year--;}calendar();};
if($('btNextMonth'))$('btNextMonth').onclick=function(){month++;if(month>11){month=0;year++;}calendar();};
if($('btCalendar'))$('btCalendar').onclick=function(e){var b=e.target.closest('[data-day]');if(b){selected=b.dataset.day;timeline();calendar();}};
if($('btTimeline'))$('btTimeline').onclick=function(e){var ed=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(ed){var x=entries.find(function(x){return x.id===ed.dataset.edit;});if(x)showForm(x.type,x);}else if(del){var v=entries.find(function(x){return x.id===del.dataset.delete;});if(v&&confirm('¿Eliminar este registro?')){entries=entries.filter(function(x){return x.id!==v.id;});if(save())render();}}};
if($('btExportCSV'))$('btExportCSV').onclick=exportCSV;
if($('btWeeklyReport'))$('btWeeklyReport').onclick=report;
// V70: la bitácora actual es el único origen para exportaciones de análisis.
if($('btExportForAI'))$('btExportForAI').onclick=function(){
 const exportRows=entries.slice().sort(function(a,b){return a.t-b.t;});
 const payload={schema:'diego-familiar-bitacora-v1',generatedAt:new Date().toISOString(),
  sourceOfTruth:'Bitácora de Diego Familiar (local o Firebase sincronizado, según estado visible)',
  clinicalNotice:'Datos de seguimiento. No inferir dosis recomendadas ni recalcular dosis históricas.',
  total:exportRows.length,entries:exportRows};
 download('Diego-Bitacora-Para-IA-'+localDate(new Date())+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
};
if($('btAIInstructions'))$('btAIInstructions').onclick=function(){
 const prompt='Analiza SOLO el archivo JSON adjunto exportado desde Diego Familiar. Ordena por fecha y hora, describe patrones observados de glucosa, alimentos, ejercicio e insulina registrada; separa dosis históricas calculadas de las realmente administradas y señala datos faltantes o duplicados. No recomiendes ni calcules dosis nuevas. Los registros nuevos de la app son la fuente de datos y no debes inventar datos.';
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(prompt).then(function(){alert('Instrucciones copiadas. Adjunta el JSON a ChatGPT o Claude.');}).catch(function(){alert(prompt);});}
 else alert(prompt);
};
if($('btImportHistoryShortcut'))$('btImportHistoryShortcut').onclick=function(){
 const settings=$('familySettings');if(settings)settings.open=true;
 const input=$('familyHistoryFile');if(input)input.scrollIntoView({behavior:'smooth',block:'center'});
};
if($('btGoHistory'))$('btGoHistory').onclick=function(){
 selected='2026-11-24';month=10;year=2026;
 if($('btTimelinePeriod'))$('btTimelinePeriod').value='month';
 timeline();calendar();
 $('btTimeline')?.scrollIntoView({block:'nearest',behavior:'smooth'});
};
if($('btBackup'))$('btBackup').onclick=function(){download('Bitacora-Diego-respaldo-'+localDate(new Date())+'.json',JSON.stringify({version:29,exportedAt:new Date().toISOString(),entries:entries},null,2),'application/json;charset=utf-8');};
window.DiegoBitacora={render:render,openMeal:function(){if(bridge())bridge().open();showForm('meal');},
  saveExercise:function(preset){
    var mins=Number(preset&&preset.minutes),activity=String(preset&&preset.activity||'Fútbol');
    if(!Number.isInteger(mins)||mins<1||mins>600||!['Fútbol','Bicicleta','Caminata','Gimnasio','Otro'].includes(activity))return false;
    var record={id:'bt-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),type:'exercise',t:Date.now(),exercise:activity,duration:mins,intensity:'No registrada',note:'Registrado desde Inicio; glucosa inicial y final no informadas.'};
    entries.push(record);
    if(!save()){entries=entries.filter(function(x){return x.id!==record.id;});return false;}
    selected=dateOnly(record.t);month=new Date(record.t).getMonth();year=new Date(record.t).getFullYear();render();
    return true;
  },
  openExercise:function(preset){var v={type:'exercise'};showForm('exercise');var a=$('btExercise'),d=$('btDuration'),i=$('btIntensity');if(a&&preset&&preset.activity)a.value=preset.activity;if(d&&preset&&preset.minutes)d.value=preset.minutes;if(i&&preset&&preset.intensity)i.value=preset.intensity;},
  getEntries:function(){return entries.map(function(x){return JSON.parse(JSON.stringify(x));});},
  loadShared:function(list){if(!Array.isArray(list))return;entries=list.filter(function(x){return x&&typeof x.id==='string'&&Number.isFinite(x.t);});
    try{localStorage.setItem(KEY,JSON.stringify(entries));}catch(e){}
    savedSnapshot=entries.map(function(x){return JSON.parse(JSON.stringify(x));});render();}
};
setInterval(function(){if(!$('btTimer'))return;var visible=!$('s-bitacora').hidden;if(visible)paintTimer();},1000);
})();
