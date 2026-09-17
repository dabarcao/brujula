import { NextResponse } from "next/server";

// Served from the app's own origin (not a separate host) so that
// Swagger's "Try it out" calls to /api/* carry the brujula_app_token
// cookie automatically — no CORS/cross-origin cookie problem to work around.
const HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brújula Core API — Swagger</title>
<link rel="stylesheet" href="/swagger-ui.css" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper: #F7F4EE;
    --paper-deep: #FFFFFF;
    --surface-2: #EFEADD;
    --ink: #1C2033;
    --ink-soft: #5B5F7A;
    --line: #E4DFD3;
    --indigo: #3B4FA6;
    --indigo-deep: #232F73;
    --indigo-wash: #E7EAF7;
    --coral: #FF6B4A;
    --coral-deep: #A8391F;
    --coral-wash: #FFE4DA;
    --amber: #B8860B;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #171A26; --paper-deep: #1F2335; --surface-2: #232743;
      --ink: #EDEEF7; --ink-soft: #A9ADCC; --line: #333A5C;
      --indigo: #7C8FE0; --indigo-deep: #AEB9F0; --indigo-wash: #262C4C;
      --coral: #FF9478; --coral-deep: #FFC1AD; --coral-wash: #3A2A28;
      --amber: #E0B84A;
    }
  }
  :root[data-theme="dark"] {
    --paper: #171A26; --paper-deep: #1F2335; --surface-2: #232743;
    --ink: #EDEEF7; --ink-soft: #A9ADCC; --line: #333A5C;
    --indigo: #7C8FE0; --indigo-deep: #AEB9F0; --indigo-wash: #262C4C;
    --coral: #FF9478; --coral-deep: #FFC1AD; --coral-wash: #3A2A28;
    --amber: #E0B84A;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); font-family: Inter, system-ui, sans-serif; color: var(--ink); }
  .topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 24px; background: var(--paper-deep); border-bottom: 1px solid var(--line);
  }
  .topbar h1 {
    font-family: Sora, system-ui, sans-serif; font-size: 18px; font-weight: 700; margin: 0;
    color: var(--indigo-deep);
  }
  .topbar .compass { width: 28px; height: 28px; flex-shrink: 0; }
  .topbar .badge {
    margin-left: auto; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
    background: var(--indigo-wash); color: var(--indigo-deep); font-family: Inter, sans-serif;
  }
  .authbar {
    padding: 10px 24px; background: var(--coral-wash); border-bottom: 1px solid var(--line);
    font-size: 13px; color: var(--coral-deep); font-family: Inter, sans-serif;
  }
  .authbar code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; }
  #swagger-ui { max-width: 1400px; margin: 0 auto; padding: 8px 16px 48px; }
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info { margin: 24px 0; }
  .swagger-ui .info .title { font-family: Sora, sans-serif; color: var(--indigo-deep); }
  .swagger-ui .opblock.opblock-post { background: var(--coral-wash); border-color: var(--coral); }
  .swagger-ui .opblock.opblock-post .opblock-summary-method { background: var(--coral); }
  .swagger-ui .opblock.opblock-get { background: var(--indigo-wash); border-color: var(--indigo); }
  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: var(--indigo); }
  .swagger-ui .opblock.opblock-patch { background: #FBF3DE; border-color: var(--amber); }
  .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: var(--amber); }
  .swagger-ui .btn.execute { background-color: var(--indigo); border-color: var(--indigo-deep); }
</style>
</head>
<body>
  <div class="topbar">
    <svg class="compass" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" style="color:var(--indigo)"/>
      <path d="M20 12l-6 4 -2 6 6-4 2-6z" fill="var(--coral)"/>
    </svg>
    <h1>Brújula Core API</h1>
    <span class="badge">Epic 3 en progreso</span>
  </div>
  <div class="authbar">
    Servido desde este mismo origen — las llamadas "Try it out" llevan la cookie <code>brujula_app_token</code> automáticamente.
    Inicia sesión primero con <code>POST /api/auth/signin</code> (abajo) o desde la pantalla normal de login en otra pestaña.
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.29.1/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.29.1/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        withCredentials: true,
        docExpansion: "list",
        persistAuthorization: true
      });
    };
  </script>
</body>
</html>
`;

export async function GET() {
  return new NextResponse(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
