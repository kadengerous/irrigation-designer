const SCOPE='.app-shell,.layer-color-popover,.layer-details-dialog,.grid-step-pop';
const EDITABLE='input,textarea,[contenteditable]:not([contenteditable="false"]),[data-allow-selection]';
function elementOf(node:Node|null):Element|null {
 return node?.nodeType===1?node as Element:node?.parentElement??null;
}
function protectedElement(node:Node|null) {
 const element=elementOf(node);
 return Boolean(element?.closest(SCOPE)&&!element.closest(EDITABLE));
}

/** Safari can select SVG icons and panel headings during a held touch/drag.
 * Only cancel native selection; canvas gestures, scrolling and editing stay native. */
export function installDesignerSelectionGuard(doc:Document) {
 const selectStart=(event:Event)=>{if(protectedElement(event.target as Node|null))event.preventDefault();};
 const clearStaleSelection=(event:Event)=>{
  if(!protectedElement(event.target as Node|null))return;
  const selection=doc.getSelection();
  if(selection&&!selection.isCollapsed&&(protectedElement(selection.anchorNode)||protectedElement(selection.focusNode)))selection.removeAllRanges();
 };
 doc.addEventListener('selectstart',selectStart,true);
 doc.addEventListener('pointerdown',clearStaleSelection,true);
 return ()=>{
  doc.removeEventListener('selectstart',selectStart,true);
  doc.removeEventListener('pointerdown',clearStaleSelection,true);
 };
}
