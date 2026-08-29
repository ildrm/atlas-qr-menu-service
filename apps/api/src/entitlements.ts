import { HttpException, HttpStatus } from "@nestjs/common";

const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "grace"] as const;

type PlanLimitConfiguration = {
  status: string;
  planActive: boolean;
  value: boolean | number | string | null;
};

export function throwEntitlementConfigurationError(
  entitlementKey: string,
  message = `The ${entitlementKey} entitlement is not configured.`,
): never {
  throw new HttpException(
    {
      code: "ENTITLEMENT_CONFIGURATION_ERROR",
      message,
      details: { entitlementKey },
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function throwLimitReached(
  entitlementKey: string,
  currentUsage: number,
  limit: number,
): never {
  throw new HttpException(
    {
      code: "LIMIT_REACHED",
      message: `The ${entitlementKey} plan limit has been reached.`,
      details: { entitlementKey, currentUsage, limit },
    },
    HttpStatus.CONFLICT,
  );
}

export function assertPlanLimit(
  configuration: PlanLimitConfiguration | undefined,
  entitlementKey: string,
  currentUsage: number,
) {
  if (
    !configuration ||
    !configuration.planActive ||
    !ACTIVE_SUBSCRIPTION_STATUSES.includes(
      configuration.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    throw new HttpException(
      {
        code: "SUBSCRIPTION_INACTIVE",
        message: "An active subscription is required for this operation.",
        details: {
          entitlementKey,
          subscriptionStatus: configuration?.status ?? "missing",
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  if (configuration.value === "unlimited") return;
  if (
    typeof configuration.value !== "number" ||
    !Number.isSafeInteger(configuration.value) ||
    configuration.value < 0
  ) {
    throwEntitlementConfigurationError(entitlementKey);
  }
  if (currentUsage >= configuration.value)
    throwLimitReached(entitlementKey, currentUsage, configuration.value);
}
