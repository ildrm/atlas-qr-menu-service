import { createHmac } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyticsEvents,
  createDatabase,
  outboxEvents,
  qrScans,
} from "@atlas/database";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { z } from "zod";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    SESSION_PEPPER: z.string().min(32),
  })
  .parse(process.env);

const { db, pool } = createDatabase({
  connectionString: config.DATABASE_URL,
  application_name: "atlasqr-worker",
  max: 5,
});
const producerConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const workerConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const queue = new Queue("atlas-domain-events", {
  connection: producerConnection,
});

type OutboxRow = {
  id: string;
  business_id: string | null;
  event_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
};

async function claimOutboxBatch() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<OutboxRow>(`
      select id, business_id, event_type, aggregate_id, payload
      from outbox_events
      where status = 'pending' and available_at <= now()
      order by created_at
      for update skip locked
      limit 50
    `);
    if (result.rows.length) {
      await client.query(
        "update outbox_events set status = 'processing', attempts = attempts + 1 where id = any($1::uuid[])",
        [result.rows.map((row) => row.id)],
      );
    }
    await client.query("commit");
    return result.rows;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function pumpOutbox() {
  const rows = await claimOutboxBatch();
  for (const row of rows) {
    try {
      await queue.add(row.event_type, row, {
        jobId: row.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 2_000,
      });
    } catch (error) {
      await db
        .update(outboxEvents)
        .set({
          status: "pending",
          lastError:
            error instanceof Error
              ? error.message.slice(0, 1_000)
              : "Queue unavailable",
        })
        .where(eq(outboxEvents.id, row.id));
    }
  }
}

const worker = new Worker<OutboxRow>(
  "atlas-domain-events",
  async (job) => {
    const row = job.data;
    if (!row.business_id) return;
    if (row.event_type === "analytics.ingest") {
      const payload = row.payload as {
        eventName: string;
        visitorHash?: string;
        catalogId?: string;
        categoryId?: string;
        itemId?: string;
        qrCodeId?: string;
        properties?: Record<string, string | number | boolean | null>;
      };
      await db.insert(analyticsEvents).values({
        businessId: row.business_id,
        eventName: payload.eventName,
        visitorHash: payload.visitorHash,
        catalogId: payload.catalogId,
        categoryId: payload.categoryId,
        itemId: payload.itemId,
        qrCodeId: payload.qrCodeId,
        properties: payload.properties ?? {},
      });
    } else if (row.event_type === "qr.scanned") {
      const payload = row.payload as {
        qrCodeId: string;
        locale?: string;
        ip?: string;
        userAgent?: string;
      };
      const visitorHash = createHmac("sha256", config.SESSION_PEPPER)
        .update(`${payload.ip ?? ""}|${payload.userAgent ?? ""}`)
        .digest("hex");
      await db.insert(qrScans).values({
        businessId: row.business_id,
        qrCodeId: payload.qrCodeId,
        visitorHash,
        locale: payload.locale,
        deviceClass: /mobile/i.test(payload.userAgent ?? "")
          ? "mobile"
          : "desktop",
      });
    }
    await db
      .update(outboxEvents)
      .set({ status: "delivered", processedAt: new Date(), lastError: null })
      .where(eq(outboxEvents.id, row.id));
  },
  { connection: workerConnection, concurrency: 8 },
);

worker.on("failed", async (job, error) => {
  if (!job) return;
  const terminal = job.attemptsMade >= (job.opts.attempts ?? 1);
  await db
    .update(outboxEvents)
    .set({
      status: terminal ? "dead_letter" : "pending",
      lastError: error.message.slice(0, 1_000),
      availableAt: new Date(Date.now() + 30_000),
    })
    .where(eq(outboxEvents.id, job.data.id));
});

const interval = setInterval(
  () =>
    void pumpOutbox().catch((error) =>
      process.stderr.write(`${String(error)}\n`),
    ),
  2_000,
);
await pumpOutbox();

async function shutdown() {
  clearInterval(interval);
  await worker.close();
  await queue.close();
  producerConnection.disconnect();
  workerConnection.disconnect();
  await pool.end();
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
