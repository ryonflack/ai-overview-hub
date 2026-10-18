/** Conversion events for Google Tag Manager (GTM-PNVSKJTR, loaded in index.html). Events go to window.dataLayer; set up GTM
 * triggers on the event names (`sign_up`, `purchase`). `trackOnce` remembers what it sent in this browser, so reloading a
 * confirmation page never reports the same conversion twice. */
type Layer=Record<string,unknown>[];
const layer=()=>{const w=window as unknown as {dataLayer?:Layer};return(w.dataLayer??=[])};

export function track(event:string,data:Record<string,unknown>={}){
  // GA4 ecommerce events replace the previous ecommerce object, so clear it first as Google recommends.
  if('ecommerce' in data)layer().push({ecommerce:null});
  layer().push({event,...data});
}

export function trackOnce(key:string,event:string,data:Record<string,unknown>={}){
  const id=`aoh.tracked.${key}`;
  try{if(localStorage.getItem(id))return;localStorage.setItem(id,new Date().toISOString())}catch{/* storage unavailable: send anyway */}
  track(event,data);
}
