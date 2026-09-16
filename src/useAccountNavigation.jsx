import {useEffect,useState} from 'react';
export function isAccountPath(path) {
  return /^\/admin(?:\/|$)/.test(path) || /^\/account\/notifications(?:\/|$)/.test(path);
}
export function useAccountNavigation() {
  const [route,setRoute]=useState(()=>location.pathname+location.search);
  function navigate(path) {
    history.pushState(null,'',path);
    setRoute(location.pathname+location.search);
    window.scrollTo(0,0);
  }
  useEffect(()=>{
    const back=()=>setRoute(location.pathname+location.search);
    const click=(event)=>{
      const link=event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
      const url=new URL(link.href);
      if(url.origin!==location.origin || url.hash || !isAccountPath(location.pathname) || !isAccountPath(url.pathname)) return;
      event.preventDefault(); navigate(url.pathname+url.search);
    };
    window.addEventListener('popstate',back);document.addEventListener('click',click);
    return()=>{window.removeEventListener('popstate',back);document.removeEventListener('click',click);};
  },[]);
  return {route,navigate};
}
