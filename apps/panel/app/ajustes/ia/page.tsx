"use client";
import { Icon } from "@/components/icon";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { HeroFeatures } from "@/components/hero-features";

type IA = { contexto: string | null; modelo: string | null };
type Dato = { etiqueta: string; valor: string };
type Ejemplo = { entrada: string; salida: string; ambito: "resumen" | "respuesta" | "todos" };
type Rico = { datos: Dato[]; ejemplos: Ejemplo[] };

function ajustarAltura(input: HTMLTextAreaElement) {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function TextareaAutoAltura(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (inputRef.current) ajustarAltura(inputRef.current);
  }, [props.value]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let ancho = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === ancho) return;
      ancho = entry.contentRect.width;
      ajustarAltura(input);
    });
    observer.observe(input);
    void document.fonts.ready.then(() => {
      if (input.isConnected) ajustarAltura(input);
    });
    return () => observer.disconnect();
  }, []);
  return <textarea {...props} ref={inputRef} />;
}

export default function AjustesIA() {
  const contextoRef = useRef<HTMLTextAreaElement>(null);
  const [contexto, setContexto] = useState("");
  const [modelo, setModelo] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [datos, setDatos] = useState<Dato[]>([]);
  const [ejemplos, setEjemplos] = useState<Ejemplo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoRico, setGuardandoRico] = useState(false);
  const [msgRico, setMsgRico] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (contextoRef.current) ajustarAltura(contextoRef.current);
  }, [contexto]);

  useEffect(() => {
    const input = contextoRef.current;
    if (!input) return;
    let ancho = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === ancho) return;
      ancho = entry.contentRect.width;
      ajustarAltura(input);
    });
    observer.observe(input);
    void document.fonts.ready.then(() => {
      if (input.isConnected) ajustarAltura(input);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<IA>("/cliente/ia"),
      apiFetch<Rico>("/cliente/ia-datos").catch(() => ({ datos: [], ejemplos: [] })),
    ])
      .then(([ia, rico]) => {
        setContexto(ia.contexto ?? ""); setOriginal(ia.contexto ?? ""); setModelo(ia.modelo);
        setDatos(rico.datos ?? []); setEjemplos(rico.ejemplos ?? []);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setCargando(false));
  }, []);

  async function guardar() {
    setError(null); setGuardando(true);
    try {
      const r = await apiFetch<{ contexto: string | null }>("/cliente/ia", { method: "PUT", body: JSON.stringify({ contexto }) });
      setOriginal(r.contexto ?? ""); setMsg("Contexto guardado"); setTimeout(() => setMsg(null), 2400);
    } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }

  async function guardarRico() {
    setError(null); setMsgRico(null); setGuardandoRico(true);
    try {
      const r = await apiFetch<Rico>("/cliente/ia-datos", { method: "PUT", body: JSON.stringify({ datos, ejemplos }) });
      setDatos(r.datos ?? []); setEjemplos(r.ejemplos ?? []);
      setMsgRico("Datos y ejemplos guardados"); setTimeout(() => setMsgRico(null), 2400);
    } catch (e) { setError((e as Error).message); } finally { setGuardandoRico(false); }
  }

  const sucio = contexto !== original;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-settings-ia-page">
        <div className="xhub-page-heading" data-hero="intelligence" data-hero-size="long">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Inteligencia artificial</h1>
            <p>Dale a la IA el contexto de tu negocio para que resuma y sugiera mejor.</p>
          <HeroFeatures variant="ajustes-ia" />
          </div>
        </div>

        {error && <div className="xhub-ai-settings-error" role="alert"><Icon name="warning-circle" /> <span>{error}</span></div>}

        <Card className="xhub-ai-context-card"><CardContent className="xhub-ai-context-content">
          <aside className="xhub-ai-studio-intro" aria-labelledby="ai-studio-title">
            <header className="xhub-ai-studio-heading">
              <div className="xhub-ai-settings-kicker"><Icon name="cpu" /> CONTEXTO DE TU ESPACIO</div>
              <h2 id="ai-studio-title">Tu negocio.<br /><span>Su inteligencia.</span></h2>
              <p>Una base propia para respuestas que hablan tu idioma.</p>
            </header>
            <div className="xhub-ai-studio-art" aria-hidden="true">
              <img src="/voxia/xhub-ai-context-studio-v1.webp" alt="" width={960} height={720} decoding="async" />
            </div>
            <div className="xhub-ai-model-detail">
              <div className="xhub-ai-model-label"><Icon name="cpu" /><span>Modelo de tu espacio</span></div>
              {modelo ? <code>{modelo}</code> : <strong>{cargando ? "Consultando modelo…" : "Modelo predeterminado"}</strong>}
              <p>Administrado por la plataforma.<br /> Si necesitas otro modelo, contacta con soporte.</p>
            </div>
          </aside>

          <section className="xhub-ai-editor" aria-labelledby="ai-editor-title">
            <header className="xhub-ai-editor-heading">
              <div>
                <h3 id="ai-editor-title">Dale tu voz a la IA</h3>
                <p>Lo que debe saber. Cómo debe responder.</p>
              </div>
            </header>

            <div className="xhub-ai-writing">
              <div className="xhub-ai-editor-toolbar">
                <label htmlFor="ai-context" className="xhub-ai-editor-label">Instrucciones del negocio</label>
                <span id="ai-context-count" className="xhub-ai-character-count">{contexto.length.toLocaleString("es-CL")} <span>/ 4.000</span></span>
              </div>
              <textarea
                id="ai-context"
                ref={contextoRef}
                aria-describedby="ai-context-help ai-context-count"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                disabled={cargando}
                rows={8}
                maxLength={4000}
                placeholder={"Empieza por tu negocio…\nEj.: Somos una inmobiliaria en Santiago.\n\nDefine tu tono y tus límites…\nUsa un tono cercano y formal. No prometas fechas de entrega. Los reclamos de postventa se derivan al área de mantención."}
                className="xhub-ai-context-input"
              />
              <div className="xhub-ai-editor-meta">
                <Icon name="info" /><span id="ai-context-help">Se aplica a los resúmenes y las sugerencias de tu espacio.</span>
              </div>
            </div>

            <details className="xhub-ai-context-guide">
              <summary><Icon name="list-checks" /><span>¿Qué hace un buen contexto?</span><Icon name="caret-down" /></summary>
              <ol>
                <li><Icon name="buildings" /><div><strong>Tu negocio</strong><p>Qué haces, qué ofreces y qué necesita conocer tu equipo.</p></div></li>
                <li><Icon name="chats-circle" /><div><strong>Tu tono</strong><p>Cómo hablas con tus clientes: cercano, formal o directo.</p></div></li>
                <li><Icon name="shield-check" /><div><strong>Tus límites</strong><p>Qué no prometer y cuándo derivar a una persona.</p></div></li>
              </ol>
              <p className="xhub-ai-guide-tip">Usa ejemplos concretos y frases claras.</p>
            </details>

            <footer className="xhub-ai-context-actions">
              <div className="xhub-ai-save-state" role="status" aria-live="polite" data-pending={sucio}>
                <Icon name={guardando || cargando ? "circle-notch" : sucio ? "note-pencil" : "check-circle"} />
                <span>{cargando ? "Cargando contexto…" : guardando ? "Guardando cambios…" : sucio ? "Cambios sin guardar" : msg || "Sin cambios pendientes"}</span>
              </div>
              <Button onClick={guardar} disabled={cargando || guardando || !sucio}><Icon name={guardando ? "circle-notch" : "check"} />{guardando ? "Guardando…" : "Guardar contexto"}</Button>
            </footer>
          </section>
        </CardContent></Card>

        <Card className="xhub-ai-library-card"><CardContent className="xhub-ai-library-content">
          <section aria-labelledby="ai-data-title" aria-busy={cargando || guardandoRico}>
            <header className="xhub-ai-library-heading">
              <div className="xhub-ai-library-title">
                <Icon name="database" />
                <div>
                  <div className="xhub-ai-library-title-line"><h2 id="ai-data-title">Datos del negocio</h2><span className="xhub-ai-library-count">{datos.length} {datos.length === 1 ? "dato" : "datos"}</span></div>
                  <p>Horarios, sucursales y políticas. Información concreta que la IA tiene siempre a mano.</p>
                </div>
              </div>
              <Button type="button" variant="outline" className="xhub-ai-add-button" disabled={cargando || guardandoRico} onClick={() => setDatos((xs) => [...xs, { etiqueta: "", valor: "" }])}><Icon name="plus" />Agregar dato</Button>
            </header>
            <div className="xhub-ai-facts">
              {datos.length === 0 && <div className="xhub-ai-library-empty"><Icon name="list-bullets" /><div><strong>{cargando ? "Cargando datos…" : "Los detalles también hacen la diferencia"}</strong><p>{cargando ? "Preparando la información de tu espacio." : "Agrega un dato y su valor, como el horario de atención o dónde derivar un reclamo."}</p></div></div>}
              {datos.map((d, i) => (
                <div key={i} className="xhub-ai-fact-row">
                  <label className="xhub-ai-library-field" htmlFor={`ai-data-${i}-label`}><span>Etiqueta</span>
                    <input id={`ai-data-${i}-label`} value={d.etiqueta} onChange={(e) => setDatos((xs) => xs.map((x, k) => k === i ? { ...x, etiqueta: e.target.value } : x))} disabled={cargando || guardandoRico} placeholder="Ej. Horario de atención" maxLength={120} />
                  </label>
                  <label className="xhub-ai-library-field" htmlFor={`ai-data-${i}-value`}><span>Valor</span>
                    <input id={`ai-data-${i}-value`} value={d.valor} onChange={(e) => setDatos((xs) => xs.map((x, k) => k === i ? { ...x, valor: e.target.value } : x))} disabled={cargando || guardandoRico} placeholder="Ej. Lunes a viernes, de 9:00 a 18:00" maxLength={600} />
                  </label>
                  <button type="button" className="xhub-ai-remove-button" disabled={cargando || guardandoRico} onClick={() => setDatos((xs) => xs.filter((_, k) => k !== i))} aria-label={`Quitar dato ${i + 1}${d.etiqueta ? `: ${d.etiqueta}` : ""}`} title="Quitar dato"><Icon name="x" /></button>
                </div>
              ))}
            </div>
          </section>
        </CardContent></Card>

        <Card className="xhub-ai-library-card"><CardContent className="xhub-ai-library-content">
          <section aria-labelledby="ai-examples-title" aria-busy={cargando || guardandoRico}>
            <header className="xhub-ai-library-heading">
              <div className="xhub-ai-library-title">
                <Icon name="chats-circle" />
                <div>
                  <div className="xhub-ai-library-title-line"><h2 id="ai-examples-title">Ejemplos de respuestas</h2><span className="xhub-ai-library-count">{ejemplos.length} {ejemplos.length === 1 ? "ejemplo" : "ejemplos"}</span></div>
                  <p>Muestra una entrada y su respuesta ideal. La IA aprende el tono y la forma, sin copiarlas literalmente.</p>
                </div>
              </div>
              <Button type="button" variant="outline" className="xhub-ai-add-button" disabled={cargando || guardandoRico} onClick={() => setEjemplos((xs) => [...xs, { entrada: "", salida: "", ambito: "todos" }])}><Icon name="plus" />Agregar ejemplo</Button>
            </header>
            <div className="xhub-ai-examples">
              {ejemplos.length === 0 && <div className="xhub-ai-library-empty"><Icon name="chat-text" /><div><strong>{cargando ? "Cargando ejemplos…" : "Enséñale cómo responderías tú"}</strong><p>{cargando ? "Preparando las referencias de tu espacio." : "Usa una consulta habitual y la respuesta que mejor representa a tu negocio."}</p></div></div>}
              {ejemplos.map((e, i) => (
                <article key={i} className="xhub-ai-example" aria-labelledby={`ai-example-${i}-title`}>
                  <header className="xhub-ai-example-heading">
                    <h3 id={`ai-example-${i}-title`}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>Ejemplo {i + 1}</h3>
                    <label className="xhub-ai-library-field xhub-ai-example-scope" htmlFor={`ai-example-${i}-scope`}><span>Aplicar a</span>
                      <select id={`ai-example-${i}-scope`} value={e.ambito} disabled={cargando || guardandoRico} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, ambito: ev.target.value as Ejemplo["ambito"] } : x))}>
                        <option value="todos">Ambos (resumen y respuesta)</option>
                        <option value="respuesta">Solo sugerencia de respuesta</option>
                        <option value="resumen">Solo resumen</option>
                      </select>
                    </label>
                    <button type="button" className="xhub-ai-remove-button" disabled={cargando || guardandoRico} onClick={() => setEjemplos((xs) => xs.filter((_, k) => k !== i))} aria-label={`Quitar ejemplo ${i + 1}`} title="Quitar ejemplo"><Icon name="x" /></button>
                  </header>
                  <div className="xhub-ai-example-pair">
                    <label className="xhub-ai-library-field" htmlFor={`ai-example-${i}-input`}><span>Lo que llega del cliente <small>{e.entrada.length}/1.000</small></span>
                      <TextareaAutoAltura id={`ai-example-${i}-input`} value={e.entrada} disabled={cargando || guardandoRico} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, entrada: ev.target.value } : x))} rows={4} maxLength={1000} placeholder="Escribe una consulta o conversación de ejemplo…" />
                    </label>
                    <label className="xhub-ai-library-field" htmlFor={`ai-example-${i}-output`}><span>Respuesta ideal <small>{e.salida.length}/1.000</small></span>
                      <TextareaAutoAltura id={`ai-example-${i}-output`} value={e.salida} disabled={cargando || guardandoRico} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, salida: ev.target.value } : x))} rows={4} maxLength={1000} placeholder="Muestra el tono y la forma de una buena respuesta…" />
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <footer className="xhub-ai-context-actions xhub-ai-library-actions">
              <div className="xhub-ai-save-state" role="status" aria-live="polite"><Icon name={guardandoRico || cargando ? "circle-notch" : msgRico ? "check-circle" : "info"} /><span>{cargando ? "Cargando datos y ejemplos…" : guardandoRico ? "Guardando datos y ejemplos…" : msgRico || "Los datos y los ejemplos se guardan juntos."}</span></div>
              <Button type="button" onClick={guardarRico} disabled={guardandoRico || cargando}><Icon name={guardandoRico ? "circle-notch" : "check"} />{guardandoRico ? "Guardando…" : "Guardar datos y ejemplos"}</Button>
            </footer>
          </section>
        </CardContent></Card>
      </div>
    </main>
  );
}
