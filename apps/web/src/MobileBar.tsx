import {useEffect,useState} from 'react';
import {Logo} from './brand';

/** Phone-width navigation for the portal and the demo: a top bar with a menu button (top left) that slides the sidebar in as a drawer.
 * The drawer closes on navigation (`closeOn` changes), on the backdrop, or with Escape. Above 760px the sidebar shows as usual. */
export function useDrawer(closeOn:unknown){
  const[open,setOpen]=useState(false);
  const[seen,setSeen]=useState(closeOn);if(seen!==closeOn){setSeen(closeOn);setOpen(false)}
  useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};addEventListener('keydown',key);document.body.classList.add('drawer-open');
    return()=>{removeEventListener('keydown',key);document.body.classList.remove('drawer-open')}},[open]);
  return{open,setOpen};
}

export function MobileBar({open,setOpen,title}:{open:boolean;setOpen:(open:boolean)=>void;title:string}){
  return <>
    <header className="mobilebar">
      <button type="button" className="menubtn" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} aria-controls="portal-nav" onClick={()=>setOpen(!open)}><i/><i/><i/></button>
      <Logo/><span className="mobilebar-title">{title}</span>
    </header>
    {open&&<div className="scrim" onClick={()=>setOpen(false)}/>}
  </>
}
