exports.handler = async (event) => {
 const code=(event.queryStringParameters?.ean||'').trim();
 if(!/^\d{8,14}$/.test(code)) return {statusCode:400,body:JSON.stringify({error:'Wpisz kod EAN/UPC (8–14 cyfr).' })};
 try {
  const u=`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=code,product_name,brands,quantity,nutriments`;
  const r=await fetch(u,{headers:{'User-Agent':'MojDziennikResearch/0.1 (research; contact via site owner)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok) return {statusCode:502,body:JSON.stringify({error:`Open Food Facts HTTP ${r.status}`})};
  const j=await r.json();const p=j.product||{};const n=p.nutriments||{};
  const val=(k)=>Number.isFinite(Number(n[k]))&&n[k]!==undefined&&n[k]!==null?Number(n[k]):null;
  const result={ean:code,found:!!j.product,name:p.product_name||'',brand:p.brands||'',quantity:p.quantity||'',kcal:val('energy-kcal_100g'),protein:val('proteins_100g'),fat:val('fat_100g'),carbs:val('carbohydrates_100g'),source:'Open Food Facts',url:`https://world.openfoodfacts.org/product/${code}`};
  result.complete=result.found&&[result.kcal,result.protein,result.fat,result.carbs].every(x=>x!==null);
  return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=300'},body:JSON.stringify(result)};
 } catch(e){return {statusCode:502,body:JSON.stringify({error:'Nie udało się połączyć z Open Food Facts: '+e.message})};}
};
