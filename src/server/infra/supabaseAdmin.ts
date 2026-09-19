import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la service_role key -- se salta RLS por completo. Solo para
 * lo que la Admin API de Supabase Auth exige y que ningún RPC puede hacer
 * (aquí, cambiar el email real de auth.users al editar un empleado desde
 * /admin -- ver supabase/migrations/0103_admin_update_member.sql). Nunca se
 * importa desde código que pueda llegar al bundle de cliente.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
