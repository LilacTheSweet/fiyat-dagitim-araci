// pricing-engine.js — Saf numerik motor (DOM bağımsız)
// KRİTİK: Bu dosyadaki fonksiyonlar 2600 simülasyonla doğrulanmıştır.
// distribute() ve bound hesaplarını davranışsal olarak DEĞİŞTİRME.
//
// Kullanım:
//   Tarayıcıda: <script src="pricing-engine.js"> → window.PricingEngine.*
//   Node testlerinde: globalThis.PricingEngine.*
(function(root){
'use strict';

function roundTo(v,s){return Math.round(v/s)*s}
function floorTo(v,s){return Math.floor(v/s)*s}
function ceilTo(v,s){return Math.ceil(v/s)*s}
function fp(v){return Math.round(v*1e10)/1e10} // float precision fix

function distribute(items,targetPct,minPct,maxPct,roundStep){
  const tot=items.reduce((s,it)=>s+it.price*it.qty,0);
  if(!tot)return{rows:items.map(it=>({...it,newPrice:it.price,actualChange:0,tutar:0,newTutar:0})),warning:null};
  const n=items.length;
  const w=i=>items[i].price*items[i].qty;
  const wavg=()=>items.reduce((s,_,i)=>s+w(i)*ch[i],0)/tot;

  // 1. Her kaleme [minPct, maxPct] aralığında uniform rastgele yüzde ata
  const range=maxPct-minPct;
  let ch=items.map(()=>minPct+Math.random()*range);

  // 2. Ağırlıklı ortalamayı targetPct'ye shift et
  const shift=targetPct-wavg();
  ch=ch.map(c=>c+shift);

  // 3. Klipleme + yeniden dağıtım (iteratif)
  for(let pass=0;pass<30;pass++){
    let clipped=false;
    ch=ch.map(c=>{
      if(c<minPct){clipped=true;return minPct}
      if(c>maxPct){clipped=true;return maxPct}
      return c;
    });
    if(!clipped)break;
    const gap=targetPct-wavg();
    if(Math.abs(gap)<0.0001)break;
    const free=[];
    for(let i=0;i<n;i++){
      if(gap>0&&ch[i]<maxPct-1e-9)free.push(i);
      else if(gap<0&&ch[i]>minPct+1e-9)free.push(i);
    }
    const freeW=free.reduce((s,i)=>s+w(i),0);
    if(freeW<1e-9)break;
    const adj=gap*tot/freeW;
    free.forEach(i=>{ch[i]+=adj});
  }

  // 4. 0'a çok yakın olanları kaydır
  ch=ch.map(c=>{
    if(c>-0.003&&c<0.003)return c>=0?0.005:-0.005;
    return c;
  });

  // absMin: minPct sınırını AŞMAYACAK şekilde yukarı yuvarla (ceil)
  // absMax: maxPct sınırını AŞMAYACAK şekilde aşağı yuvarla (floor)
  function getAbsMin(price){return Math.max(roundStep, fp(ceilTo(price*(1+minPct),roundStep)))}
  function getAbsMax(price){return fp(floorTo(price*(1+maxPct),roundStep))}

  // 5. Yuvarlama + orijinal fiyata eşit kalmama garantisi
  const rows=items.map((it,i)=>{
    let np=fp(roundTo(it.price*(1+ch[i]),roundStep));
    let absMin=getAbsMin(it.price);
    let absMax=getAbsMax(it.price);

    // Edge case: roundStep fiyata göre çok büyükse, geçerli aralık olmayabilir
    if(absMax<roundStep)absMax=roundStep;
    if(absMin>absMax){const t=absMin;absMin=absMax;absMax=t}

    // Sınırlar içinde tut
    np=Math.max(absMin,Math.min(absMax,np));

    if(np===it.price){
      if(ch[i]>=0){
        const up=fp(it.price+roundStep);
        np=(up<=absMax)?up:absMax;
      }else{
        const down=fp(it.price-roundStep);
        np=(down>=absMin&&down>0)?down:((fp(it.price+roundStep)<=absMax)?fp(it.price+roundStep):absMax);
      }
    }

    return{...it,newPrice:np,actualChange:(np-it.price)/it.price,tutar:it.price*it.qty,newTutar:fp(np*it.qty)};
  });

  // 6. Yuvarlama sonrası correction — yön korunarak
  const targetTotal=tot*(1+targetPct);
  for(let pass=0;pass<15;pass++){
    const curTotal=rows.reduce((s,r)=>s+r.newTutar,0);
    const gap=targetTotal-curTotal;
    if(Math.abs(gap)<roundStep*0.5)break;

    const adjustable=rows.map((r,i)=>{
      let absMin=getAbsMin(items[i].price);
      let absMax=getAbsMax(items[i].price);
      if(absMax<roundStep)absMax=roundStep;
      if(absMin>absMax){const t=absMin;absMin=absMax;absMax=t}
      let floor,ceil;
      if(r.newPrice>items[i].price){
        floor=fp(items[i].price+roundStep);
        if(floor>absMax)floor=absMax;
        ceil=absMax;
      }else if(r.newPrice<items[i].price){
        floor=absMin;
        ceil=fp(items[i].price-roundStep);
        if(ceil<absMin)ceil=absMin;
      }else{
        return null; // orijinal fiyatta — ayarlanamaz
      }
      if(floor>ceil)return null;
      const room=gap>0?(ceil-r.newPrice):(r.newPrice-floor);
      return{idx:i,room,qty:r.qty,floor,ceil};
    }).filter(a=>a&&a.room>roundStep*0.1);
    if(!adjustable.length)break;

    const totalRoom=adjustable.reduce((s,a)=>s+a.room*a.qty,0);
    if(totalRoom<1e-9)break;
    for(const a of adjustable){
      const share=(a.room*a.qty/totalRoom)*gap;
      const steps=Math.round(share/(a.qty*roundStep));
      if(steps===0)continue;
      const r=rows[a.idx];
      r.newPrice=fp(Math.max(a.floor,Math.min(a.ceil,fp(r.newPrice+steps*roundStep))));
      if(r.newPrice===items[a.idx].price){
        r.newPrice=gap>0?Math.min(a.ceil,fp(r.newPrice+roundStep)):Math.max(a.floor,fp(r.newPrice-roundStep));
      }
      r.actualChange=(r.newPrice-items[a.idx].price)/items[a.idx].price;
      r.newTutar=fp(r.newPrice*r.qty);
    }
  }

  // 7. Hedefe ulaşılıp ulaşılmadığını kontrol et
  const finalTotal=rows.reduce((s,r)=>s+r.newTutar,0);
  const achievedPct=(finalTotal-tot)/tot;
  let warning=null;
  if(Math.abs(achievedPct-targetPct)>=0.005){
    warning='Yuvarlama ve sınır kısıtları nedeniyle hedefe tam ulaşılamadı. Gerçekleşen: '+(achievedPct>=0?'+':'')+(achievedPct*100).toFixed(1)+'% (Hedef: '+(targetPct>=0?'+':'')+(targetPct*100).toFixed(1)+'%)';
  }

  return{rows,warning};
}

root.PricingEngine={roundTo,floorTo,ceilTo,fp,distribute};
})(typeof globalThis!=='undefined'?globalThis:typeof window!=='undefined'?window:this);
