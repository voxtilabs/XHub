import { crearApp } from "./app.js";
import { fijarObservadorIA } from "@xhub/ia";
import { crearSinkUsoIA } from "@xhub/modulo-nucleo";
// Registra el consumo de IA de las respuestas/resúmenes que se generan en el API.
fijarObservadorIA(crearSinkUsoIA());
const app = crearApp();
const puerto = Number(process.env.PORT ?? 3000);
app.listen({ port: puerto, host: "0.0.0.0" })
  .then(() => process.stdout.write(`[xhub-api] escuchando en :${puerto}\n`))
  .catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
