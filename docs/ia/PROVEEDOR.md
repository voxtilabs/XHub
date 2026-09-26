# IA de xHub — proveedor y modelo, 100% configurables

xHub **no está casado con ningún modelo**, y usa **un proveedor distinto por tarea**.
El adaptador `@xhub/ia` habla el protocolo OpenAI-compatible y elige proveedor/modelo
por **variable de entorno, por tarea**:

```
# DECISIONES (triage) → JEV en OpenRouter (rápido, JSON limpio, bueno decidiendo)
IA_DECISION_API_KEY=...
IA_DECISION_API_BASE=https://openrouter.ai/api/v1
IA_DECISION_MODELO=typesafe/jev-router

# RESUMENES y texto → GLM 5.3 en NVIDIA NIM
IA_RESUMEN_API_KEY=...
IA_RESUMEN_API_BASE=https://integrate.api.nvidia.com/v1
IA_RESUMEN_MODELO=z-ai/glm-5.3-flash

# Fallback global para tareas sin config propia (opcional)
IA_API_KEY= ; IA_API_BASE= ; IA_MODELO=
```

`leerConfigIA("DECISION")` busca `IA_DECISION_*` y cae a `IA_*` si no está. Así cada
tarea usa el modelo que le conviene: JEV decide rápido y en JSON limpio; GLM redacta.

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

- **JEV** (`typesafe/jev-router` vía OpenRouter) para DECISIONES: devuelve JSON limpio
  al instante (no es de razonamiento), ideal para clasificar/triage. Es un router que
  elige el mejor motor por debajo.
- **GLM 5.3** (`z-ai/glm-5.3-flash` vía NVIDIA NIM) para RESUMENES/texto — modelo de
  **razonamiento**: necesita `max_tokens` alto y tope de tiempo generoso.
- Cualquier otro modelo OpenAI-compatible entra cambiando las variables de su tarea.
