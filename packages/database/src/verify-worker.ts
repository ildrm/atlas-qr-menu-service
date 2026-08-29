import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import { config as loadEnvironment } from "dotenv";

import { createDatabase } from "./index.js";
import {
  analyticsEvents,
  businesses,
  catalogs,
  outboxEvents,
} from "./schema.js";

loadEnvironment({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

if (process.env.NODE_ENV === "production") {
  throw new Error("Worker smoke verification is disabled in production");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const { db, pool } = createDatabase({
  connectionString,
  application_name: "atlasqr-worker-verification",
  max: 2,
});

const verificationId = randomUUID();

try {
  const [target] = await db
    .select({ businessId: businesses.id, catalogId: catalogs.id })
    .from(catalogs)
    .innerJoin(businesses, eq(businesses.id, catalogs.businessId))
    .where(and(eq(businesses.public, true), eq(catalogs.status, "published")))
    .limit(1);
  if (!target)
    throw new Error("Seed a published public catalog before verifying worker");

  const [event] = await db
    .insert(outboxEvents)
    .values({
      businessId: target.businessId,
      eventType: "analytics.ingest",
      aggregateType: "analytics",
      aggregateId: target.catalogId,
      payload: {
        eventName: "catalog_viewed",
        catalogId: target.catalogId,
        properties: { workerVerificationId: verificationId },
      },
    })
    .returning({ id: outboxEvents.id });
  if (!event) throw new Error("Could not create worker verification event");

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const [delivery] = await db
      .select({
        status: outboxEvents.status,
        lastError: outboxEvents.lastError,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id))
      .limit(1);
    const [fact] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.businessId, target.businessId),
          eq(analyticsEvents.catalogId, target.catalogId),
          eq(analyticsEvents.properties, {
            workerVerificationId: verificationId,
          }),
        ),
      )
      .limit(1);

    if (delivery?.status === "delivered" && fact) {
      process.stdout.write(`Worker delivered verification event ${event.id}\n`);
      process.exitCode = 0;
      break;
    }
    if (delivery?.status === "dead_letter")
      throw new Error(
        `Worker verification event dead-lettered: ${delivery.lastError ?? "unknown error"}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (process.exitCode !== 0)
    throw new Error("Worker did not deliver the verification event in 20s");
} finally {
  await pool.end();
}
