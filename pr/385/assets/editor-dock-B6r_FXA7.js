import{t as e}from"./tokens-DfHTI-_q.js";var t=[{id:`rooms`,label:`🚪 Rooms`,src:`editor.html`},{id:`sprites`,label:`🎨 Sprites`,src:`pixel-editor.html`},{id:`audio`,label:`🎵 Audio`,src:`audio-editor.html`}],n=480,r=280,i=320,a=6,o=`
/* Top-left is the one corner nothing else claims: seed-control and
   projectile-tag-chooser sit top-right, tuning-window sits bottom-right, and
   the accessibility panel sits bottom-left — this button ships in every
   build, dev tools present or not, so it can't share a spot with a
   dev-only one without the two overlapping. */
#dock-toggle {
  position: fixed; top: 10px; left: 10px; z-index: 20;
  display: flex; gap: 6px; font: 12px var(--kb-font-mono, monospace);
}
#dock-toggle button {
  font: inherit; color: var(--kb-color-text, #cfc6bb);
  background: var(--kb-color-surface-3, rgba(20, 16, 26, 0.85));
  border: 1px solid var(--kb-color-surface-4, #54445f);
  border-radius: var(--kb-radius-sm, 3px);
  padding: 5px 9px; cursor: pointer;
}
#dock-toggle button:hover { background: var(--kb-color-surface-3-hover, #2f2636); }
#dock-toggle button.kb-dock-active {
  background: var(--kb-color-accent, #f0c46a); color: var(--kb-color-surface-1, #14101a);
  border-color: var(--kb-color-accent, #f0c46a);
}
/*
 * The debug overlay's dev-only DOM tools (tuning-window,
 * projectile-tag-chooser) are all fixed-position at z-index 30, unaware that
 * a docked panel now shares the viewport with them — without their own
 * stacking context, a plain flex sibling would fall behind them regardless
 * of DOM order once any of those tools happens to render at the same screen
 * position. Both the divider and the panel get their own stacking context at
 * a higher z-index so the docked editor is never partly hidden behind one.
 */
#dock-divider {
  position: relative; z-index: 40;
  flex: 0 0 ${String(a)}px; cursor: col-resize;
  background: var(--kb-color-surface-4, #3d3348);
}
#dock-divider:hover, #dock-divider.kb-dock-dragging { background: var(--kb-color-accent, #f0c46a); }
#dock-panel {
  position: relative; z-index: 40;
  flex: 0 0 auto; height: 100%; overflow: hidden; background: #14101a;
}
#dock-panel iframe { width: 100%; height: 100%; border: 0; display: block; }
`;function s(s,c={}){e();let l=document.createElement(`style`);l.textContent=o,document.head.appendChild(l);let u=document.createElement(`div`);u.id=`dock-toggle`,document.body.appendChild(u);let d=new Map;for(let e of t){let t=document.createElement(`button`);t.type=`button`,t.textContent=e.label,t.addEventListener(`click`,()=>{b(e)}),d.set(e.id,t),u.appendChild(t)}let f=null,p=null,m=null,h=null,g=n;function _(){for(let[e,t]of d)t.classList.toggle(`kb-dock-active`,e===h)}function v(e){let t=p===null;p===null&&(f=document.createElement(`div`),f.id=`dock-divider`,f.addEventListener(`pointerdown`,x),p=document.createElement(`div`),p.id=`dock-panel`,m=document.createElement(`iframe`),p.appendChild(m),s.append(f,p)),p.style.width=`${String(g)}px`,m!==null&&h!==e.id&&(m.src=e.src),h=e.id,_(),t&&c.onOpen?.()}function y(){f?.remove(),p?.remove(),f=null,p=null,m=null,h=null,_(),c.onClose?.()}function b(e){if(h===e.id){y();return}v(e)}function x(e){if(f===null||p===null)return;f.setPointerCapture(e.pointerId),f.classList.add(`kb-dock-dragging`);let t=e=>{let t=s.getBoundingClientRect().width,n=t-e.clientX,o=Math.max(r,t-i-a);g=Math.min(o,Math.max(r,n)),p!==null&&(p.style.width=`${String(g)}px`)},n=()=>{f?.classList.remove(`kb-dock-dragging`),window.removeEventListener(`pointermove`,t),window.removeEventListener(`pointerup`,n)};window.addEventListener(`pointermove`,t),window.addEventListener(`pointerup`,n)}return{destroy(){y(),u.remove(),l.remove()},activeEditorId(){return h},postToActive(e){let t=m?.contentWindow;return t==null||h===null?!1:(t.postMessage(e,`*`),!0)}}}export{s as createEditorDock};
//# sourceMappingURL=editor-dock-B6r_FXA7.js.map