import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cierra un gap de arquitectura real, señalado desde el principio de este
// proyecto y nunca resuelto (ARCHITECTURE-SPINE.md AD-6, "Known
// discrepancy to verify during the POC"): src/lib/supabase/server.ts's
// propio comentario decía "el middleware ya se encarga de refrescar la
// sesión", pero este archivo no existía. Sin él, la cookie de sesión de
// Supabase de un usuario nunca se refresca sola entre visitas -- en local
// casi no se nota (sesiones cortas, recargas constantes durante
// desarrollo), pero en producción una sesión larga acaba con un token
// caducado y empieza a fallar la autorización en silencio.
//
// Nombrado `proxy.ts` (no `middleware.ts`): en Next.js 16 el archivo
// `middleware.ts`/la función `middleware` quedaron deprecados y renombrados
// a `proxy.ts`/`proxy` (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md) -- Proxy además pasa a usar por defecto el
// runtime de Node.js, no Edge. Usar el nombre viejo compiló bien en local
// pero rompió el build real de Vercel (ENOENT buscando
// .next/server/middleware.js.nft.json, un artefacto de rastreo Node.js que
// el shim de compatibilidad del nombre deprecado no genera igual) --
// descubierto en el primer intento de despliegue real, no algo teórico.
//
// Patrón oficial de @supabase/ssr para Next.js App Router: crea un
// cliente por request, deja que `supabase.auth.getUser()` refresque el
// token si hace falta, y propaga las cookies actualizadas tanto a
// `request` (para que el resto de este mismo request las vea) como a la
// respuesta (para que el navegador las reciba). `getUser()` (no
// `getSession()`) es la llamada real a Supabase Auth que fuerza el
// refresco -- `getSession()` solo lee la cookie tal cual está.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // El valor de retorno no se usa aquí -- el efecto que importa es el
  // refresco de cookies vía setAll de arriba, que ya deja `supabaseResponse`
  // lista. Cada página/Server Action sigue resolviendo su propio usuario a
  // través de authManager.getCurrentUser() (src/server/db/auth.ts), como
  // siempre -- este middleware no sustituye esa capa, solo evita que su
  // cookie de entrada llegue caducada.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Todo excepto assets estáticos (_next/static, _next/image, favicon,
    // imágenes) -- no hace falta refrescar sesión para servir un archivo
    // que no depende de quién lo pide.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
