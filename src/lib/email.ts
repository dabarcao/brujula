import { Resend } from "resend";

// Mismo criterio que ANTHROPIC_API_KEY (src/lib/aiInterpretation.ts): sin
// RESEND_API_KEY configurada, no se envía nada y no se rompe nada — así
// el resto de la app sigue funcionando igual en local sin la clave, y
// activar el envío real es solo añadir la variable de entorno, nunca un
// cambio de código.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = "Brújula <notificaciones@brujula.kairos-experience.es>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) return;

  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`No se pudo enviar el email a ${to}:`, error);
    }
  } catch (e) {
    console.error(`No se pudo enviar el email a ${to}:`, e);
  }
}

// URL absoluta del sitio, para enlaces dentro de emails (a diferencia de
// la navegación normal de Next.js, un email no puede usar rutas
// relativas). NEXT_PUBLIC_SITE_URL manda si está puesta (producción,
// dominio propio); si no, VERCEL_URL (la que Vercel expone en cada
// despliegue); si no, localhost para desarrollo.
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
