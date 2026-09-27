"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hexAHslTriplet } from "@/lib/marca";

type M = { nombre_marca: string | null; logo_url: string | null; color_primario: string | null; color_acento: string | null };

export function EditorMarca({ clienteId }: { clienteId: string }) {
  const [m, setM] = useState<M>({ nombre_marca: null, logo_url: null, color_primario: null, color_acento: null });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { apiFetch<M>(`/admin/clientes/${clienteId}/marca`).then(setM).catch(() => {}); }, [clienteId]);

  const prim = m.color_primario || "#ff7a1a";
  const acc = m.color_acento || "#75d8ee";
  const set = (k: keyof M) => (v: string | null) => setM((x) => ({ ...x, [k]: v }));

  function subirLogo(file: File) {
    setErr(null);
    if (file.size > 150000) { setErr("El logo pesa más de 150KB. Usa un SVG o PNG chico."); return; }
    const r = new FileReader();
    r.onload = () => set("logo_url")(String(r.result));
    r.readAsDataURL(file);
  }
  async function guardar() {
    setGuardando(true); setErr(null); setMsg(null);
    try {
      await apiFetch(`/admin/clientes/${clienteId}/marca`, { method: "PUT", body: JSON.stringify({
        nombreMarca: m.nombre_marca, logoUrl: m.logo_url, colorPrimario: m.color_primario, colorAcento: m.color_acento,
      }) });
      setMsg("Marca guardada · el cliente la verá al recargar");
    } catch (e) { setErr((e as Error).message); } finally { setGuardando(false); }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border grid sm:grid-cols-2 gap-4">
      <div className="flex flex-col gap-2.5">
        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre de marca</span>
          <Input value={m.nombre_marca ?? ""} onChange={(e) => set("nombre_marca")(e.target.value || null)} placeholder="p.ej. Retail Andes" className="mt-1" />
        </label>
        <div className="flex gap-4">
          <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Primario</span>
            <div className="flex items-center gap-2 mt-1"><input type="color" value={prim} onChange={(e) => set("color_primario")(e.target.value)} className="h-9 w-12 rounded border border-border bg-transparent" /><code className="text-[11px] text-muted-foreground">{prim}</code></div>
          </label>
          <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acento</span>
            <div className="flex items-center gap-2 mt-1"><input type="color" value={acc} onChange={(e) => set("color_acento")(e.target.value)} className="h-9 w-12 rounded border border-border bg-transparent" /><code className="text-[11px] text-muted-foreground">{acc}</code></div>
          </label>
        </div>
        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Logo</span>
          <div className="flex items-center gap-2 mt-1">
            <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])} className="text-[12px] file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs" />
            {m.logo_url && <button onClick={() => set("logo_url")(null)} className="text-[11px] text-muted-foreground hover:text-[hsl(var(--critico))]">quitar</button>}
          </div>
        </label>
        <div className="flex items-center gap-2 mt-1">
          <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar marca"}</Button>
          {msg && <span className="text-[12px]" style={{ color: "hsl(var(--exito))" }}>✓ {msg}</span>}
          {err && <span className="text-[12px]" style={{ color: "hsl(var(--critico))" }}>▲ {err}</span>}
        </div>
      </div>

      {/* Vista previa del encabezado del cliente */}
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vista previa</span>
        <div className="mt-1 rounded-lg border border-border overflow-hidden">
          <div className="flex h-12 items-center gap-2.5 px-3" style={{ background: "hsl(var(--background))" }}>
            {m.logo_url
              ? <img src={m.logo_url} alt="logo" className="h-7 w-auto max-w-[120px] object-contain" />
              : <span className="h-7 w-7 rounded-[8px] grid place-items-center text-[12px] font-black text-white" style={{ background: `linear-gradient(135deg, ${acc}, ${prim})` }}>{(m.nombre_marca || "xH").slice(0, 2)}</span>}
            <span className="leading-none">
              <span className="block font-semibold text-[14px]">{m.nombre_marca || "xHub"}</span>
              <span className="block text-[9px] uppercase tracking-widest text-muted-foreground">xHub</span>
            </span>
            <span className="ml-auto h-7 px-3 grid place-items-center rounded-pill text-[12px] font-semibold text-white" style={{ background: prim }}>Botón</span>
          </div>
          <div className="px-3 py-2 text-[11px]" style={{ color: acc }}>Etiquetas y acentos con el color de acento</div>
        </div>
      </div>
    </div>
  );
}
