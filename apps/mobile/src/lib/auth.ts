// Metodi di accesso: Apple (nativo iOS), Google (OAuth PKCE via browser di sistema), email OTP.

import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { env, IS_WEB } from "./env";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export class AuthCancelled extends Error {}

export async function isAppleSignInAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple(): Promise<void> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new AuthCancelled();
    throw err;
  }
  if (!credential.identityToken) throw new Error("Apple non ha restituito un token");
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  if (IS_WEB) {
    // Sul web: redirect a pagina intera; la sessione si completa in app/auth-callback.tsx.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl() },
    });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL("auth-callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error("URL OAuth mancante");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new AuthCancelled();
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== "string") throw new Error("Codice OAuth mancante");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/** Dove riporta il link "magico" nell'email (app/auth-callback.tsx scambia il codice). */
export function authCallbackUrl(): string {
  return IS_WEB ? `${window.location.origin}${env.webBasePath}/auth-callback` : Linking.createURL("auth-callback");
}

/**
 * Invia l'email di accesso. Con i template predefiniti di Supabase contiene un link;
 * con un template personalizzato (serve SMTP proprio) può contenere anche il codice a 6 cifre.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}

/** Beta aperta: account ospite senza email, legato a questo browser/dispositivo. */
export async function signInAsGuest(): Promise<void> {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
