// app.js — DOM/UI katmanı
// pricing-engine.js <script> olarak index.html'de bu dosyadan ÖNCE yüklenir
var distribute = PricingEngine.distribute;

var wb=null,parsedItems=[],lastResult=[];

// --- Toast notifications ---
(function(){
  var container=document.createElement('div');
  container.className='toast-container';
  document.body.appendChild(container);
  window.showToast=function(msg,type,duration){
    type=type||'info';duration=duration||2500;
    var t=document.createElement('div');
    t.className='toast toast-'+type;
    t.textContent=msg;
    container.appendChild(t);
    requestAnimationFrame(function(){requestAnimationFrame(function(){t.classList.add('show')})});
    setTimeout(function(){
      t.classList.remove('show');
      setTimeout(function(){container.removeChild(t)},350);
    },duration);
  };
})();

// --- Utility helpers ---
function norm(s){
  return String(s??'')
    .replace(/İ/g,'i').replace(/I/g,'i')
    .replace(/Ü/g,'u').replace(/Ö/g,'o')
    .replace(/Ğ/g,'g').replace(/Ş/g,'s').replace(/Ç/g,'c')
    .toLowerCase()
    .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i')
    .replace(/ğ/g,'g').replace(/ş/g,'s').replace(/ç/g,'c')
    .trim();
}
function fmt(n){return Number(n).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtPct(n){return(n>=0?'+':'')+(n*100).toFixed(1)+'%'}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toNum(v){
  if(v===null||v===undefined||v==='')return NaN;
  if(typeof v==='number')return v;
  if(typeof v==='string'){if(v.startsWith('='))return NaN;return parseFloat(v.replace(/\./g,'').replace(',','.'))}
  return NaN;
}
function toStr(v){if(v===null||v===undefined)return '';const s=String(v).trim();return s.startsWith('=')?'':s}

// --- Excel parsing ---
const ALIASES={
  name:['urun adi','malzeme adi','malzeme','aciklama','kalem'],
  unit:['birim'],qty:['miktar','adet'],price:['birim fiyat','birim fyat']
};
function detectCol(nh,key){
  const al=[...ALIASES[key]].sort((a,b)=>b.length-a.length);
  return nh.findIndex(h=>al.some(a=>h.includes(a)));
}

function parseSheet(workbook,sheetName){
  const ws=workbook.Sheets[sheetName];
  if(!ws)return{items:[],debug:'Sekme bulunamadı'};
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
  if(rows.length<2)return{items:[],debug:'Sayfa boş'};
  let hi=-1;
  for(let i=0;i<Math.min(rows.length,20);i++){
    const nr=rows[i].map(c=>norm(c));
    if((nr.some(c=>c.includes('birim fiyat'))||nr.some(c=>c==='miktar'))&&nr.some(c=>c.includes('urun')||c.includes('malzeme'))){hi=i;break}
  }
  if(hi===-1){
    const p=rows.slice(0,5).map((r,i)=>'Satır '+(i+1)+': ['+r.slice(0,8).map(c=>toStr(c)||'—').join(' | ')+']').join('\n');
    return{items:[],debug:'Başlık satırı bulunamadı.\n'+p};
  }
  const nh=rows[hi].map(h=>norm(h));
  const nc=detectCol(nh,'name'),uc=detectCol(nh,'unit'),qc=detectCol(nh,'qty'),pc=detectCol(nh,'price');
  if(nc<0||qc<0||pc<0)return{items:[],debug:'Sütun eşleştirilemedi: Ad='+nc+' Miktar='+qc+' Fiyat='+pc+'\n'+nh.join(' | ')};
  const items=[],sk=[];
  for(let r=hi+1;r<rows.length;r++){
    const row=rows[r];
    const name=toStr(row[nc]),qty=toNum(row[qc]),price=toNum(row[pc]),unit=uc>=0?toStr(row[uc]):'';
    if(!name)continue;
    if(isNaN(qty)||qty<=0||isNaN(price)||price<=0){sk.push(r+1);continue}
    items.push({id:items.length+1,name,birim:unit,qty,price});
  }
  return{items,nc,uc,qc,pc,skipped:sk};
}

// --- DOM references ---
const $=id=>document.getElementById(id);

// --- File handling ---
function onFileChange(e){loadFile(e.target.files[0])}
function onDragOver(e){e.preventDefault();$('dropZone').classList.add('drag')}
function onDragLeave(){$('dropZone').classList.remove('drag')}
function onDrop(e){e.preventDefault();onDragLeave();loadFile(e.dataTransfer.files[0])}

function loadFile(file){
  if(!file)return;setError('');
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      $('sheetSelect').innerHTML=wb.SheetNames.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
      $('dropZone').classList.add('hidden');
      $('btnReset').classList.remove('hidden');
      $('sheetCard').classList.remove('hidden');
      applySheet(wb.SheetNames[0]);
    }catch(err){setError('Dosya okunamadı: '+err.message)}
  };
  reader.readAsArrayBuffer(file);
}

