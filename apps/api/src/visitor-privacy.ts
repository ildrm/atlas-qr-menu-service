import { createHmac } from "node:crypto";

export type PublicVisitorDomain = "analytics" | "qr";
export type DeviceClass = "bot" | "desktop" | "mobile" | "tablet" | "unknown";

export function hashPublicVisitor(
  secret: string,
  domain: PublicVisitorDomain,
  businessId: string,
  source: string,
) {
  return createHmac("sha256", secret)
    .update(`${domain}:v1:${businessId}:${source.slice(0, 1_024)}`)
    .digest("hex");
}

export function classifyDevice(userAgent: string | undefined): DeviceClass {
  const normalized = userAgent?.slice(0, 500).toLowerCase();
  if (!normalized) return "unknown";
  if (/bot|crawler|spider|slurp|headless/.test(normalized)) return "bot";
  if (/ipad|tablet|kindle|silk|playbook/.test(normalized)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(normalized)) return "mobile";
  return "desktop";
}

export function normalizePublicLocale(
  preferred: string | undefined,
  acceptLanguage: string | string[] | undefined,
) {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage[0]
    : acceptLanguage;
  const headerLocale = header?.split(",", 1)[0]?.split(";", 1)[0]?.trim();

  for (const candidate of [preferred, headerLocale]) {
    if (!candidate || candidate.length > 35) continue;
    try {
      const [canonical] = Intl.getCanonicalLocales(candidate);
      if (canonical && canonical.length <= 35) return canonical;
    } catch {
      // Ignore malformed, untrusted Accept-Language values.
    }
  }
  return undefined;
}
