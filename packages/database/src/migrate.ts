import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { config as loadEnvironment } from "dotenv";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
loadEnvironment({
  path: resolve(moduleDirectory, "../../../.env"),
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const migrationsDirectory = resolve(moduleDirectory, "../migrations");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(`
    create table if not exists atlas_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const filenames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    const body = await readFile(resolve(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const applied = await pool.query<{ checksum: string }>(
      "select checksum from atlas_migrations where name = $1",
      [filename],
    );
    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error(`Applied migration changed: ${filename}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(body);
      await client.query(
        "insert into atlas_migrations (name, checksum) values ($1, $2)",
        [filename, checksum],
      );
      await client.query("commit");
      process.stdout.write(`Applied ${filename}\n`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
