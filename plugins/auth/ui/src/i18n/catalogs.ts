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
  "auth.login.title": "Sign in to CityNode",
  "auth.login.subtitle": "Welcome back. Pick how you want to sign in.",
  "auth.login.subtitle.stake": "Sign in to stake with a CityNode community.",
  "auth.login.language": "Language",
  "auth.login.passkey.savedLabel": "Saved passkey",
  "auth.login.passkey.savedPlaceholder": "Choose a saved passkey",
  "auth.login.passkey.pending": "Waiting for passkey…",
  "auth.login.passkey.action": "Sign in with passkey",
  "auth.login.passkey.missingDesktop":
    "No passkey on this device? Use your phone or a NEAR wallet.",
  "auth.login.passkey.missingMobile": "No passkey on this device? Use a NEAR wallet.",
  "auth.login.near.continueAs": "Continue as {account}",
  "auth.login.near.useAnother": "Use another wallet",
  "auth.login.near.action": "Continue with NEAR",
  "auth.login.phone.action": "Sign in with your phone",
  "auth.login.phone.title": "Sign in with your phone",
  "auth.login.phone.subtitle": "Scan with a phone that's signed in to CityNode.",
  "auth.login.create.title": "Create your account",
  "auth.login.create.subtitle.wallet":
    "One passkey on this device. We set up a NEAR wallet for you — no seed phrase.",
  "auth.login.create.subtitle.default": "One passkey on this device. No password to remember.",
  "auth.login.create.action": "Create account with passkey",
  "auth.login.create.unsupported":
    "This device can't create a supported passkey. Use a NEAR wallet instead.",
  "auth.login.create.existing": "Already have an account?",
  "auth.login.create.new": "New here?",
  "auth.login.create.link": "Create an account",
  "auth.login.signIn": "Sign in",
  "auth.login.suspended": "This account has been suspended.",
  "auth.login.separator": "or",
  "auth.login.success.create": "Welcome to CityNode",
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
  "auth.login.error.nearConnect": "Failed to connect your NEAR wallet",
  "auth.login.pair.startFailed": "Could not start device pairing",
  "auth.login.pair.completeFailed": "Failed to complete sign-in",
  "auth.login.pair.success": "Signed in",
  "auth.login.pair.expired": "This code expired. Start again to get a new one.",
  "auth.login.pair.denied": "Sign-in was denied on your phone.",
  "auth.login.pair.imageAlt": "Scan with your phone to sign in",
  "auth.login.pair.instructions": "Or enter this code on your phone",
  "auth.login.pair.signingIn": "Signing in…",
  "auth.login.pair.waiting": "Waiting for your phone…",
  "auth.login.pair.cancel": "Other ways to sign in",
} as const;

export type LoginMessageId = keyof typeof englishLoginMessages;
export type LoginMessageValues = Record<string, string | number>;
export type LoginTranslator = (id: LoginMessageId, values?: LoginMessageValues) => string;

const spanishLoginMessages = {
  "auth.login.title": "Inicia sesión en CityNode",
  "auth.login.subtitle": "Te damos la bienvenida. Elige cómo quieres iniciar sesión.",
  "auth.login.subtitle.stake": "Inicia sesión para delegar con una comunidad de CityNode.",
  "auth.login.language": "Idioma",
  "auth.login.passkey.savedLabel": "Clave de acceso guardada",
  "auth.login.passkey.savedPlaceholder": "Elige una clave de acceso guardada",
  "auth.login.passkey.pending": "Esperando la clave de acceso…",
  "auth.login.passkey.action": "Iniciar sesión con una clave de acceso",
  "auth.login.passkey.missingDesktop":
    "¿No hay una clave de acceso en este dispositivo? Usa tu teléfono o una billetera NEAR.",
  "auth.login.passkey.missingMobile":
    "¿No hay una clave de acceso en este dispositivo? Usa una billetera NEAR.",
  "auth.login.near.continueAs": "Continuar como {account}",
  "auth.login.near.useAnother": "Usar otra billetera",
  "auth.login.near.action": "Continuar con NEAR",
  "auth.login.phone.action": "Iniciar sesión con tu teléfono",
  "auth.login.phone.title": "Iniciar sesión con tu teléfono",
  "auth.login.phone.subtitle": "Escanea con un teléfono que tenga una sesión de CityNode abierta.",
  "auth.login.create.title": "Crea tu cuenta",
  "auth.login.create.subtitle.wallet":
    "Una clave de acceso en este dispositivo. Configuraremos una billetera NEAR para ti, sin frase semilla.",
  "auth.login.create.subtitle.default":
    "Una clave de acceso en este dispositivo. No hay contraseña que recordar.",
  "auth.login.create.action": "Crear una cuenta con una clave de acceso",
  "auth.login.create.unsupported":
    "Este dispositivo no puede crear una clave de acceso compatible. Usa una billetera NEAR.",
  "auth.login.create.existing": "¿Ya tienes una cuenta?",
  "auth.login.create.new": "¿Eres nuevo aquí?",
  "auth.login.create.link": "Crear una cuenta",
  "auth.login.signIn": "Iniciar sesión",
  "auth.login.suspended": "Esta cuenta ha sido suspendida.",
  "auth.login.separator": "o",
  "auth.login.success.create": "Te damos la bienvenida a CityNode",
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
  "auth.login.error.nearConnect": "No se pudo conectar tu billetera NEAR",
  "auth.login.pair.startFailed": "No se pudo iniciar la vinculación del dispositivo",
  "auth.login.pair.completeFailed": "No se pudo completar el inicio de sesión",
  "auth.login.pair.success": "Sesión iniciada",
  "auth.login.pair.expired": "Este código ha caducado. Empieza de nuevo para obtener otro.",
  "auth.login.pair.denied": "El inicio de sesión fue rechazado en tu teléfono.",
  "auth.login.pair.imageAlt": "Escanea con tu teléfono para iniciar sesión",
  "auth.login.pair.instructions": "O introduce este código en tu teléfono",
  "auth.login.pair.signingIn": "Iniciando sesión…",
  "auth.login.pair.waiting": "Esperando a tu teléfono…",
  "auth.login.pair.cancel": "Otras formas de iniciar sesión",
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
