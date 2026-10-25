import React,{useEffect,useState} from 'react';
import Planner from './Planner';
export default function App(){
 const [route,setRoute]=useState(location.hash);
 useEffect(()=>{const changed=()=>setRoute(location.hash);addEventListener('hashchange',changed);return()=>removeEventListener('hashchange',changed);},[]);
 const admin=route.replace(/^#\/?/,'').startsWith('admin')||/\/admin\/?$/.test(location.pathname);
 return <Planner key={admin?'admin':'team'} admin={admin}/>;
}
