import { Brand } from "@/components/brand";
import Link from "next/link";

export const metadata = { title: "Política de privacidad · xHub" };

// Página PÚBLICA (sin login). Borrador para revisión legal: los datos entre
// corchetes [así] los completa el área legal de X5 / VoxTi Labs.
export default function Privacidad() {
  return (
    <main className="xhub-privacy-page" style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>
        <div className="xhub-privacy-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <Brand />
          <Link href="/login" style={{ fontSize: 13, color: "hsl(var(--senal))", textDecoration: "none" }}>← Volver al inicio de sesión</Link>
        </div>

        <header className="xhub-public-hero" data-hero="security">
        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Legal</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "4px 0 6px" }}>Política de privacidad</h1>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 14, margin: 0 }}>Última actualización: 30 de septiembre de 2026 · Conforme a la Ley N.º 21.719 sobre protección de datos personales (Chile).</p>
        </header>

        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "hsl(var(--aviso)/0.1)", border: "1px solid hsl(var(--aviso)/0.3)", fontSize: 13 }}>
          <b>Borrador para revisión legal.</b> Los campos entre corchetes deben completarse y todo el documento debe validarse con el área legal antes de su publicación.
        </div>

        <Seccion titulo="1. Quién es responsable de tus datos">
          El responsable del tratamiento es <b>[X5 Soluciones SpA]</b>, RUT <b>[__.___.___-_]</b>, con domicilio en <b>[dirección]</b>. xHub es operado en su nombre por <b>[VoxTi Labs]</b> como encargado de tratamiento. Para consultas de privacidad o para ejercer tus derechos, escribe a <b>[privacidad@x5s.cl]</b>.
        </Seccion>

        <Seccion titulo="2. Qué datos tratamos">
          <ul style={ul}>
            <li><b>Identidad de personas:</b> nombre, teléfono, correo electrónico, RUT y otros identificadores por canal (webchat, redes sociales) de las personas que contactan a nuestros clientes.</li>
            <li><b>Interacciones:</b> tickets de soporte, notas, oportunidades comerciales y el registro de llamadas y conversaciones espejadas desde XContact.</li>
            <li><b>Datos de las cuentas de usuario</b> del panel (correo, nombre, rol) y datos técnicos de uso (registros de acceso y auditoría).</li>
          </ul>
          No solicitamos datos sensibles para el funcionamiento de xHub. Si un cliente los incorpora en un mensaje, se tratan bajo su responsabilidad y con las mismas medidas de seguridad.
        </Seccion>

        <Seccion titulo="3. Con qué finalidad y base legal">
          Tratamos estos datos para prestar los servicios de atención al cliente, CRM y soporte que cada cliente contrata (gestión de tickets, seguimiento comercial, ficha unificada de la persona). La base de licitud es la ejecución del contrato con nuestros clientes y el interés legítimo en operar el servicio, conforme a la Ley N.º 21.719. No usamos los datos para decisiones automatizadas con efectos jurídicos sobre las personas.
        </Seccion>

        <Seccion titulo="4. De dónde provienen">
          Los datos provienen de (a) lo que cada cliente registra directamente en xHub y (b) la información espejada desde <b>XContact</b>, la plataforma de contactabilidad de X5. xHub guarda una copia para funcionar aunque XContact no esté disponible; esa copia se concilia periódicamente con el origen.
        </Seccion>

        <Seccion titulo="5. Con quién se comparten">
          No vendemos datos personales. Se comparten únicamente con encargados necesarios para operar el servicio, bajo contrato y con las mismas obligaciones: el proveedor de infraestructura donde se aloja xHub, y proveedores de procesamiento de lenguaje (IA) para funciones como el resumen de conversaciones, a los que se envía solo el contenido necesario para la tarea. La lista vigente de encargados está disponible a solicitud.
        </Seccion>

        <Seccion titulo="6. Cuánto tiempo se conservan">
          Los datos se conservan mientras exista la relación con el cliente y por el plazo que fije su plan de retención, o mientras una obligación legal lo exija. Cumplido el plazo, se eliminan o anonimizan.
        </Seccion>

        <Seccion titulo="7. Tus derechos">
          Puedes ejercer tus derechos de <b>acceso, rectificación, cancelación (supresión) y oposición</b> sobre tus datos. xHub incluye herramientas para atender estas solicitudes: a petición del titular, el cliente puede exportar toda la información asociada a una persona y suprimirla del sistema. Para ejercerlos, contáctanos en <b>[privacidad@x5s.cl]</b>; responderemos en los plazos que establece la Ley N.º 21.719. Si consideras que tus derechos no fueron atendidos, puedes reclamar ante la <b>[Agencia de Protección de Datos Personales]</b>.
        </Seccion>

        <Seccion titulo="8. Cómo protegemos tus datos">
          <ul style={ul}>
            <li><b>Aislamiento por cliente</b> en la base de datos (row-level security): los datos de un cliente no son accesibles por otro.</li>
            <li><b>Cifrado</b> en tránsito y de las credenciales de integración; los secretos nunca se almacenan en texto plano.</li>
            <li><b>Verificación en dos pasos (2FA) opcional</b> para el inicio de sesión, y registro de auditoría de las acciones sensibles.</li>
            <li><b>Respaldos</b> cifrados y almacenados fuera del servidor principal.</li>
          </ul>
        </Seccion>

        <Seccion titulo="9. Cambios a esta política">
          Podemos actualizar esta política para reflejar cambios legales u operativos. Publicaremos la versión vigente en esta misma página con su fecha de actualización.
        </Seccion>

        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 32 }}>xHub · una plataforma de [VoxTi Labs] para [X5 Soluciones]. Este documento es un borrador y no constituye asesoría legal.</p>
      </div>
    </main>
  );
}

const ul: React.CSSProperties = { margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 };

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>{titulo}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: "hsl(var(--foreground)/0.9)" }}>{children}</div>
    </section>
  );
}
