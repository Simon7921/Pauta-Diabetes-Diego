/* Diego V15 – Vision IA. No almacena imágenes; envía foto reducida al Worker configurado. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var endpointKey = 'diego.ai.worker.endpoint';
  var secretKey = 'diego.ai.worker.access';
  var forms = {label:{input:'labelPhotoInput', panel:'labelPhotoPanel', result:'aiLabelResult', status:'aiLabelStatus', button:'aiLabelAnalyze'},plate:{input:'platePhotoInput',panel:'platePhotoPanel',result:'aiPlateResult',status:'aiPlateStatus',button:'aiPlateAnalyze'}};
  function node(tag, attrs, text) { var e=document.createElement(tag); if(attrs) Object.keys(attrs).forEach(function(k){ if(k==='class')e.className=attrs[k];else e.setAttribute(k,attrs[k]);}); if(text!=null)e.textContent=String(text); return e; }
  function fmt(n){return Number(n).toLocaleString('es-CL',{maximumFractionDigits:1});}
  function num(n){if(n==null||n==='')return null;var x=Number(n);return Number.isFinite(x)&&x>=0?x:null;}
  function warnList(root,warnings){if(!Array.isArray(warnings))return;warnings.slice(0,5).forEach(function(w){root.appendChild(node('p',{class:'t2 small'},'⚠ '+String(w)));});}
  function settings(){
    var holder=$('aiConnectionSettings'); if(!holder)return;
    holder.appendChild(node('strong',{},'Conexión con IA (configuración privada)'));
    holder.appendChild(node('p',{class:'t2 small'},'La foto se envía al servicio de IA cuando presionas Analizar. Necesitas configurar tu Worker; nunca ingreses aquí la clave de OpenAI.'));
    var url=node('input',{id:'aiEndpoint',class:'in s',type:'url',placeholder:'https://tu-worker.tu-subdominio.workers.dev', 'aria-label':'URL del Cloudflare Worker'});
    url.value=localStorage.getItem(endpointKey)||'';
    var code=node('input',{id:'aiAccessCode',class:'in s',type:'password',placeholder:'Código de acceso del Worker',autocomplete:'off', 'aria-label':'Código de acceso temporal'});
    code.value=sessionStorage.getItem(secretKey)||'';
    holder.appendChild(node('label',{class:'f',for:'aiEndpoint'},'URL del servicio IA'));holder.appendChild(url);
    holder.appendChild(node('label',{class:'f',for:'aiAccessCode',style:'margin-top:10px;display:block'},'Código de acceso (no es la API key)'));holder.appendChild(code);
    var b=node('button',{type:'button',class:'btn btn-secondary',style:'margin-top:10px;width:100%'},'Guardar conexión');
    var msg=node('p',{class:'t2 small',role:'status'},''); holder.appendChild(b);holder.appendChild(msg);
    b.addEventListener('click',function(){
      var endpoint=url.value.trim().replace(/\/+$/,'');
      if(!/^https:\/\/[a-z\d.-]+(?:\/[a-z\d_\/-]*)?$/i.test(endpoint)){msg.textContent='Ingresa una dirección HTTPS válida.';return;}
      localStorage.setItem(endpointKey,endpoint);sessionStorage.setItem(secretKey,code.value);msg.textContent='Conexión guardada en este navegador. Puedes analizar fotografías.';
    });
  }
  function compressPhoto(file){
    return new Promise(function(resolve,reject){
      if(!file||!file.type.startsWith('image/'))return reject(Error('Selecciona una imagen.'));
      if(file.size>16*1024*1024)return reject(Error('Foto demasiado grande. El máximo es 16 MB antes de reducir.'));
      var blobURL=URL.createObjectURL(file),img=new Image();
      img.onload=function(){
        try{
          var scale=Math.min(1,1500/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          var data=canvas.toDataURL('image/jpeg',0.82);URL.revokeObjectURL(blobURL);
          if(data.length>5.5*1024*1024)return reject(Error('Imagen aún demasiado grande.'));
          resolve(data);
        }catch(err){URL.revokeObjectURL(blobURL);reject(err);}
      };
      img.onerror=function(){URL.revokeObjectURL(blobURL);reject(Error('No se pudo abrir la fotografía. Prueba con una imagen JPG.'));};
      img.src=blobURL;
    });
  }
  async function requestVision(mode){
    var cfg=forms[mode],status=$(cfg.status),result=$(cfg.result),button=$(cfg.button),photo=$(cfg.input).files[0];
    if(!photo){status.textContent='Primero toma o selecciona una fotografía.';return;}
    var url=(localStorage.getItem(endpointKey)||'').replace(/\/+$/,''),access=sessionStorage.getItem(secretKey)||'';
    if(!url||!access){status.textContent='Primero abre Configurar IA y guarda la URL del Worker y su código de acceso.';return;}
    button.disabled=true;button.textContent='Analizando fotografía…';result.replaceChildren();status.textContent='La fotografía se enviará al proveedor de IA para su análisis.';
    try{
      var image=await compressPhoto(photo),controller=new AbortController(),timer=setTimeout(function(){controller.abort();},45000),response;
      try {response=await fetch(url+'/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Diego-Access':access},body:JSON.stringify({mode:mode,image:image}),signal:controller.signal});}
      finally{clearTimeout(timer);}
      var payload=await response.json().catch(function(){return{};});
      if(!response.ok)throw Error(payload.error||('Error HTTP '+response.status));
      if(!payload||!payload.result)throw Error('No llegaron resultados interpretables.');
      status.textContent='Resultado listo. Revisa antes de usar los datos.';
      if(mode==='label')showLabel(payload.result,result);else showPlate(payload.result,result);
    }catch(err){status.textContent=err.name==='AbortError'?'La conexión tardó demasiado. Intenta de nuevo.':'Error: '+err.message;}
    finally{button.disabled=false;button.textContent='✨ Analizar foto con IA';}
  }
  function showLabel(data,root){
    root.appendChild(node('h4',{},'Etiqueta detectada'));
    if(data.name)root.appendChild(node('p',{},'Producto: '+data.name));
    if(data.carbs_per_serving!=null)root.appendChild(node('p',{},'Carbohidratos por porción: '+fmt(data.carbs_per_serving)+' g'));
    if(data.serving_size!=null)root.appendChild(node('p',{},'Tamaño de porción: '+fmt(data.serving_size)+' '+(data.serving_unit||'g/ml')));
    if(data.carbs_per_100!=null)root.appendChild(node('p',{},'Carbohidratos por 100 g/ml: '+fmt(data.carbs_per_100)+' g'));
    warnList(root,data.warnings);
    if(data.carbs_per_serving==null&&data.carbs_per_100==null){root.appendChild(node('p',{},'No se encontraron HC legibles. Usa una foto más clara o ingresa los valores manualmente.'));return;}
    var confirm=node('button',{type:'button',class:'btn btn-primary',style:'width:100%;margin-top:8px'},'Copiar datos al formulario para revisar');
    root.appendChild(confirm);
    confirm.addEventListener('click',function(){
      if(data.name)$('labelFoodName').value=data.name;
      var size=num(data.serving_size),perServing=num(data.carbs_per_serving),per100=num(data.carbs_per_100);
      if(size!==null&&size>0)$('labelSize').value=size;
      if(perServing!==null&&size!==null&&size>0){$('labelBasis').value='unit';$('labelHC').value=String(perServing).replace('.',',');}
      else if(per100!==null){$('labelBasis').value='100';$('labelHC').value=String(per100).replace('.',',');}
      $('labelPhotoError').textContent='Revisa nombre, HC, peso o volumen, y datos por porción frente a la etiqueta antes de guardar.';
      $('labelFoodName').focus();
    });
  }
  function showPlate(data,root){
    root.appendChild(node('h4',{},'Estimación fotográfica — no apta para dosificar'));
    root.appendChild(node('p',{class:'t2 small'},'Una foto no mide gramos ni ingredientes ocultos. Revisa cada estimación pesando o usando porciones conocidas.'));
    var items=Array.isArray(data.items)?data.items:[];
    items.forEach(function(it){
      var line=node('div',{class:'ai-est-row'});
      line.appendChild(node('strong',{},it.name||'Ingrediente sin identificar'));
      line.appendChild(node('p',{class:'t2 small'},'Cantidad visual: '+(num(it.estimated_grams)!=null?fmt(it.estimated_grams)+' g':'no determinada')+' · HC estimados: '+(num(it.carbs_grams)!=null?fmt(it.carbs_grams)+' g':'no calculables')));
      root.appendChild(line);
    });
    var values=items.map(function(it){return num(it.carbs_grams);});
    if(values.length&&values.every(function(x){return x!==null;})){
      var total=values.reduce(function(a,b){return a+b;},0);
      root.appendChild(node('p',{class:'ai-total'},'Total visual orientativo: ≈ '+fmt(total)+' g HC'));
    } else root.appendChild(node('p',{},'No hay información suficiente para un total de HC.'));
    warnList(root,data.warnings);
    root.appendChild(node('p',{class:'t2 small'},'Para agregar la comida al plato y usar los cálculos habituales, selecciona los ingredientes de la base y confirma cantidades.'));
    var go=node('button',{type:'button',class:'btn btn-primary',style:'width:100%;margin-top:8px'},'Elegir ingredientes con cantidades verificadas');
    root.appendChild(go);go.addEventListener('click',function(){$('plateChooseFoods').click();});
  }
  function addButtons(){
    ['label','plate'].forEach(function(mode){var c=forms[mode],panel=$(c.panel);if(!panel)return;
      var b=node('button',{id:c.button,type:'button',class:'btn btn-primary',style:'width:100%;margin-top:10px'},'✨ Analizar foto con IA');
      var status=node('p',{id:c.status,class:'t2 small',role:'status','aria-live':'polite'},'');
      var result=node('div',{id:c.result,class:'ai-result',role:'region','aria-label':'Resultado de IA'});
      var input=$(c.input); input.insertAdjacentElement('afterend',b);b.insertAdjacentElement('afterend',status);status.insertAdjacentElement('afterend',result);
      b.addEventListener('click',function(){requestVision(mode);});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){settings();addButtons();});
  else {settings();addButtons();}
})();