function onSheetChange(){applySheet($('sheetSelect').value);clearResults()}

function applySheet(name){
  const p=parseSheet(wb,name);
  parsedItems=p.items||[];
  const sr=$('statusRow'),db=$('debugBox');
  if(parsedItems.length>0){
    const ot=parsedItems.reduce((s,it)=>s+it.price*it.qty,0);
    sr.innerHTML='<span style="color:#4caf50">&#10003;</span> <span style="color:#fff">'+parsedItems.length+' kalem</span> &nbsp;&middot;&nbsp; Toplam: <span style="color:#f0a500">'+fmt(ot)+' TL</span>'+(p.skipped?.length?' &nbsp;&middot;&nbsp; <span style="color:#555">'+p.skipped.length+' satır atlandı</span>':'');
    db.classList.add('hidden');
    $('controlCard').classList.remove('hidden');
    $('actionRow').classList.remove('hidden');
  }else{
    sr.innerHTML='<span style="color:#ef5350">&#10007; Okunabilir kalem bulunamadı</span>';
    if(p.debug){db.textContent=p.debug;db.classList.remove('hidden')}
    $('controlCard').classList.add('hidden');
    $('actionRow').classList.add('hidden');
  }
}

// --- Controls ---
function clampInput(id){
  const el=$(id);
  const mn=parseFloat(el.min),mx=parseFloat(el.max);
  let v=parseFloat(el.value);
  if(isNaN(v))return;
  if(!isNaN(mn)&&v<mn){v=mn;el.value=v}
  if(!isNaN(mx)&&v>mx){v=mx;el.value=v}
}
function syncRange(ni,ri){clampInput(ni);$(ri).value=$(ni).value;updateLabels()}
function syncNum(ri,ni){$(ni).value=$(ri).value;updateLabels()}
function updateLabels(){
  $('lblTarget').textContent=$('targetPct').value+'%';
  $('lblMin').textContent=$('minDelta').value+'%';
  $('lblMax').textContent=$('maxDelta').value+'%';
  const mn=parseFloat($('minDelta').value),mx=parseFloat($('maxDelta').value);
  $('rangeWarn').classList.toggle('hidden',mn<mx);
  $('btnDist').disabled=mn>=mx;
}

// --- Distribution ---
function runDistribute(){
  const target=parseFloat($('targetPct').value)/100;
  const mn=parseFloat($('minDelta').value)/100;
  const mx=parseFloat($('maxDelta').value)/100;
  const step=parseFloat($('roundStep').value);
  if(mn>=mx||!parsedItems.length)return;
  const result=distribute(parsedItems,target,mn,mx,step);
  lastResult=result.rows;
  const warnEl=$('distWarn');
  if(result.warning){warnEl.innerHTML='&#9888; '+esc(result.warning);warnEl.classList.remove('hidden')}
  else{warnEl.classList.add('hidden')}
  renderResults();
  $('btnReDist').classList.remove('hidden');
  $('bottomActions').classList.remove('hidden');
}

