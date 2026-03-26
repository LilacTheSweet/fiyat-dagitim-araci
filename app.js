// app.js — DOM/UI katmanı
// pricing-engine.js <script> olarak index.html'de bu dosyadan ÖNCE yüklenir
var distribute = PricingEngine.distribute;

var wb=null,parsedItems=[],lastResult=[];

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
  $('btnCopy').textContent='📋 Kopyala';
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
  const btn=$('btnCopy');
  const done=()=>{btn.textContent='✓ Kopyalandı';setTimeout(()=>{btn.textContent='📋 Kopyala'},2500)};
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  else fallbackCopy(text,done);
}
function fallbackCopy(text,done){
  const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');done()}catch(e){}
  document.body.removeChild(ta);
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

updateLabels();
