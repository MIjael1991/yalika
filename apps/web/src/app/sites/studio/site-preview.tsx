'use client';
import {useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {SiteView,type StoreData} from '../../s/[slug]/site-view';
export function SitePreview({data,mobile}:{data:StoreData;mobile:boolean}){
 const ref=useRef<HTMLIFrameElement>(null),[target,setTarget]=useState<HTMLElement|null>(null);
 function load(){const doc=ref.current?.contentDocument;if(!doc)return;
  document.querySelectorAll('link[rel="stylesheet"],style').forEach(node=>doc.head.appendChild(node.cloneNode(true)));
  setTarget(doc.body);
 }
 return <><iframe title="Vista previa del borrador, sin publicar" ref={ref} onLoad={load} sandbox="allow-same-origin" srcDoc={'<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'} style={{width:mobile?'390px':'100%',maxWidth:'100%',height:'70vh',border:0,margin:'auto',display:'block'}} />{target&&createPortal(<div inert><SiteView {...data}/></div>,target)}</>;
}
