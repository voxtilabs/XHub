import { headers } from "next/headers";
import { redirect } from "next/navigation";

// La raíz no es una página: reencamina según el subdominio. El de tickets (tickets-…)
// entra a la bandeja; el hub, a /superadmin (y el AppShell corrige a la casa por rol).
export default function Home() {
  const host = headers().get("host") ?? "";
  redirect(host.startsWith("tickets-") || host.startsWith("tickets.") ? "/tickets" : "/superadmin");
}
