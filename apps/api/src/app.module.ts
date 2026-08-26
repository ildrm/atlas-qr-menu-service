import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { AnalyticsController, AnalyticsService } from "./analytics.js";
import { AuthController, AuthService } from "./auth.js";
import {
  BusinessController,
  BusinessService,
  EntitlementService,
} from "./business.js";
import { CatalogController, CatalogService } from "./catalog.js";
import { ApiExceptionFilter, PermissionGuard } from "./common.js";
import { DatabaseService } from "./database.service.js";
import { HealthController, HealthService } from "./health.js";
import {
  PublicCatalogController,
  PublicCatalogService,
} from "./public-catalog.js";
import { QrController, QrService } from "./qr.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [
    AuthController,
    BusinessController,
    CatalogController,
    QrController,
    PublicCatalogController,
    AnalyticsController,
    HealthController,
  ],
  providers: [
    DatabaseService,
    AuthService,
    BusinessService,
    EntitlementService,
    CatalogService,
    QrService,
    PublicCatalogService,
    AnalyticsService,
    HealthService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
