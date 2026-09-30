import { Icon } from "@/components/icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";

const timeline = [
  { tipo: "Ticket", modulo: "xTickets", resumen: "Abrió ticket: problema con despacho", cuando: "hoy 10:42" },
  { tipo: "Llamada", modulo: "xContact", resumen: "Llamada entrante · 4m 12s · atendida", cuando: "hoy 09:15" },
  { tipo: "WhatsApp", modulo: "xContact", resumen: "«Hola, consulta por mi pedido»", cuando: "ayer 18:30" },
  { tipo: "Email", modulo: "núcleo", resumen: "Se registró por correo", cuando: "12 sep" },
];
const identidades = [
  { canal: "teléfono", valor: "+56 9 1234 5678" },
  { canal: "email", valor: "juan.perez@empresa.cl" },
  { canal: "whatsapp", valor: "+56 9 1234 5678" },
];

export default function Persona() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="ficha360.ver">
      <div className="xhub-page xhub-person-page">
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">RELACIONES CON CLIENTES</div>
            <h1>Personas</h1>
            <p>El contexto de cada persona, en un solo lugar.</p>
          </div>
        </div>
        <div className="xhub-person-layout">
          <Card className="xhub-profile-card">
            <div className="xhub-profile-summary">
              <div className="xhub-person-avatar" aria-hidden="true">JP</div>
              <h2>Juan Pérez</h2>
              <p className="xhub-profile-subtitle">Ficha de contacto</p>
              <div className="xhub-profile-badges"><Badge rol="senal">Prospecto</Badge><Badge rol="accion">VIP</Badge></div>
            </div>
            <div className="xhub-profile-section">
              <h3>Información de contacto</h3>
              <dl>{identidades.map((id) => <div className="xhub-contact-line" key={id.canal}>
                <Icon name={id.canal === "teléfono" ? "phone" : id.canal === "whatsapp" ? "whatsapp-logo" : "envelope"} />
                <div><dt>{id.canal === "email" ? "Correo electrónico" : id.canal === "teléfono" ? "Teléfono" : "WhatsApp"}</dt><dd>{id.valor}</dd></div>
              </div>)}</dl>
            </div>
            <div className="xhub-profile-section"><p className="xhub-profile-note"><Icon name="plugs-connected" />Un historial compartido entre tus canales de atención.</p></div>
          </Card>
          <div className="xhub-person-main">
            <div className="xhub-person-overview">
              <div><Icon name="clock-counter-clockwise" /><div><strong>{timeline.length}</strong><span>Interacciones</span></div></div>
              <div><Icon name="fingerprint" /><div><strong>{identidades.length}</strong><span>Identidades</span></div></div>
              <div><Icon name="chats-circle" /><div><strong>{new Set(timeline.map(t => t.tipo)).size}</strong><span>Canales</span></div></div>
            </div>
        <Tabs defaultValue="historia">
          <TabsList>
            <TabsTrigger value="historia"><Icon name="clock-counter-clockwise" /> Historia</TabsTrigger>
            <TabsTrigger value="identidades"><Icon name="fingerprint" /> Identidades</TabsTrigger>
            <TabsTrigger value="datos"><Icon name="database" /> Datos</TabsTrigger>
          </TabsList>
          <TabsContent value="historia">
            <Card className="xhub-person-history">
              <div className="xhub-history-heading"><div><h2>Historial de actividad</h2><p>Conversaciones y eventos más recientes.</p></div><span className="xhub-history-count">{timeline.length} eventos</span></div>
              {timeline.map((t, i) => (
                <div key={i} className="xhub-timeline-item" data-channel={t.tipo}>
                  <span className="xhub-timeline-icon"><Icon name={t.tipo === "Ticket" ? "ticket" : t.tipo === "Llamada" ? "phone" : t.tipo === "WhatsApp" ? "whatsapp-logo" : "envelope"} /></span>
                  <div>
                    <div className="xhub-event-top"><strong>{t.tipo === "Ticket" ? "Solicitud de soporte" : t.tipo === "Llamada" ? "Llamada recibida" : t.tipo === "WhatsApp" ? "Mensaje de WhatsApp" : "Contacto registrado"}</strong><time>{t.cuando}</time></div>
                    <p>{t.resumen}</p>
                    <span className="xhub-event-source">{t.modulo}</span>
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>
          <TabsContent value="identidades">
            <Card><CardContent className="pt-6 space-y-0">
              <h2 className="xhub-section-heading mb-3">Identidades conectadas</h2>
              {identidades.map((id, i) => (
                <div key={i} className="xhub-identity-row">
                  <span className="xhub-timeline-icon"><Icon name={id.canal === "teléfono" ? "phone" : id.canal === "whatsapp" ? "whatsapp-logo" : "envelope"} /></span>
                  <div><strong>{id.canal}</strong><p>{id.valor}</p></div>
                </div>
              ))}
              <p className="xhub-context-note"><Icon name="info" />Cada identidad conecta un canal con esta misma persona.</p>
            </CardContent></Card>
          </TabsContent>
          <TabsContent value="datos">
            <Card className="xhub-person-empty"><Icon name="database" /><h2>Todo listo para más contexto</h2><p>Aún no hay campos personalizados definidos para este cliente.</p></Card>
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </div>
      </RequierePermiso>
    </main>
  );
}