function renderResults(){
  const res=lastResult;
  const ot=res.reduce((s,it)=>s+it.tutar,0),nt=res.reduce((s,it)=>s+it.newTutar,0);
  const ap=(nt-ot)/ot,tg=parseFloat($('targetPct').value)/100;
  $('sOrig').textContent=fmt(ot)+' TL';
  $('sNew').textContent=fmt(nt)+' TL';
  const ae=$('sAch');ae.textContent=fmtPct(ap);ae.style.color=Math.abs(ap-tg)<0.005?'#4caf50':'#f0a500';
  $('sDiff').textContent='+'+fmt(nt-ot)+' TL';
  $('summaryCard').classList.remove('hidden');

  // Desktop table
  $('tableBody').innerHTML=res.map(it=>{
    const d=it.newTutar-it.tutar,cls=it.actualChange>0.001?'tag-pos':it.actualChange<-0.001?'tag-neg':'tag-neu';
    return '<tr><td style="color:#444">'+it.id+'</td><td style="color:#c0c0c0;min-width:240px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(it.name)+'">'+esc(it.name)+'</td><td style="color:#555">'+esc(it.birim)+'</td><td class="r" style="color:#888">'+it.qty+'</td><td class="r" style="color:#666">'+fmt(it.price)+'</td><td class="r" style="color:#fff;font-weight:600">'+fmt(it.newPrice)+'</td><td class="r"><span class="'+cls+'">'+fmtPct(it.actualChange)+'</span></td><td class="r" style="color:#555">'+fmt(it.tutar)+'</td><td class="r" style="color:#888">'+fmt(it.newTutar)+'</td><td class="r" style="color:'+(d>=0?'#4caf50':'#ef5350')+';font-size:12px">'+(d>=0?'+':'')+fmt(d)+'</td></tr>';
  }).join('');
  $('ftOrig').textContent=fmt(ot);
  $('ftNew').textContent=fmt(nt);
  $('ftDiff').textContent='+'+fmt(nt-ot);
  $('tableWrap').classList.remove('hidden');

  // Mobile cards
  const cl=$('cardList');
  cl.innerHTML=res.map(it=>{
    const d=it.newTutar-it.tutar,cls=it.actualChange>0.001?'tag-pos':it.actualChange<-0.001?'tag-neg':'tag-neu',dc=d>=0?'#4caf50':'#ef5350';
    return '<div class="item-card"><div class="item-card-top"><div class="item-name">'+esc(it.name)+'</div><div class="item-num">#'+it.id+'</div></div><div class="item-grid"><div><div class="f-lbl">Miktar / Birim</div><div class="f-val">'+it.qty+' '+esc(it.birim)+'</div></div><div><div class="f-lbl">Değişim</div><div class="f-val"><span class="'+cls+'">'+fmtPct(it.actualChange)+'</span></div></div><div><div class="f-lbl">Eski Fiyat</div><div class="f-val">'+fmt(it.price)+' TL</div></div><div><div class="f-lbl">Yeni Fiyat</div><div class="f-val accent">'+fmt(it.newPrice)+' TL</div></div></div><div class="item-footer"><div><div class="f-lbl">Eski Tutar</div><div class="f-val" style="color:#666">'+fmt(it.tutar)+' TL</div></div><div style="text-align:center"><div class="f-lbl">Yeni Tutar</div><div class="f-val" style="color:#aaa">'+fmt(it.newTutar)+' TL</div></div><div style="text-align:right"><div class="f-lbl">Fark</div><div class="f-val" style="color:'+dc+';font-weight:600">'+(d>=0?'+':'')+fmt(d)+' TL</div></div></div></div>';
  }).join('')+'<div class="card-footer"><div><div class="cf-label">Orijinal Toplam</div><div class="cf-val" style="color:#888">'+fmt(ot)+' TL</div></div><div style="text-align:center"><div class="cf-label">Yeni Toplam</div><div class="cf-val" style="color:#fff">'+fmt(nt)+' TL</div></div><div style="text-align:right"><div class="cf-label">Fark</div><div class="cf-val" style="color:#f0a500">+'+fmt(nt-ot)+' TL</div></div></div>';
  cl.classList.remove('hidden');
}

