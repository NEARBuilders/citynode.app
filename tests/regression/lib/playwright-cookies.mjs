export function asSetCookieValue(value) {
  try {
    if (value !== decodeURIComponent(value)) return value;
  } catch {}
  return encodeURIComponent(value);
}

export function toPlaywrightCookies(cookies, baseUrl) {
  const origin = new URL(baseUrl);
  return cookies
    .filter((cookie) => cookie?.name && cookie?.value)
    .map((cookie) => {
      const mapped = {
        name: cookie.name,
        value: asSetCookieValue(cookie.value),
        url: origin.origin,
        httpOnly: cookie.httpOnly ?? true,
        sameSite: cookie.sameSite ?? "Lax",
      };
      if (typeof cookie.expires === "number") mapped.expires = cookie.expires;
      return mapped;
    });
}

export function cookiesFromHeader(cookieHeader) {
  return cookieHeader
    .split("; ")
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf("=");
      return {
        name: pair.slice(0, index),
        value: pair.slice(index + 1),
      };
    })
    .filter((cookie) => cookie.name);
}

export function fixtureAuthCookieOptions(baseUrl) {
  return {
    useSecureCookies: new URL(baseUrl).protocol === "https:",
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
    },
  };
}

export async function addSessionCookies(context, cookies, baseUrl) {
  await context.addCookies(toPlaywrightCookies(cookies, baseUrl));
}
