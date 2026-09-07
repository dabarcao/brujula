import type { SupabaseClient } from "@supabase/supabase-js";

// Texto editable desde platform_texts (hoy directamente en Supabase, un
// panel de admin queda pendiente — ver 0044_platform_texts.sql). Si la
// clave no existe todavía (por ejemplo, la migración no se ha aplicado),
// se usa el texto de respaldo en vez de romper la página.
export async function getPlatformText(
  supabase: SupabaseClient,
  key: string,
  fallback: string
): Promise<string> {
  const { data } = await supabase
    .from("platform_texts")
    .select("content")
    .eq("key", key)
    .maybeSingle();

  return data?.content || fallback;
}