// --- Clipboard ---
function copyPrices(){
  if(!lastResult.length)return;
  const text=lastResult.map(it=>String(it.newPrice)).join('\n');
  const done=()=>showToast('Birim fiyatlar kopyalandı','success');
  const fail=()=>showToast('Kopyalama başarısız','error');
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>{try{fallbackCopy(text,done)}catch(e){fail()}});
  else{try{fallbackCopy(text,done)}catch(e){fail()}}
}
function fallbackCopy(text,done){
  const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);ta.focus();ta.select();
  var ok=false;
  try{ok=document.execCommand('copy')}catch(e){}
  document.body.removeChild(ta);
  if(ok)done();else throw new Error('copy failed');
}

// --- CSV export ---
function exportCSV(){
  if(!lastResult.length)return;
  var sep=';'; // Excel TR uses semicolon
  var hdr=['#','Ürün Adı','Birim','Miktar','Eski Fiyat','Yeni Fiyat','Değişim (%)','Eski Tutar','Yeni Tutar','Fark'].join(sep);
  var lines=lastResult.map(function(it){
    return [it.id,'"'+it.name.replace(/"/g,'""')+'"',it.birim,it.qty,
      it.price.toString().replace('.',','),
      it.newPrice.toString().replace('.',','),
      (it.actualChange*100).toFixed(1).replace('.',','),
      it.tutar.toString().replace('.',','),
      it.newTutar.toString().replace('.',','),
      (it.newTutar-it.tutar).toFixed(2).replace('.',',')
    ].join(sep);
  });
  var ot=lastResult.reduce(function(s,r){return s+r.tutar},0);
  var nt=lastResult.reduce(function(s,r){return s+r.newTutar},0);
  lines.push(['','TOPLAM','','','','','',ot.toFixed(2).replace('.',','),nt.toFixed(2).replace('.',','),(nt-ot).toFixed(2).replace('.',',')].join(sep));
  var bom='\uFEFF'; // UTF-8 BOM for Excel
  var csv=bom+hdr+'\r\n'+lines.join('\r\n')+'\r\n';
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  var sheetName=$('sheetSelect').value||'sonuc';
  var date=new Date().toISOString().slice(0,10);
  a.href=url;a.download='fiyat-dagitim_'+sheetName+'_'+date+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV indirildi','success');
}

// --- XLSX export (uses the same SheetJS library already loaded for reading) ---
function exportXLSX(){
  if(!lastResult.length)return;
  var header=['#','Ürün Adı','Birim','Miktar','Eski Fiyat','Yeni Fiyat','Değişim (%)','Eski Tutar','Yeni Tutar','Fark'];
  var aoa=[header];
  lastResult.forEach(function(it){
    aoa.push([
      it.id,
      it.name,
      it.birim,
      it.qty,
      it.price,
      it.newPrice,
      Math.round(it.actualChange*1000)/1000, // keep as number, format below
      it.tutar,
      it.newTutar,
      Math.round((it.newTutar-it.tutar)*100)/100
    ]);
  });
  var ot=lastResult.reduce(function(s,r){return s+r.tutar},0);
  var nt=lastResult.reduce(function(s,r){return s+r.newTutar},0);
  aoa.push(['','TOPLAM','','','','','',ot,nt,Math.round((nt-ot)*100)/100]);

  var ws=XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols']=[
    {wch:4},{wch:36},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14}
  ];

  // Number formats for data rows (row 2 to n+1, 0-indexed row 1 to n)
  var fmtMoney='#,##0.00';
  var fmtPctXl='0.0%';
  for(var r=1;r<=lastResult.length;r++){
    // Eski Fiyat (col 4), Yeni Fiyat (col 5)
    setCellFmt(ws,r,4,fmtMoney);
    setCellFmt(ws,r,5,fmtMoney);
    // Değişim as percentage
    setCellFmt(ws,r,6,fmtPctXl);
    // Eski Tutar (col 7), Yeni Tutar (col 8), Fark (col 9)
    setCellFmt(ws,r,7,fmtMoney);
    setCellFmt(ws,r,8,fmtMoney);
    setCellFmt(ws,r,9,fmtMoney);
  }
  // TOPLAM row
  var tr=lastResult.length+1;
  setCellFmt(ws,tr,7,fmtMoney);
  setCellFmt(ws,tr,8,fmtMoney);
  setCellFmt(ws,tr,9,fmtMoney);

  var sheetName=$('sheetSelect').value||'Sonuç';
  // Sheet name max 31 chars, no invalid chars
  var safeSheet=sheetName.replace(/[\\\/\?\*\[\]:]/g,'').substring(0,31)||'Sonuç';
  var wbOut=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut,ws,safeSheet);

  var date=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wbOut,'fiyat-dagitim_'+safeSheet+'_'+date+'.xlsx');
  showToast('Excel dosyası indirildi','success');
}
function setCellFmt(ws,r,c,fmt){
  var addr=XLSX.utils.encode_cell({r:r,c:c});
  if(ws[addr])ws[addr].z=fmt;
}

