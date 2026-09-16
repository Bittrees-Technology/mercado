import {useEffect,useState} from 'react';
export function useAppearance(user,setUser,api) {
  const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  const [saving,setSaving]=useState(false),[themeError,setThemeError]=useState('');
  function apply(value){setTheme(value);document.documentElement.dataset.theme=value;try{localStorage.setItem('mercado-appearance-choice',value);}catch{}}
  useEffect(()=>{if(user?.theme)apply(user.theme);},[user?.identity,user?.theme]);
  async function changeTheme(value){
    if(saving || !['dark','light'].includes(value))return;
    const previous=theme;apply(value);setThemeError('');
    if(!user)return;
    setSaving(true);
    try{await api('preferences',{theme:value});setUser(current=>current?.identity===user.identity?{...current,theme:value}:current);}
    catch(e){apply(previous);setThemeError('Appearance could not be saved. Please try again.');}
    finally{setSaving(false);}
  }
  return {theme,changeTheme,saving,themeError};
}
