"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type Est = "nuevo"|"abierto"|"pendiente"|"resuelto"|"cerrado";
type Pri = "baja"|"media"|"alta"|"urgente";
const priT:Record<Pri,"exito"|"aviso"|"critico"|"senal">={baja:"senal",media:"senal",alta:"aviso",urgente:"critico"};
const estT:Record<Est,"exito"|"aviso"|"critico"|"senal"|"ne">={nuevo:"senal",abierto:"aviso",pendiente:"neutro",resuelto:"exito",cerrado:"neutro"};
const TK=[
  {n:4821,asunto:"No llegó mi pedido #A-1902",persona:"Juan Pérez",canal:"whatsapp",estado:"abierto" as Est,prioridad:"alta" as Pri,agente:"Camila R.",equipo:"Soporte N1",sla:"2h 10m",vencido:false},
  {n:4820,asunto:"Cobro duplicado en la boleta",persona:"María Soto",canal:"email",estado:"nuevo" as Est,prioridad:"urgente" as Pri,agente:null,equipo:"Facturación",sla:"12m",vencido:false},
  {n:4818,asunto:"Consulta por horario de despacho",persona:"Pedro Díaz",canal:"webchat",estado:"pendiente" as Est,prioridad:"media" as Pri,agente:"Diego M.",equipo:"Soporte N1",sla:"vencido",vencido:true},
  {n:4815,asunto:"Cambio de dirección de entrega",persona:"Ana Rivas",canal:"llamada",estado:"abierto" as Est,prioridad:"media" as Pri,agente:"Camila R.",equipo:"Soporte N1",sla:"5h 40m",vencido:false},
  {n:4810,asunto:"Felicitaciones por la atención",persona:"Luis Vera",canal:"email",estado:"resuelto" as Est,prioridad:"baja" as Pri,agente:"Diego M.",equipo:"Soporte N1",sla:"—",vencido:false},
];
const FILTROS:(Est|"todos")[]=["todos","nuevo","abierto","pendiente","resuelto"];

export default function Bandeja(){
  const [f,setF]=useState<Est|"todos">("todos");
  const rows=TK.filter(t=>f==="todos"||t.estado===f);
  return (<main className="min-h-screen">
    <header className="flex items-center gap-3 px-7 py-4 border-b border-border">
      <span className="h-2.5 w-2.5 rounded-full bg-primary" style={{boxShadow:"0 0 10px hsl(var(--primary))"}}/>
      <span className="font-semibold text-lg tracking-tight">xTickets</span>
      <span className="text-[10px] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Consola X5</span>
      <div className="flex-1"/>
      <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full" style={{background:"hsl(var(--exito))"}}/><span className="text-muted-foreground">Camila R. · Supervisor · Soporte N1</span></div>
    </header>
    <div className="max-w-6xl mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bandeja</h1>
          <div className="text-muted-foreground text-sm mt-0.5">3 sin asignar · 1 con SLA vencido</div>
        </div>
        <Button size="sm">+ Nuevo ticket</Button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTROS.map(x=><button key={x} onClick={()=>setF(x)}
          className={"px-3 h-8 rounded-pill text-[13px] font-medium border "+(f===x?"bg-secondary border-border text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}>
          {x==="todos"?"Todos":x}</button>)}
      </div>
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
            <th className="p-3 font-black">#</th><th className="p-3 font-black">Asunto</th><th className="p-3 font-black">Prioridad</th>
            <th className="p-3 font-black">Estado</th><th className="p-3 font-black">Agente</th><th className="p-3 font-black">Equipo</th><th className="p-3 font-black">SLA</th>
          </tr></thead>
          <tbody>
            {rows.map(t=><tr key={t.n} className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer" onClick={()=>location.href="/tickets/detalle"}>
              <td className="p-3 tabular-nums text-muted-foreground">#{t.n}</td>
              <td className="p-3"><div className="font-medium">{t.asunto}</div><div className="text-xs text-muted-foreground">{t.persona} · {t.canal}</div></td>
              <td className="p-3"><Badge rol={priT[t.prioridad]}>{t.prioridad}</Badge></td>
              <td className="p-3"><Badge rol={estT[t.estado]}>{t.estado}</Badge></td>
              <td className="p-3">{t.agente??<span className="text-[hsl(var(--critico))] text-xs font-semibold">Sin asignar</span>}</td>
              <td className="p-3 text-muted-foreground">{t.equipo}</td>
              <td className="p-3">{t.vencido?<Badge rol="critico">vencido</Badge>:<span className="tabular-nums text-muted-foreground">{t.sla}</span>}</td>
            </tr>)}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  </main>);
}
