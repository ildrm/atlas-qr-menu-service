import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  businesses,
  createDatabase,
  memberships,
  roles,
} from "@atlas/database";
import type { Permission } from "@atlas/contracts";
import { and, eq } from "drizzle-orm";

import { appConfig } from "./config.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection = createDatabase({
    connectionString: appConfig.DATABASE_URL,
    max: appConfig.NODE_ENV === "production" ? 20 : 8,
    statement_timeout: 10_000,
    application_name: "atlasqr-api",
  });
  readonly db = this.connection.db;
  readonly pool = this.connection.pool;

  async findMembership(userId: string, businessId: string) {
    const [membership] = await this.db
      .select({
        membershipId: memberships.id,
        branchScope: memberships.branchScope,
        permissions: roles.permissions,
      })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .innerJoin(businesses, eq(businesses.id, memberships.businessId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.businessId, businessId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) return null;
    return {
      ...membership,
      permissions: membership.permissions as Permission[],
    };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
