import type { Messages } from "@lingui/core";

export const LOGIN_LOCALES = ["en", "es"] as const;

export type LoginLocale = (typeof LOGIN_LOCALES)[number];

export const DEFAULT_LOGIN_LOCALE: LoginLocale = "en";
export const LOGIN_LOCALE_COOKIE = "citynode_locale";

export const LOGIN_LOCALE_LABELS: Record<LoginLocale, string> = {
  en: "English",
  es: "Español",
};

export const englishLoginMessages = {
  "auth.login.title": "Sign in",
  "auth.login.subtitle": "Connect your NEAR wallet to continue.",
  "auth.login.language": "Language",
  "auth.login.passkey.pending": "waiting for passkey...",
  "auth.login.passkey.action": "sign in with passkey",
  "auth.login.near.pending": "connecting...",
  "auth.login.near.continueAs": "Continue as {account}",
  "auth.login.near.useAnother": "Use another wallet",
  "auth.login.near.action": "connect with NEAR",
  "auth.login.phone.action": "sign in with phone",
  "auth.login.success.near": "Signed in with NEAR",
  "auth.login.success.passkey": "Signed in with passkey",
  "auth.login.error.used": "Sign-in already used",
  "auth.login.error.signature": "Invalid signature",
  "auth.login.error.walletUnavailable": "NEAR wallet not available",
  "auth.login.error.configuration": "Sign-in configuration error",
  "auth.login.error.expired": "Session expired, please try again",
  "auth.login.error.generic": "Failed to sign in",
  "auth.login.error.passkey": "Passkey sign-in failed",
  "auth.login.error.disconnect": "Failed to disconnect wallet",
  "auth.login.pair.startFailed": "Could not start device pairing",
  "auth.login.pair.completeFailed": "Failed to complete sign-in",
  "auth.login.pair.success": "Signed in",
  "auth.login.pair.expired": "This code expired. Start again to get a new one.",
  "auth.login.pair.denied": "Sign-in was denied on your phone.",
  "auth.login.pair.imageAlt": "Scan with your phone to sign in",
  "auth.login.pair.instructions": "Scan with your phone, or enter this code on your phone",
  "auth.login.pair.signingIn": "Signing in…",
  "auth.login.pair.waiting": "Waiting for approval…",
  "auth.login.pair.cancel": "Cancel",
} as const;

export type LoginMessageId = keyof typeof englishLoginMessages;
export type LoginMessageValues = Record<string, string | number>;
export type LoginTranslator = (id: LoginMessageId, values?: LoginMessageValues) => string;

const spanishLoginMessages = {
  "auth.login.title": "Iniciar sesión",
  "auth.login.subtitle": "Conecta tu billetera NEAR para continuar.",
  "auth.login.language": "Idioma",
  "auth.login.passkey.pending": "esperando la clave de acceso...",
  "auth.login.passkey.action": "iniciar sesión con una clave de acceso",
  "auth.login.near.pending": "conectando...",
  "auth.login.near.continueAs": "Continuar como {account}",
  "auth.login.near.useAnother": "Usar otra billetera",
  "auth.login.near.action": "conectar con NEAR",
  "auth.login.phone.action": "iniciar sesión con el teléfono",
  "auth.login.success.near": "Sesión iniciada con NEAR",
  "auth.login.success.passkey": "Sesión iniciada con una clave de acceso",
  "auth.login.error.used": "Este inicio de sesión ya se utilizó",
  "auth.login.error.signature": "Firma no válida",
  "auth.login.error.walletUnavailable": "La billetera NEAR no está disponible",
  "auth.login.error.configuration": "Error de configuración del inicio de sesión",
  "auth.login.error.expired": "La sesión ha caducado. Inténtalo de nuevo",
  "auth.login.error.generic": "No se pudo iniciar sesión",
  "auth.login.error.passkey": "No se pudo iniciar sesión con la clave de acceso",
  "auth.login.error.disconnect": "No se pudo desconectar la billetera",
  "auth.login.pair.startFailed": "No se pudo iniciar la vinculación del dispositivo",
  "auth.login.pair.completeFailed": "No se pudo completar el inicio de sesión",
  "auth.login.pair.success": "Sesión iniciada",
  "auth.login.pair.expired": "Este código ha caducado. Empieza de nuevo para obtener otro.",
  "auth.login.pair.denied": "El inicio de sesión fue rechazado en tu teléfono.",
  "auth.login.pair.imageAlt": "Escanea con tu teléfono para iniciar sesión",
  "auth.login.pair.instructions": "Escanea con tu teléfono o introduce este código en él",
  "auth.login.pair.signingIn": "Iniciando sesión…",
  "auth.login.pair.waiting": "Esperando aprobación…",
  "auth.login.pair.cancel": "Cancelar",
} satisfies Record<LoginMessageId, string>;

const translatedLoginMessages: Record<LoginLocale, Partial<Record<LoginMessageId, string>>> = {
  en: {},
  es: spanishLoginMessages,
};

export function withEnglishLoginFallback(
  translated: Partial<Record<LoginMessageId, string>>,
): Messages {
  return { ...englishLoginMessages, ...translated };
}

export function getLoginMessages(locale: LoginLocale): Messages {
  return withEnglishLoginFallback(translatedLoginMessages[locale]);
}
