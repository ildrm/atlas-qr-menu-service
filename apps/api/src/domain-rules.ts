import type { Permission } from "@atlas/contracts";

export function can(permissions: readonly Permission[], required: Permission) {
  return permissions.includes(required);
}

export function isWithinEntitlement(
  limit: boolean | number | string | undefined,
  currentUsage: number,
) {
  if (typeof limit !== "number") return limit !== false;
  return currentUsage < limit;
}

export function translationFallback<T>(
  translations: ReadonlyMap<string, T>,
  requestedLocale: string,
  businessLocale: string,
  source: T,
) {
  return (
    translations.get(requestedLocale) ??
    translations.get(businessLocale) ??
    source
  );
}

export function validateSelectionCount(
  selected: number,
  minimum: number,
  maximum: number | null,
) {
  return selected >= minimum && (maximum === null || selected <= maximum);
}

export function isSafeExternalQrTarget(
  input: string,
  allowedHosts: ReadonlySet<string>,
) {
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isScheduleActive(
  schedule: {
    days: readonly number[];
    startMinutes: number;
    endMinutes: number;
  },
  local: { day: number; minute: number },
) {
  const overnight = schedule.endMinutes <= schedule.startMinutes;
  if (!overnight)
    return (
      schedule.days.includes(local.day) &&
      local.minute >= schedule.startMinutes &&
      local.minute < schedule.endMinutes
    );
  const previousDay = (local.day + 6) % 7;
  return (
    (schedule.days.includes(local.day) &&
      local.minute >= schedule.startMinutes) ||
    (schedule.days.includes(previousDay) && local.minute < schedule.endMinutes)
  );
}
