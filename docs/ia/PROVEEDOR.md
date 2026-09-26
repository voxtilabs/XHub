# IA de xHub — proveedor y modelo, 100% configurables

xHub **no está casado con ningún modelo**. El adaptador `@xhub/ia` habla el protocolo
OpenAI-compatible y elige proveedor/modelo por **variable de entorno**:

```
IA_API_KEY=...                 # el secreto, siempre por entorno (nunca en el repo)
IA_API_BASE=https://.../v1     # endpoint del proveedor
IA_MODELO=z-ai/glm-5.3-flash   # el modelo
```

Cambiar de GLM a otro modelo (más barato, más rápido, o uno nuevo) es **cambiar el
`.env`, sin tocar código ni volver a desplegar el binario**. Requisito único: que el
proveedor exponga un endpoint compatible con OpenAI Chat Completions (lo estándar hoy).

Sin `IA_API_KEY`, la IA queda **apagada** y todo usa su **fallback determinista** —
las funciones no se rompen, solo pierden la parte inteligente. Cero costo por defecto.

## Dónde se usa la IA (siempre con fallback)

- **Triage** (`clasificar`): decide si una conversación necesita un ticket, con un
  **% de confianza** que cada cliente compara contra **su umbral ajustable**. Fallback:
  clasificación por reglas (palabras clave).
- **Resumen de conversación** (`resumirConversacionIA`). Fallback: resumen determinista.
- **Urgencia/sentimiento**: hoy determinista; misma interfaz lista para el LLM.

## Modelos probados

- `z-ai/glm-5.3` y `z-ai/glm-5.3-flash` (vía NVIDIA NIM) — GLM 5.3 es modelo de
  **razonamiento**: necesita `max_tokens` alto y tope de tiempo generoso.
- Cualquier otro modelo OpenAI-compatible funciona igual cambiando `IA_MODELO`.