// --- State management ---
function clearResults(){
  lastResult=[];
  ['summaryCard','tableWrap','cardList','btnReDist','bottomActions','distWarn'].forEach(id=>$(id).classList.add('hidden'));
}
function resetAll(){
  wb=null;parsedItems=[];clearResults();
  $('dropZone').classList.remove('hidden');
  ['btnReset','sheetCard','controlCard','actionRow'].forEach(id=>$(id).classList.add('hidden'));
  $('fileInput').value='';setError('');
}
function setError(msg){const el=$('errorBox');el.innerHTML=msg?'&#9888; '+esc(msg):'';el.classList.toggle('hidden',!msg)}

// --- Event binding (replaces inline handlers) ---
$('fileInput').addEventListener('change', onFileChange);
$('dropZone').addEventListener('click', ()=>$('fileInput').click());
$('dropZone').addEventListener('dragover', onDragOver);
$('dropZone').addEventListener('dragleave', onDragLeave);
$('dropZone').addEventListener('drop', onDrop);
$('sheetSelect').addEventListener('change', onSheetChange);
$('targetPct').addEventListener('input', ()=>syncRange('targetPct','rangeTarget'));
$('rangeTarget').addEventListener('input', ()=>syncNum('rangeTarget','targetPct'));
$('minDelta').addEventListener('input', ()=>syncRange('minDelta','rangeMin'));
$('rangeMin').addEventListener('input', ()=>syncNum('rangeMin','minDelta'));
$('maxDelta').addEventListener('input', ()=>syncRange('maxDelta','rangeMax'));
$('rangeMax').addEventListener('input', ()=>syncNum('rangeMax','maxDelta'));
$('btnDist').addEventListener('click', runDistribute);
$('btnReDist').addEventListener('click', runDistribute);
$('btnReset').addEventListener('click', resetAll);
$('btnCopy').addEventListener('click', copyPrices);
$('btnExport').addEventListener('click', exportCSV);
$('btnExportXlsx').addEventListener('click', exportXLSX);

