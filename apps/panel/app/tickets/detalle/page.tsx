"use client";
import { Icon } from "@/components/icon";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const conv=[
  {quien:"Juan Pérez",tipo:"cliente",cuando:"hoy 09:12",texto:"Hola, hice el pedido #A-1902 hace 5 días y aún no llega. ¿Pueden revisar?",interno:false},
  {quien:"Camila R.",tipo:"agente",cuando:"hoy 09:20",texto:"Hola Juan, lamento la demora. Estoy revisando con despacho ahora mismo.",interno:false},
  {quien:"Camila R.",tipo:"nota",cuando:"hoy 09:21",texto:"Despacho confirma que salió hoy. Cliente ya reclamó una vez, tratar con prioridad.",interno:true},
];
export default function Detalle(){
  const [tab,setTab]=useState<"resp"|"nota">("resp");
  return (<main className="min-h-screen">
    <header className="xhub-standalone-header flex flex-wrap items-center gap-3 border-b border-border">
      <a href="/tickets" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm"><Icon name="arrow-left" /> Bandeja</a>
      <span className="font-semibold tracking-tight">Ticket #4821</span>
      <Badge rol="aviso">abierto</Badge><Badge rol="aviso">alta</Badge>
      <div className="flex-1"/>
      <Button variant="secondary" size="sm"><Icon name="arrow-up-right" /> Escalar a N2</Button>
      <Button size="sm"><Icon name="check-circle" /> Resolver</Button>
    </header>
    <div className="xhub-page xhub-page--detail grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">XHUB · CONVERSACIÓN</div>
            <h1>No llegó mi pedido #A-1902</h1>
            <p>Abierto por Juan Pérez · vía WhatsApp · hace 3 h</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 mb-6">
          {conv.map((m,i)=><div key={i} className={m.interno?"":"" }>
            <Card className={"xhub-conversation-card p-4 "+(m.interno?"border-[hsl(var(--aviso)/0.4)] bg-[hsl(var(--aviso)/0.06)]":"")}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="xhub-message-avatar"><Icon name={m.interno ? "note-pencil" : m.tipo === "agente" ? "headset" : "user"} /></span><span className="font-semibold text-sm">{m.quien}</span>
                {m.tipo==="agente"&&<span className="text-[10px] uppercase tracking-wider text-[hsl(var(--senal))]">agente</span>}
                {m.interno&&<Badge rol="aviso">nota interna</Badge>}
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">{m.cuando}</span>
              </div>
              <div className="text-sm text-foreground/90">{m.texto}</div>
            </Card>
          </div>)}
        </div>
        <Card className="p-4">
          <div className="flex flex-wrap gap-1 mb-3">
            <button onClick={()=>setTab("resp")} className={"px-3 h-8 rounded-sm text-[13px] font-medium "+(tab==="resp"?"bg-secondary":"text-muted-foreground")}><Icon name="arrow-bend-up-left" className="xhub-inline-icon" /> Responder al cliente</button>
            <button onClick={()=>setTab("nota")} className={"px-3 h-8 rounded-sm text-[13px] font-medium "+(tab==="nota"?"bg-[hsl(var(--aviso)/0.15)] text-[hsl(var(--aviso))]":"text-muted-foreground")}><Icon name="note-pencil" className="xhub-inline-icon" /> Nota interna</button>
          </div>
          <textarea rows={3} placeholder={tab==="resp"?"Escribe tu respuesta…":"Nota visible solo para el equipo…"}
            className="w-full rounded-md border border-border bg-secondary p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"/>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="sm"><Icon name={tab==="resp"?"paper-plane-tilt":"floppy-disk"} />{tab==="resp"?"Enviar respuesta":"Guardar nota"}</Button>
            <Button variant="ghost" size="sm"><Icon name="lightning" /> Insertar macro <Icon name="caret-down" /></Button>
            <div className="flex-1"/>
            <span className="text-xs leading-relaxed text-muted-foreground">Macros: «Consultando despacho», «Disculpa por la demora»</span>
          </div>
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="xhub-section-heading xhub-panel-heading mb-4"><Icon name="clock-countdown" /> SLA</div>
          <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Primera respuesta</span><Badge rol="exito">cumplido</Badge></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Resolución</span><span className="tabular-nums font-semibold text-[hsl(var(--aviso))]">2h 10m</span></div>
          <div className="h-1.5 bg-secondary rounded-pill mt-2 overflow-hidden"><div className="h-full rounded-pill" style={{width:"64%",background:"hsl(var(--aviso))"}}/></div>
        </Card>
        <Card className="p-4">
          <div className="xhub-section-heading xhub-panel-heading mb-4"><Icon name="users" /> Asignación</div>
          <div className="flex items-center gap-2 mb-2"><span className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-[hsl(var(--senal))]">CR</span>
            <div><div className="text-sm font-medium">Camila R.</div><div className="text-xs text-muted-foreground">Supervisor · Soporte N1</div></div></div>
          <Button variant="secondary" size="sm" className="w-full mt-1"><Icon name="user-switch" /> Reasignar</Button>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="xhub-section-heading xhub-panel-heading"><Icon name="identification-card" /> Persona · Ficha 360</div>
            <a className="inline-flex items-center gap-1 text-xs text-[var(--voxia-action-text)]" href="#">Ver <Icon name="arrow-up-right" /></a>
          </div>
          <div className="flex items-center gap-2 mb-3"><span className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold">JP</span>
            <div><div className="text-sm font-medium">Juan Pérez</div><div className="text-xs"><Badge rol="senal">VIP</Badge></div></div></div>
          <div className="text-xs text-muted-foreground space-y-1.5">
            <div className="flex justify-between"><span>Tickets previos</span><span className="text-foreground tabular-nums">7</span></div>
            <div className="flex justify-between"><span>Última llamada</span><span className="text-foreground">hoy 09:15</span></div>
            <div className="flex justify-between"><span>Teléfono</span><span className="text-foreground tabular-nums">+56 9 1234 5678</span></div>
          </div>
        </Card>
      </aside>
    </div>
  </main>);
}
