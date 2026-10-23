import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { rutaDeInicio } from "@/modules/dashboards/inicio";

/**
 * Where the installed app opens (manifest start_url): the user's chosen
 * dashboard, else the register as before.
 */
export default async function Inicio() {
  const { userId } = await auth();
  redirect(userId ? await rutaDeInicio(userId, "/pos") : "/");
}