// --- Settings persistence (localStorage) ---
var SETTINGS_KEY='fda_settings';
var DEFAULTS={targetPct:'10',minDelta:'-5',maxDelta:'25',roundStep:'1'};
function saveSettings(){
  try{
    var s={targetPct:$('targetPct').value,minDelta:$('minDelta').value,maxDelta:$('maxDelta').value,roundStep:$('roundStep').value};
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));
  }catch(e){}
}
function loadSettings(){
  try{
    var raw=localStorage.getItem(SETTINGS_KEY);
    if(!raw)return;
    var s=JSON.parse(raw);
    if(typeof s!=='object'||!s)return;
    var tp=parseFloat(s.targetPct),mn=parseFloat(s.minDelta),mx=parseFloat(s.maxDelta);
    if(!isNaN(tp)&&tp>=0&&tp<=50){$('targetPct').value=s.targetPct;$('rangeTarget').value=s.targetPct}
    if(!isNaN(mn)&&mn>=-50&&mn<=0){$('minDelta').value=s.minDelta;$('rangeMin').value=s.minDelta}
    if(!isNaN(mx)&&mx>=0&&mx<=100){$('maxDelta').value=s.maxDelta;$('rangeMax').value=s.maxDelta}
    if(s.roundStep){var opt=$('roundStep').querySelector('option[value="'+s.roundStep+'"]');if(opt)$('roundStep').value=s.roundStep}
  }catch(e){localStorage.removeItem(SETTINGS_KEY)}
}
function resetSettings(){
  localStorage.removeItem(SETTINGS_KEY);
  $('targetPct').value=DEFAULTS.targetPct;$('rangeTarget').value=DEFAULTS.targetPct;
  $('minDelta').value=DEFAULTS.minDelta;$('rangeMin').value=DEFAULTS.minDelta;
  $('maxDelta').value=DEFAULTS.maxDelta;$('rangeMax').value=DEFAULTS.maxDelta;
  $('roundStep').value=DEFAULTS.roundStep;
  updateLabels();
  clearPresetSelection();
  showToast('Ayarlar sıfırlandı','info');
}

// --- Preset / Profil sistemi ---
var PRESETS_KEY='fda_presets';
var ACTIVE_PRESET_KEY='fda_active_preset';
var BUILTIN_PRESETS=[
  {id:'builtin_default',name:'Varsayılan',isBuiltin:true,settings:{targetPct:'10',minDelta:'-5',maxDelta:'25',roundStep:'1'}},
  {id:'builtin_narrow',name:'Dar Aralık',isBuiltin:true,settings:{targetPct:'5',minDelta:'-2',maxDelta:'8',roundStep:'1'}},
  {id:'builtin_wide',name:'Geniş Aralık',isBuiltin:true,settings:{targetPct:'15',minDelta:'-20',maxDelta:'40',roundStep:'1'}}
];
function loadUserPresets(){
  try{
    var raw=localStorage.getItem(PRESETS_KEY);
    if(!raw)return[];
    var arr=JSON.parse(raw);
    if(!Array.isArray(arr))throw new Error('not array');
    return arr.filter(function(p){return p&&p.id&&p.name&&p.settings});
  }catch(e){localStorage.removeItem(PRESETS_KEY);showToast('Profil verisi bozuk, sıfırlandı','error');return[]}
}
function saveUserPresets(presets){
  try{localStorage.setItem(PRESETS_KEY,JSON.stringify(presets));return true}catch(e){showToast('Profiller kaydedilemedi','error');return false}
}
function getAllPresets(){return BUILTIN_PRESETS.concat(loadUserPresets())}
function getActivePresetId(){return localStorage.getItem(ACTIVE_PRESET_KEY)||''}
function setActivePresetId(id){try{if(id)localStorage.setItem(ACTIVE_PRESET_KEY,id);else localStorage.removeItem(ACTIVE_PRESET_KEY)}catch(e){}}

