"use client";
import {useState} from "react";
import {IconSearch} from "./icons";

export default function DataModule({title,subtitle,columns,rows,onRow}:{title:string;subtitle:string;columns:string[];rows:(string|number)[][];onRow?:(index:number)=>void}){
 const[q,setQ]=useState("");
 const visible=rows.map((row,index)=>({row,index})).filter(({row})=>row.join(" ").toLowerCase().includes(q.toLowerCase()));
 const caseCol=columns.findIndex(c=>c.toUpperCase()==="CASO");
 return <div className="module"><section className="module-hero"><div><p className="eyebrow">CENTRO DE OPERACIONES</p><h2>{title}</h2><p>{subtitle}</p></div><span className="record-count">{rows.length} registros</span></section><section className="panel"><div className="toolbar"><label><IconSearch size={16}/><input aria-label={`Buscar en ${title}`} value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nombre, caso o estado…"/></label></div><div className="table-wrap module-table"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{visible.map(({row,index})=><tr key={index} className={onRow?"clickable-row":undefined} onClick={()=>onRow?.(index)} tabIndex={onRow?0:undefined} onKeyDown={e=>{if(onRow&&(e.key==="Enter"||e.key===" "))onRow(index)}}>{row.map((x,j)=><td key={j}>{j===caseCol?<span className="case-id">{x}</span>:j===0?<b>{x}</b>:x}{j===0&&onRow&&<span className="open-file">Ver ficha →</span>}</td>)}</tr>)}</tbody></table>{!visible.length&&<p className="empty-row">No hay resultados.</p>}</div></section></div>
}

