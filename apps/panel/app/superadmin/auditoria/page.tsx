"use client";
import { Icon } from "@/components/icon";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { HeroFeatures } from "@/components/hero-features";

type Entrada = { seq: number; clienteId: string | null; actorTipo: string; actorId: string | null; accion: string; recurso: string | null; recursoId: string | null; resultado: string; creadoEn: string };
type Cadena = { valida: boolean; entradas: number; rotaEn: number | null };
type Filtros = { actor: string; recurso: string; desde: string; hasta: string };
const FILTROS_VACIOS: Filtros = { actor: "", recurso: "", desde: "", hasta: "" };
const resultado = (valor: string) => ({ ok: "Correcto", denegado: "Denegado", error: "Error" }[valor] ?? valor);
const tipoActor = (valor: string) => ({ sistema: "Sistema", plataforma: "Plataforma", usuario: "Usuario", agente: "Agente" }[valor] ?? valor);

function consulta(filtros: Filtros) {
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) if (valor) qs.set(clave, valor);
  return qs.toString();
}

export default function Auditoria() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [cadena, setCadena] = useState<Cadena | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VACIOS);
  const [exportando, setExportando] = useState(false);
  const solicitud = useRef(0);
  const pendientes = (Object.keys(f) as (keyof Filtros)[]).some((key) => f[key] !== aplicados[key]);
  const tieneFiltros = Object.values(f).some(Boolean) || Object.values(aplicados).some(Boolean);

  async function cargar(filtros: Filtros = f) {
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      setError("La fecha final debe ser igual o posterior a la inicial.");
      return;
    }
    const actual = ++solicitud.current;
    setCargando(true); setError(null); setErrorCarga(null);
    try {
      const qs = consulta(filtros);
      const r = await apiFetch<{ entradas: Entrada[]; cadena: Cadena }>(`/admin/auditoria${qs ? "?" + qs : ""}`);
      if (actual === solicitud.current) {
        setEntradas(r.entradas); setCadena(r.cadena); setAplicados({ ...filtros });
      }
    } catch (e) { if (actual === solicitud.current) setErrorCarga((e as Error).message); }
    finally { if (actual === solicitud.current) setCargando(false); }
  }
  useEffect(() => { cargar(FILTROS_VACIOS); }, []);

  function limpiar() {
    setF(FILTROS_VACIOS);
    cargar(FILTROS_VACIOS);
  }

  async function exportar() {
    setExportando(true); setError(null);
    try {
      const qs = consulta(f);
      const data = await apiFetch<unknown>(`/admin/auditoria/exportar${qs ? "?" + qs : ""}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `auditoria-xhub-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
    finally { setExportando(false); }
  }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-audit-page space-y-5">
        <div className="xhub-page-heading" data-hero="security">
          <div>
            <div className="xhub-eyebrow">XHUB · AUDITORÍA</div>
            <h1>Auditoría</h1>
            <p>Una historia verificable de la actividad de tu plataforma.</p>
            <HeroFeatures variant="auditoria" />
          </div>
        </div>

        <div className="xhub-audit-content">
          <div className="xhub-audit-top-grid">
            <section className="xhub-audit-filter-card" aria-labelledby="audit-filter-title">
              <header className="xhub-audit-section-heading">
                <Icon name="sliders-horizontal" />
                <div><h2 id="audit-filter-title">Explorar actividad</h2><p>Encuentra un movimiento por actor, acción o periodo.</p></div>
              </header>
              <form onSubmit={(event) => { event.preventDefault(); cargar(); }}>
                <div className="xhub-audit-filter-grid">
                  <div className="xhub-audit-field">
                    <label htmlFor="audit-actor">Actor</label>
                    <div className="xhub-audit-input"><Icon name="user" /><Input id="audit-actor" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} placeholder="Identificador o tipo" /></div>
                  </div>
                  <div className="xhub-audit-field">
                    <label htmlFor="audit-recurso">Acción / recurso</label>
                    <div className="xhub-audit-input"><Icon name="magnifying-glass" /><Input id="audit-recurso" value={f.recurso} onChange={(e) => setF({ ...f, recurso: e.target.value })} placeholder="Ej. cliente.creado" /></div>
                  </div>
                  <div className="xhub-audit-field"><label htmlFor="audit-desde">Desde</label><Input id="audit-desde" type="date" max={f.hasta || undefined} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></div>
                  <div className="xhub-audit-field"><label htmlFor="audit-hasta">Hasta</label><Input id="audit-hasta" type="date" min={f.desde || undefined} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></div>
                </div>
                <div className="xhub-audit-filter-footer">
                  <span className="xhub-audit-filter-state" data-pending={pendientes} role="status"><Icon name={pendientes ? "circle" : "check-circle"} />{pendientes ? "Filtros pendientes de aplicar" : tieneFiltros ? "Filtros aplicados a esta vista" : "Últimos movimientos de la plataforma"}</span>
                  <div className="xhub-audit-filter-actions">
                    <Button type="button" size="sm" variant="ghost" disabled={!tieneFiltros || cargando} onClick={limpiar}>Limpiar</Button>
                    <Button type="submit" size="sm" disabled={cargando}><Icon name={cargando ? "spinner-gap" : "magnifying-glass"} />{cargando ? "Buscando…" : "Buscar"}</Button>
                  </div>
                </div>
              </form>
            </section>
            <aside className="xhub-audit-integrity" data-valid={cadena?.valida} aria-label="Integridad de la cadena" role="status">
              <div className="xhub-audit-integrity-heading"><Icon name={cadena?.valida === false ? "shield-warning" : "shield-check"} weight="regular" /><span>Integridad de la cadena</span></div>
              <div className="xhub-audit-integrity-result">
                <strong>{cadena ? cadena.valida ? "Cadena íntegra" : "Cadena interrumpida" : errorCarga ? "Sin verificar" : "Verificando…"}</strong>
                <p>{cadena ? cadena.valida ? `${cadena.entradas} ${cadena.entradas === 1 ? "registro revisado" : "registros revisados"}` : `Primer fallo en la secuencia #${cadena.rotaEn}` : "El estado se obtiene de la plataforma."}</p>
              </div>
              <p className="xhub-audit-integrity-note"><Icon name="info" />Verificación global, independiente de los filtros.</p>
            </aside>
          </div>

          {(error || errorCarga) && <div className="xhub-audit-error" role="alert"><Icon name="warning-circle" />{error ?? errorCarga}</div>}

          <section className="xhub-audit-history" aria-labelledby="audit-history-title" aria-busy={cargando}>
            <header className="xhub-audit-history-heading">
              <div className="xhub-audit-section-heading"><Icon name="clock-counter-clockwise" /><div><h2 id="audit-history-title">Registro de actividad</h2><p role="status">{cargando ? "Consultando la actividad…" : errorCarga ? entradas.length ? "Mostrando la última consulta disponible" : "No se ha podido consultar la actividad" : `${entradas.length} ${entradas.length === 1 ? "registro" : "registros"} en esta vista`}</p></div></div>
              <Button size="sm" variant="secondary" onClick={exportar} disabled={cargando || exportando} title="Descarga hasta 500 registros con los filtros del formulario"><Icon name={exportando ? "spinner-gap" : "download-simple"} />{exportando ? "Exportando…" : "Exportar JSON"}</Button>
            </header>
            {cargando ? (
              <div className="xhub-audit-empty" role="status"><Icon name="spinner-gap" /><h3>Cargando registros</h3><p>Estamos consultando la actividad de la plataforma.</p></div>
            ) : entradas.length > 0 ? (
              <table className="xhub-audit-table">
                <caption className="sr-only">Actividad de la plataforma, de la más reciente a la más antigua.</caption>
                <colgroup><col className="xhub-audit-col-sequence" /><col className="xhub-audit-col-activity" /><col /><col /><col className="xhub-audit-col-result" /></colgroup>
                <thead><tr><th scope="col">Secuencia</th><th scope="col">Actividad / fecha</th><th scope="col">Actor</th><th scope="col">Recurso</th><th scope="col">Resultado</th></tr></thead>
                <tbody>
                  {entradas.map((e) => (
                    <tr key={e.seq} data-seq={e.seq}>
                      <td data-label="Secuencia" className="xhub-audit-sequence"><span>#{e.seq}</span></td>
                      <td data-label="Actividad / fecha" className="xhub-audit-event"><code>{e.accion}</code><time dateTime={e.creadoEn}>{new Date(e.creadoEn).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></td>
                      <td data-label="Actor" className="xhub-audit-actor"><div><Icon name={e.actorTipo === "sistema" ? "cpu" : "fingerprint"} /><div><span>{e.actorId ?? tipoActor(e.actorTipo)}</span>{e.actorId && <small>{tipoActor(e.actorTipo)}</small>}</div></div></td>
                      <td data-label="Recurso" className="xhub-audit-resource"><span>{e.recurso ?? "—"}</span>{e.recursoId && <code>{e.recursoId}</code>}</td>
                      <td data-label="Resultado" className="xhub-audit-result"><span className="xhub-audit-status" data-result={e.resultado}><Icon name={e.resultado === "ok" ? "check-circle" : e.resultado === "denegado" ? "shield-warning" : "warning-circle"} />{resultado(e.resultado)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !errorCarga ? (
              <div className="xhub-audit-empty"><Icon name="magnifying-glass" /><h3>Sin movimientos para esta búsqueda</h3><p>Prueba con otro actor, acción o rango de fechas.</p>{tieneFiltros && <Button size="sm" variant="secondary" onClick={limpiar}>Limpiar filtros</Button>}</div>
            ) : (
              <div className="xhub-audit-empty"><Icon name="warning-circle" /><h3>No se pudo cargar la actividad</h3><p>Vuelve a buscar para consultar los registros.</p></div>
            )}
            <footer className="xhub-audit-history-footer"><span><Icon name="list-bullets" />Más recientes primero</span><span>Hasta 100 registros en esta vista</span></footer>
          </section>
        </div>
      </div>
    </main>
  );
}
