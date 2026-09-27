import { redirect } from "next/navigation";

// La raíz no es una página: la guarda de sesión ya manda a /login si no hay sesión, y
// si la hay, cada rol va a su consola (el AppShell corrige /superadmin → casa). Aquí
// solo reencaminamos — se acabó el login falso que vivía en esta ruta.
export default function Home() {
  redirect("/superadmin");
}
