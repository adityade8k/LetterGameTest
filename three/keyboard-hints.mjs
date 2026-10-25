// Show keyboard hints only when a desktop-style pointing device is available.
// Touchscreen laptops still qualify through any-pointer/any-hover media queries.
export function keyboardHints({platform='',userAgent='',maxTouchPoints=0,coarsePointer=false,finePointer=false,hover=false}={}) {
  const os=String(platform),agent=String(userAgent);
  const mobile=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(agent)
    || /iPhone|iPad|iPod|Android/i.test(os)
    || (/Mac/i.test(os)&&Number(maxTouchPoints)>1);
  if(mobile||!finePointer||!hover)return null;
  // A coarse primary pointer can coexist with a mouse on touchscreen laptops.
  const mac=/Mac/i.test(os)||(!os&&/Macintosh|Mac OS X/i.test(agent));
  return {submit:mac?'Return':'Enter',clear:mac?'Delete':'Backspace'};
}