function renderPresetDropdown(){
  var sel=$('presetSelect');
  var all=getAllPresets();
  var activeId=getActivePresetId();
  var userPresets=loadUserPresets();
  var html='<option value="">\u2014 Profil se\u00e7 \u2014</option>';
  html+='<optgroup label="Haz\u0131r">';
  BUILTIN_PRESETS.forEach(function(p){html+='<option value="'+p.id+'">'+esc(p.name)+'</option>'});
  html+='</optgroup>';
  if(userPresets.length){
    html+='<optgroup label="\u00d6zel">';
    userPresets.forEach(function(p){
      var display=p.name.length>40?p.name.substring(0,37)+'...':p.name;
      html+='<option value="'+p.id+'">'+esc(display)+'</option>';
    });
    html+='</optgroup>';
  }
  sel.innerHTML=html;
  // Restore active preset if still exists
  if(activeId){
    var exists=all.some(function(p){return p.id===activeId});
    if(exists)sel.value=activeId;else setActivePresetId('');
  }
  updateDeleteButton();
}
function applySettings(s){
  $('targetPct').value=s.targetPct;$('rangeTarget').value=s.targetPct;
  $('minDelta').value=s.minDelta;$('rangeMin').value=s.minDelta;
  $('maxDelta').value=s.maxDelta;$('rangeMax').value=s.maxDelta;
  if(s.roundStep){var opt=$('roundStep').querySelector('option[value="'+s.roundStep+'"]');if(opt)$('roundStep').value=s.roundStep}
  updateLabels();
  saveSettings();
}
function applyPreset(id){
  var all=getAllPresets();
  var p=null;
  for(var i=0;i<all.length;i++){if(all[i].id===id){p=all[i];break}}
  if(!p)return;
  applySettings(p.settings);
  setActivePresetId(id);
  updateDeleteButton();
}
function onPresetChange(){
  var id=$('presetSelect').value;
  if(!id){setActivePresetId('');updateDeleteButton();return}
  applyPreset(id);
}
function onSavePreset(){
  var selId=$('presetSelect').value;
  var userPresets=loadUserPresets();
  var isUserPreset=selId&&userPresets.some(function(p){return p.id===selId});
  var currentSettings={targetPct:$('targetPct').value,minDelta:$('minDelta').value,maxDelta:$('maxDelta').value,roundStep:$('roundStep').value};

  if(isUserPreset){
    // Overwrite existing user preset
    var existing=null;
    for(var i=0;i<userPresets.length;i++){if(userPresets[i].id===selId){existing=userPresets[i];break}}
    if(!existing)return;
    if(!confirm('"'+existing.name+'" profilinin üzerine yazılsın mı?'))return;
    existing.settings=currentSettings;
    if(!saveUserPresets(userPresets))return;
    setActivePresetId(selId);
    showToast('Profil güncellendi','success');
  }else{
    // Create new preset
    var name=prompt('Profil adı:');
    if(!name||!name.trim()){if(name!==null)showToast('Profil adı boş olamaz','error');return}
    name=name.trim();
    var newPreset={id:'preset_'+Date.now(),name:name,isBuiltin:false,settings:currentSettings};
    userPresets.push(newPreset);
    if(!saveUserPresets(userPresets))return;
    renderPresetDropdown();
    $('presetSelect').value=newPreset.id;
    setActivePresetId(newPreset.id);
    updateDeleteButton();
    showToast('"'+name+'" kaydedildi','success');
  }
}
function onDeletePreset(){
  var selId=$('presetSelect').value;
  if(!selId)return;
  var userPresets=loadUserPresets();
  var idx=-1;
  for(var i=0;i<userPresets.length;i++){if(userPresets[i].id===selId){idx=i;break}}
  if(idx<0)return; // builtin or not found
  if(!confirm('"'+userPresets[idx].name+'" profili silinsin mi?'))return;
  userPresets.splice(idx,1);
  if(!saveUserPresets(userPresets))return;
  setActivePresetId('');
  renderPresetDropdown();
  showToast('Profil silindi','info');
}
function clearPresetSelection(){
  $('presetSelect').value='';
  setActivePresetId('');
  updateDeleteButton();
}
function updateDeleteButton(){
  var selId=$('presetSelect').value;
  var userPresets=loadUserPresets();
  var isUser=selId&&userPresets.some(function(p){return p.id===selId});
  $('btnDeletePreset').style.display=isUser?'inline-block':'none';
}

// Save on every parameter change + clear preset selection on manual change
['targetPct','minDelta','maxDelta','roundStep'].forEach(function(id){
  $(id).addEventListener('change',function(){saveSettings();clearPresetSelection()});
});
// Range sliders: programmatic .value= doesn't fire events, so these only fire on user drag
['rangeTarget','rangeMin','rangeMax'].forEach(function(id){
  $(id).addEventListener('change',function(){saveSettings();clearPresetSelection()});
});
$('btnResetSettings').addEventListener('click', resetSettings);
$('presetSelect').addEventListener('change', onPresetChange);
$('btnSavePreset').addEventListener('click', onSavePreset);
$('btnDeletePreset').addEventListener('click', onDeletePreset);

loadSettings();
updateLabels();
renderPresetDropdown();
