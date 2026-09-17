// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): manager
// layer owning the login/logout domain. Calls `@/server/db/auth` for the
// Supabase Auth half, plus `signAppToken` (not `requireApiToken` -- that's
// Route-Handler-side only, per Story 1.4/1.5's own established split) from
// `@/server/shared/auth` to issue the app token on successful login.
// Returns the token string to the caller; cookie-setting and redirect()
// stay one layer up in the Server Action (Story 3.4), matching every prior
// manager's "no Next.js specifics" rule -- this file never imports
// @supabase/supabase-js or @supabase/ssr directly, and never calls
// redirect()/revalidatePath() or reads cookies/headers itself.
//
// `@/server/shared/auth` is a deliberate, narrow exception to "managers
// only call @/server/db/*": it's a self-contained first-party-token
// utility (node:crypto only, no Supabase/Next.js-specifics imports of its
// own) documented as its own layer in ARCHITECTURE-SPINE.md AD-5/AD-6, not
// a Supabase-access bypass -- not a precedent for managers reaching
// outside @/server/db/*+@/server/managers/* for anything else.
//
// Read-only reference this orchestration mirrors: src/app/actions/auth.ts's
// signIn/signOut (unmodified by this story).

import "server-only";
import {
  signInWithPassword,
  signOut as dbSignOut,
  getCurrentUser as dbGetCurrentUser,
  getCurrentUserWithMetadata as dbGetCurrentUserWithMetadata,
  signUpWithInviteToken as dbSignUpWithInviteToken,
  signUpIndividualAccount as dbSignUpIndividualAccount,
  type CurrentUser,
  type CurrentUserWithMetadata,
} from "@/server/db/auth";
import { signAppToken } from "@/server/shared/auth";

export type { CurrentUser, CurrentUserWithMetadata };

/**
 * Signs in with email/password, then issues a first-party app token for
 * the authenticated user. Throws the Auth SDK's own error message on
 * invalid credentials -- not swallowed. Does not set any cookies itself;
 * the caller (Story 3.4's Server Action) is responsible for that, exactly
 * as src/app/actions/auth.ts's signIn does today.
 */
export async function signIn(email: string, password: string): Promise<{ appToken: string }> {
  const authUserId = await signInWithPassword(email, password);
  const appToken = signAppToken(authUserId);
  return { appToken };
}

/**
 * Signs out of the Supabase Auth session. Resolves, never throws (mirrors
 * db/auth.ts's own branch-free signOut). Does not clear any cookies itself;
 * the caller (Story 3.4's Server Action) is responsible for that, exactly
 * as src/app/actions/auth.ts's signOut does today.
 */
export async function signOut(): Promise<void> {
  await dbSignOut();
}

/**
 * Story 6.3: resolves the current session's user, or `null` if not logged
 * in. The one universal session-resolution call nearly every page needs --
 * see db/auth.ts's own getCurrentUser() for the full rationale.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return dbGetCurrentUser();
}

/**
 * Like `getCurrentUser`, but also surfaces the signup-time `user_metadata`
 * fields `dashboard/page.tsx`'s bootstrap block needs. See db/auth.ts's own
 * `getCurrentUserWithMetadata` for the full rationale.
 */
export async function getCurrentUserWithMetadata(): Promise<CurrentUserWithMetadata | null> {
  return dbGetCurrentUserWithMetadata();
}

/**
 * Signs up a new auth user for the accept-invite flow, stashing the invite
 * token in `user_metadata` for the post-confirmation bootstrap to consume.
 * Throws the Auth SDK's own error message on failure. Does not set any
 * cookies or redirect() itself -- the caller (actions/auth.ts) does that,
 * same as `signIn`.
 */
export async function acceptInviteSignUp(
  email: string,
  password: string,
  inviteToken: string
): Promise<void> {
  await dbSignUpWithInviteToken(email, password, inviteToken);
}

/**
 * Signs up a new auth user for the individual-account flow, stashing
 * `pending_individual_signup`/`full_name` in `user_metadata` for the
 * post-confirmation bootstrap to consume. Throws the Auth SDK's own error
 * message on failure. Does not set any cookies or redirect() itself -- the
 * caller (actions/auth.ts) does that, same as `signIn`.
 */
export async function individualSignUp(
  email: string,
  password: string,
  fullName: string
): Promise<void> {
  await dbSignUpIndividualAccount(email, password, fullName);
}
