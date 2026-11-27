/* Diego Familiar V30 — sincronización opcional con Firebase. No comparte parámetros médicos. */
const $ = (id) => document.getElementById(id);
const status = (s) => { if ($('familyStatus')) $('familyStatus').textContent=s; };
const message = (s) => { if ($('familyMessage')) $('familyMessage').textContent=s; };
const show = (id,yes) => { if ($(id)) $(id).hidden=!yes; };
const config=window.DIEGO_FIREBASE_CONFIG;
if (!config || !config.projectId || !config.apiKey || !config.appId) {
  message('Sin conexión todavía. Configura firebase-config.js y habilita Authentication y Firestore. La bitácora sigue funcionando en este teléfono.');
} else {
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]);
  const app=initializeApp(config);
  const auth=authMod.getAuth(app);
  const db=dbMod.getFirestore(app);
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, onAuthStateChanged }=authMod;
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp, query, limit }=dbMod;
  const familyKey='diego.v30.familyId';
  let familyId=null, role=null, currentUser=null, stopListener=null, connected=false, remoteReady=false;
  const known=new Map(), pending=new Map();
  function restorePrivateLocal(){
    // La ausencia de respaldo NO autoriza vaciar registros locales.
    try{const raw=localStorage.getItem('diego.v30.precloudBackup');
      if(!raw)return;
      const backup=JSON.parse(raw);
      if(Array.isArray(backup))window.DiegoBitacora?.loadShared?.(backup);
    }catch(e){message('El respaldo local está dañado; se conservarán los registros visibles.');}
  }
  function reset(){window.DIEGO_FAMILY_READ_ONLY=false;if(stopListener)stopListener();stopListener=null;connected=false;remoteReady=false;serverSnapshotReady=false;clearImportPreview();familyId=null;role=null;known.clear();pending.clear();show('familyConnected',false);show('familyHome',!!currentUser?.emailVerified);status('Solo en este teléfono');}
  async function listMembers(){if(!familyId||role!=='owner')return;const container=$('familyMembers');if(!container)return;container.replaceChildren();
    const docs=await getDocs(collection(db,'families',familyId,'members'));
    docs.forEach(item=>{const m=item.data(), row=document.createElement('div');row.className='family-member';
      const name=document.createElement('span');name.textContent=(m.email||m.uid)+' · '+(m.role||'');row.append(name);
      if(m.role!=='owner'){const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent='Revocar';
        b.onclick=()=>run(async()=>{if(!confirm('¿Quitar el acceso a '+m.email+' y cancelar su invitación anterior?'))return;const batch=writeBatch(db);batch.delete(doc(db,'families',familyId,'invites',String(m.email||'').toLowerCase()));batch.delete(doc(db,'families',familyId,'members',item.id));await batch.commit();await listMembers();message('Acceso e invitación revocados.');});row.append(b);}
      container.append(row);});
  }
  function safeError(err){console.error('Diego Familiar:',err?.code||'error');return ({'auth/invalid-credential':'Correo o contraseña incorrectos.','auth/email-already-in-use':'Ese correo ya tiene una cuenta.','auth/weak-password':'La contraseña no cumple los requisitos.','permission-denied':'Sin permisos para este espacio. Verifica el correo y la invitación.','unavailable':'Sin conexión. Revisa internet.'})[err?.code]||'No se completó la operación. Revisa la configuración y los permisos.';}
  async function readyFamily(fid){
    if(!currentUser?.emailVerified)throw Error('Verifica primero tu correo y vuelve a iniciar sesión.');
    if(!/^[a-zA-Z0-9_-]{10,60}$/.test(fid))throw Error('ID familiar inválido.');
    const m=await getDoc(doc(db,'families',fid,'members',currentUser.uid));
    if(!m.exists())throw Error('Tu cuenta no pertenece a este espacio. Debes aceptar la invitación.');
    if(stopListener)stopListener();
    familyId=fid; role=m.data().role; connected=true;remoteReady=false;known.clear();pending.clear();
    localStorage.setItem(familyKey,fid);$('familySpaceId').textContent=fid;$('familyRole').textContent=role==='owner'?'Propietario':role==='editor'?'Editor':'Solo lectura';
    show('familyHome',false);show('familyConnected',true);show('familyOwnerTools',role==='owner');show('familyUpload',role!=='viewer');
    window.DIEGO_FAMILY_READ_ONLY=role==='viewer';
    if(role==='owner')await listMembers();
    status('Conectando…'); message('Conectando la bitácora compartida…');
    stopListener=onSnapshot(collection(db,'families',fid,'entries'),{includeMetadataChanges:true},snap=>{
      if(!connected||familyId!==fid)return;
      const rows=[];const snapIDs=new Set();
      snap.forEach(x=>{
        if(!x.data()?.payload)return;
        snapIDs.add(x.id); const item=x.data().payload;
        if(item&&item.id===x.id&&Number.isFinite(item.t))rows.push(item);
      });
      // Keep unacknowledged local changes while server is catching up.
      for(const [id,change] of pending){if(change===null){const i=rows.findIndex(x=>x.id===id);if(i>=0)rows.splice(i,1);}else {const i=rows.findIndex(x=>x.id===id);if(i>=0)rows[i]=change;else rows.push(change);}}
      // Avoid replacing device-only legacy data until an explicit upload/choice.
      serverSnapshotReady=!snap.metadata.fromCache;
      if(!remoteReady){const local=window.DiegoBitacora?.getEntries?.()||[];
        if(local.length&&!snap.size){message('Espacio conectado y vacío. Haz respaldo JSON y luego pulsa «Subir registros locales» para compartirlos.');}
        else if(local.length&&snap.size){message('Se encontraron registros compartidos. La pantalla muestra los datos de la nube. Antes de subir registros antiguos, exporta el respaldo JSON.');}
        else message('Bitácora compartida conectada.');
        remoteReady=true;
      }
      window.DiegoBitacora?.loadShared?.(rows);
      status(pending.size?'Guardado local · sincronización pendiente':(snap.metadata.fromCache?'Datos en caché':'Sincronizado'));
      if(pending.size&&remoteReady&&!flushing){queueMicrotask(()=>{if(connected&&pending.size)void flushPending();});}
    },err=>{status('Sin conexión');message(safeError(err));});
  }
  async function createFamily(){
    if(!currentUser?.emailVerified)throw Error('Primero confirma tu correo electrónico.');
    // Random ID not secret; Firestore rules restrict access by membership.
    const fid='diego_'+crypto.randomUUID().replaceAll('-','').slice(0,20);
    const fam=doc(db,'families',fid), mem=doc(db,'families',fid,'members',currentUser.uid);
    await setDoc(fam,{ownerUid:currentUser.uid,title:'Bitácora de Diego',createdAt:serverTimestamp()});
    await setDoc(mem,{uid:currentUser.uid,email:currentUser.email,role:'owner',joinedAt:serverTimestamp()});
    await readyFamily(fid);
  }
  async function invite(){
    if(role!=='owner')throw Error('Solo el propietario puede invitar.');
    const email=$('familyInviteEmail').value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('Revisa el correo que quieres autorizar.');
    const roleToGrant=$('familyInviteRole').value;
    await setDoc(doc(db,'families',familyId,'invites',email),{email,role:roleToGrant,invitedBy:currentUser.uid,createdAt:serverTimestamp()});
    message('Correo autorizado. Comparte el ID familiar por privado. La persona debe crear una cuenta y verificar su correo.');
  }
  async function join(){
    if(!currentUser?.emailVerified)throw Error('Verifica tu correo antes de aceptar una invitación.');
    const fid=$('familyJoinId').value.trim(), email=currentUser.email.toLowerCase();
    if(!/^[a-zA-Z0-9_-]{10,60}$/.test(fid))throw Error('Pega el ID familiar correcto.');
    // Read only your own invitation; never request/assume edit permission.
    const invitation=await getDoc(doc(db,'families',fid,'invites',email));
    if(!invitation.exists())throw Error('No existe una invitación para este correo.');
    const invitedRole=invitation.data().role;
    if(!['editor','viewer'].includes(invitedRole))throw Error('La invitación no tiene un permiso válido.');
    await setDoc(doc(db,'families',fid,'members',currentUser.uid),{uid:currentUser.uid,email,role:invitedRole,joinedAt:serverTimestamp()});
    await readyFamily(fid);
  }
  // Firestore rules determine actual role and do NOT trust client input.
  let flushing=false;
  async function flushPending(){
    if(flushing||!connected||!remoteReady||role==='viewer'||!pending.size)return;
    flushing=true;status('Sincronizando…');
    let succeeded=false;
    try{
      for(const [id,value] of [...pending.entries()]){
        if(value===null)await deleteDoc(doc(db,'families',familyId,'entries',id));
        else await setDoc(doc(db,'families',familyId,'entries',id),{payload:value,updatedAt:serverTimestamp(),editedBy:currentUser.uid});
        if(pending.get(id)===value)pending.delete(id);
      }
      succeeded=true;
      status(pending.size?'Guardado local · sincronización pendiente':'Sincronizado');
    }catch(err){status('Pendiente de sincronizar');message('Guardado local, pero no confirmado en la nube. '+safeError(err));}
    finally{flushing=false;}
    if(succeeded&&pending.size&&connected)queueMicrotask(()=>{void flushPending();});
  }
  async function pushChanges(changed,removed){
    if(!connected||role==='viewer')return;
    for(const e of changed){pending.set(e.id,e);}
    for(const id of removed){pending.set(id,null);}
    if(!remoteReady){status('Guardado local · esperando conexión');return;}
    await flushPending();
  }
  window.addEventListener('diego-bitacora-changed',ev=>{const d=ev.detail||{};void pushChanges(d.changed||[],d.removed||[]);});
  // Importador de un archivo revisado: únicamente al espacio compartido de Firebase.
  let stagedHistory=null;
  let serverSnapshotReady=false;
  function clearImportPreview(){stagedHistory=null;const b=$('familyHistoryCommit');if(b)b.disabled=true;}
  function entrySame(a,b){
    if(!a||!b||a.type!=='meal'||b.type!=='meal')return false;
    if(Math.abs(a.t-b.t)>45*60000)return false;
    return Math.abs(Number(a.glucose)-Number(b.glucose))<0.01&&
           Math.abs(Number(a.carbs)-Number(b.carbs))<0.01&&
           (a.given==null||b.given==null||Math.abs(Number(a.given)-Number(b.given))<0.01);
  }
  async function previewHistory(){
    clearImportPreview();
    const file=$('familyHistoryFile')?.files?.[0];
    if(!file)throw Error('Primero selecciona el archivo JSON de historial revisado.');
    if(file.size>2*1024*1024)throw Error('Archivo demasiado grande.');
    if(!connected||!remoteReady||!serverSnapshotReady||role==='viewer')throw Error('Conéctate con un usuario editor o propietario y espera que indique «Sincronizado».');
    const parsed=JSON.parse(await file.text());
    if(parsed?.app!=='diego-familiar-import-v1'||parsed.version!==1||!Array.isArray(parsed.entries)||parsed.entries.length>200)throw Error('No es el archivo de historial revisado.');
    if(parsed.entries.some(e=>!e||e.type!=='meal'||typeof e.id!=='string'||!/^hist202611_/.test(e.id)||!Number.isFinite(e.t)||!Number.isFinite(e.carbs)||!Number.isFinite(e.glucose)||e.reviewStatus!=='propuesto_para_importar'))throw Error('El archivo incluye registros inválidos o pendientes de revisión.');
    const existing=await getDocs(collection(db,'families',familyId,'entries'));
    if(existing.metadata.fromCache)throw Error('Sin acceso confirmado al servidor. Prueba nuevamente conectado a internet.');
    const originals=[];existing.forEach(d=>{if(d.data()?.payload)originals.push(d.data().payload);});
    let duplicates=0;const fresh=[];
    for(const e of parsed.entries){if(originals.some(old=>old.id===e.id||entrySame(old,e))||fresh.some(old=>old.id===e.id||entrySame(old,e)))duplicates++;else fresh.push(e);}
    stagedHistory={entries:fresh,fid:familyId,uid:currentUser.uid,dataset:parsed.datasetId};
    $('familyHistoryPreviewResult').textContent='Archivo: '+parsed.entries.length+' registros. Ya existentes o similares: '+duplicates+'. Nuevos propuestos: '+fresh.length+'. Casos pendientes excluidos del archivo: '+(parsed.excludedForReview||0)+'.';
    $('familyHistoryCommit').disabled=fresh.length===0;
  }
  async function commitHistory(){
    if(!stagedHistory||!stagedHistory.entries.length||!connected||!serverSnapshotReady||role==='viewer'||stagedHistory.fid!==familyId||stagedHistory.uid!==currentUser?.uid)throw Error('Vuelve a revisar el archivo conectado como editor.');
    if(!confirm('Verifica primero que descargaste «Respaldo JSON de bitácora». ¿Importar '+stagedHistory.entries.length+' registros históricos a la nube familiar? No se recalculan las dosis.'))return;
    const batchEntries=stagedHistory.entries;let added=0,skipped=0;
    // Revalidar cada documento al escribir, para tolerar reintentos y sesiones familiares.
    const snapshot=await getDocs(collection(db,'families',familyId,'entries'));
    if(snapshot.metadata.fromCache)throw Error('Se requiere conexión al servidor para importar.');
    const existing=[];snapshot.forEach(d=>{if(d.data()?.payload)existing.push(d.data().payload);});
    for(const e of batchEntries){
      if(existing.some(old=>old.id===e.id||entrySame(old,e))){skipped++;continue;}
      await setDoc(doc(db,'families',familyId,'entries',e.id),{payload:e,updatedAt:serverTimestamp(),editedBy:currentUser.uid});
      existing.push(e);added++;
    }
    clearImportPreview();
    $('familyHistoryPreviewResult').textContent='Importación completada: '+added+' nuevos; '+skipped+' repetidos omitidos. La bitácora compartida se actualizará automáticamente. Conserva tus respaldos.';
    message('Historial familiar actualizado. '+added+' registros nuevos.');
  }
  if($('familyHistoryPreview'))$('familyHistoryPreview').onclick=()=>run(previewHistory);
  if($('familyHistoryCommit'))$('familyHistoryCommit').onclick=()=>run(commitHistory);
  if($('familyHistoryFile'))$('familyHistoryFile').addEventListener('change',()=>{clearImportPreview();$('familyHistoryPreviewResult').textContent='Archivo seleccionado. Pulsa «Revisar archivo». ';});
  async function uploadLegacy(){
    if(!connected||!remoteReady||role==='viewer')throw Error('Conecta una cuenta con permiso de edición.');
    if(!confirm('Antes de continuar, descarga «Respaldo JSON». Se añadirán a la nube los registros de este teléfono sin borrar los compartidos. ¿Continuar?'))return;
    const local=JSON.parse(localStorage.getItem('diego.v30.precloudBackup')||'null')||[];
    if(!local.length)throw Error('No hay registros antiguos guardados para importar. Revisa el archivo JSON de respaldo.');
    let count=0;
    for(const entry of local){if(!entry?.id||!Number.isFinite(entry.t))continue;const ref=doc(db,'families',familyId,'entries',entry.id);const found=await getDoc(ref);if(found.exists())continue;await setDoc(ref,{payload:entry,updatedAt:serverTimestamp(),editedBy:currentUser.uid});count++;}
    message('Importación terminada: '+count+' registros nuevos. El respaldo local sigue disponible.');
  }
  function preserveLocal(){
    try {if(!localStorage.getItem('diego.v30.precloudBackup'))localStorage.setItem('diego.v30.precloudBackup',JSON.stringify(window.DiegoBitacora?.getEntries?.()||[]));}catch(e){}
  }
  async function run(fn){try{await fn();}catch(err){message(err?.message&&!err.code?err.message:safeError(err));}}
  $('familyLogin').onclick=()=>run(async()=>{await signInWithEmailAndPassword(auth,$('familyEmail').value.trim(),$('familyPassword').value);$('familyPassword').value='';});
  $('familyRegister').onclick=()=>run(async()=>{const pw=$('familyPassword').value;if(pw.length<12)throw Error('Usa una contraseña de al menos 12 caracteres.');const c=await createUserWithEmailAndPassword(auth,$('familyEmail').value.trim(),pw);await sendEmailVerification(c.user);$('familyPassword').value='';message('Cuenta creada. Revisa tu correo para verificarla y luego inicia sesión nuevamente.');});
  $('familyLogout').onclick=()=>run(async()=>{await signOut(auth);restorePrivateLocal();});
  $('familyVerify').onclick=()=>run(async()=>{if(currentUser)await sendEmailVerification(currentUser);message('Correo de verificación enviado.');});
  $('familyCreate').onclick=()=>run(createFamily);$('familyInvite').onclick=()=>run(invite);$('familyJoin').onclick=()=>run(join);
  $('familyCopyId').onclick=()=>run(async()=>{await navigator.clipboard.writeText(familyId);message('ID familiar copiado. Envíalo solamente por un medio privado.');});
  $('familyLeave').onclick=()=>{reset();restorePrivateLocal();localStorage.removeItem(familyKey);message('Espacio desconectado de este dispositivo. La cuenta sigue autorizada hasta que el propietario retire el acceso.');};
  $('familyUpload').onclick=()=>run(uploadLegacy);
  if($('familyRefreshMembers'))$('familyRefreshMembers').onclick=()=>run(listMembers);
  onAuthStateChanged(auth,async user=>{
    currentUser=user;window.DIEGO_RATIO_USER_ID=user && user.emailVerified ? user.uid : null;window.dispatchEvent(new Event('diego:ratio-user-changed'));reset();show('familyAuth',!user);show('familyLogged',!!user);
    if(!user){restorePrivateLocal();message('Inicia sesión con tu cuenta personal.');return;}
    $('familyUserLabel').textContent=user.email+(user.emailVerified?' · verificado':' · pendiente de verificación');
    if(!user.emailVerified){message('Verifica tu correo para entrar al espacio familiar y vuelve a iniciar sesión.');return;}
    preserveLocal();show('familyHome',true);
    const last=localStorage.getItem(familyKey);if(last)try{await readyFamily(last);}catch(e){message('No se pudo recuperar el espacio anterior. '+(e.message||''));}
  });
}
