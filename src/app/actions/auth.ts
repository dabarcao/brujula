"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { APP_TOKEN_COOKIE, APP_TOKEN_TTL_SECONDS } from "@/server/shared/auth";
import {
  signIn as authManagerSignIn,
  signOut as authManagerSignOut,
  acceptInviteSignUp as authManagerAcceptInviteSignUp,
  individualSignUp as authManagerIndividualSignUp,
} from "@/server/managers/authManager";

export async function acceptInviteSignUp(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!token || !email || !password) {
    redirect(
      `/invitacion/${token}?error=` + encodeURIComponent("Rellena todos los campos.")
    );
  }

  // Igual que con pending_org_name (alta de empresa): hasta que el usuario
  // confirme su correo e inicie sesión por primera vez no podemos vincular
  // esta cuenta al "members" que ya creó RRHH (ver /dashboard, que resuelve
  // esto llamando a accept_member_invite).
  try {
    await authManagerAcceptInviteSignUp(email, password, token);
  } catch (e) {
    redirect(
      `/invitacion/${token}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  redirect(
    "/login?message=" +
      encodeURIComponent(
        `Te hemos enviado un correo a ${email} para confirmar tu cuenta. Después de confirmarlo, inicia sesión para completar tu alta.`
      )
  );
}

export async function individualSignUp(formData: FormData) {
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!fullName || !email || !password) {
    redirect("/registro?error=" + encodeURIComponent("Rellena todos los campos."));
  }

  // Igual que con pending_invite_token: hasta que confirme el correo e
  // inicie sesión por primera vez no podemos crear su organización
  // individual (ver /dashboard, que resuelve esto llamando a
  // create_individual_account).
  try {
    await authManagerIndividualSignUp(email, password, fullName);
  } catch (e) {
    redirect(
      "/registro?error=" + encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  redirect(
    "/login?message=" +
      encodeURIComponent(
        `Te hemos enviado un correo a ${email} para confirmar tu cuenta. Después de confirmarlo, inicia sesión para empezar.`
      )
  );
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  let appToken: string;
  try {
    const result = await authManagerSignIn(email, password);
    appToken = result.appToken;
  } catch (e) {
    redirect("/login?error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }

  const cookieStore = await cookies();
  cookieStore.set(APP_TOKEN_COOKIE, appToken, {
    httpOnly: true,
    // `secure: true` a fuego se descartaba en local sobre HTTP en
    // navegadores que no hacen la excepción especial de Chrome para
    // "localhost" (Firefox/Safari, o incluso Chrome si se entra por
    // 127.0.0.1 en vez de localhost) -- la cookie nunca se guardaba, y
    // cualquier ruta bajo requireApiToken() (src/server/shared/auth.ts)
    // fallaba con 401 sin que signIn ni el login fallaran visiblemente.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_TOKEN_TTL_SECONDS,
  });

  redirect("/dashboard");
}

export async function signOut() {
  await authManagerSignOut();

  // Story 1.4 follow-up: clear the app token alongside the Supabase
  // session, so a signed-out user doesn't keep a valid app token for the
  // rest of its 7-day TTL.
  const cookieStore = await cookies();
  cookieStore.delete(APP_TOKEN_COOKIE);

  redirect("/login");
}
