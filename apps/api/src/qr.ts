import { createHash, randomBytes } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  auditEvents,
  branches,
  businesses,
  catalogs,
  outboxEvents,
  qrCodes,
} from "@atlas/database";
import { createQrSchema } from "@atlas/contracts";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import QRCode from "qrcode";
import type { FastifyReply } from "fastify";

import { EntitlementService } from "./business.js";
import {
  CurrentAuth,
  parseBody,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
  type RequestAuthContext,
} from "./common.js";
import { appConfig } from "./config.js";
import { DatabaseService } from "./database.service.js";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class QrService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementService,
  ) {}

  async list(businessId: string) {
    return this.database.db
      .select({
        id: qrCodes.id,
        name: qrCodes.name,
        publicToken: qrCodes.publicToken,
        targetType: qrCodes.targetType,
        targetId: qrCodes.targetId,
        context: qrCodes.context,
        style: qrCodes.style,
        active: qrCodes.active,
        createdAt: qrCodes.createdAt,
      })
      .from(qrCodes)
      .where(eq(qrCodes.businessId, businessId))
      .orderBy(qrCodes.name);
  }

  async create(
    businessId: string,
    userId: string,
    body: unknown,
    requestId: string,
  ) {
    const input = parseBody(createQrSchema, body);
    const [usage] = await this.database.db
      .select({ value: count() })
      .from(qrCodes)
      .where(eq(qrCodes.businessId, businessId));
    await this.entitlements.assertWithinLimit(
      businessId,
      "max.qr_codes",
      usage?.value ?? 0,
    );
    if (input.targetType === "catalog") {
      const [catalog] = await this.database.db
        .select({ id: catalogs.id })
        .from(catalogs)
        .where(
          and(
            eq(catalogs.id, input.targetId),
            eq(catalogs.businessId, businessId),
          ),
        )
        .limit(1);
      if (!catalog)
        throw new Error("QR target does not belong to this business");
    }
    const publicToken = randomBytes(18).toString("base64url");
    const context = Object.fromEntries(
      Object.entries(input.context).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const [qr] = await this.database.db
      .insert(qrCodes)
      .values({
        businessId,
        branchId: input.branchId,
        campaignId: input.campaignId,
        name: input.name,
        publicToken,
        tokenHash: tokenHash(publicToken),
        targetType: input.targetType,
        targetId: input.targetId,
        context,
        style: input.style,
        createdBy: userId,
      })
      .returning();
    if (!qr) throw new Error("Could not create QR code");
    await this.database.db.insert(auditEvents).values({
      businessId,
      actorUserId: userId,
      action: "qr.created",
      entityType: "qr_code",
      entityId: qr.id,
      requestId,
    });
    return {
      ...qr,
      resolverUrl: `${appConfig.PUBLIC_QR_BASE_URL}/${qr.publicToken}`,
    };
  }

  async svg(businessId: string, qrCodeId: string) {
    const [qr] = await this.database.db
      .select()
      .from(qrCodes)
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.businessId, businessId)))
      .limit(1);
    if (!qr) return null;
    const style = qr.style as {
      foreground?: string;
      background?: string;
      errorCorrection?: "L" | "M" | "Q" | "H";
    };
    return QRCode.toString(
      `${appConfig.PUBLIC_QR_BASE_URL}/${qr.publicToken}`,
      {
        type: "svg",
        errorCorrectionLevel: style.errorCorrection ?? "M",
        color: {
          dark: style.foreground ?? "#14352B",
          light: style.background ?? "#FFFFFF",
        },
        margin: 3,
        width: 1024,
      },
    );
  }

  async resolve(publicToken: string, request: AuthenticatedRequest) {
    if (!/^[A-Za-z0-9_-]{24}$/.test(publicToken)) return null;
    const [qr] = await this.database.db
      .select({
        id: qrCodes.id,
        businessId: qrCodes.businessId,
        branchId: qrCodes.branchId,
        targetType: qrCodes.targetType,
        targetId: qrCodes.targetId,
        context: qrCodes.context,
      })
      .from(qrCodes)
      .where(
        and(
          eq(qrCodes.publicToken, publicToken),
          eq(qrCodes.tokenHash, tokenHash(publicToken)),
          eq(qrCodes.active, true),
          or(isNull(qrCodes.expiresAt), gt(qrCodes.expiresAt, new Date())),
        ),
      )
      .limit(1);
    if (!qr || qr.targetType !== "catalog" || !qr.targetId) return null;
    const [destination] = await this.database.db
      .select({ businessSlug: businesses.slug, catalogSlug: catalogs.slug })
      .from(catalogs)
      .innerJoin(businesses, eq(businesses.id, catalogs.businessId))
      .where(
        and(
          eq(catalogs.id, qr.targetId),
          eq(catalogs.businessId, qr.businessId),
          eq(catalogs.status, "published"),
          eq(businesses.public, true),
        ),
      )
      .limit(1);
    if (!destination) return null;
    const [branch] = qr.branchId
      ? await this.database.db
          .select({ slug: branches.slug })
          .from(branches)
          .where(
            and(
              eq(branches.id, qr.branchId),
              eq(branches.businessId, qr.businessId),
            ),
          )
          .limit(1)
      : [];
    await this.database.db.insert(outboxEvents).values({
      businessId: qr.businessId,
      eventType: "qr.scanned",
      aggregateType: "qr_code",
      aggregateId: qr.id,
      payload: {
        qrCodeId: qr.id,
        locale: qr.context.locale,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.slice(0, 500),
      },
    });
    const url = new URL(
      `/b/${destination.businessSlug}/${destination.catalogSlug}`,
      appConfig.PUBLIC_WEB_BASE_URL,
    );
    url.searchParams.set("qr", publicToken);
    if (branch?.slug) url.searchParams.set("branch", branch.slug);
    if (qr.context.locale) url.searchParams.set("locale", qr.context.locale);
    if (qr.context.table) url.searchParams.set("table", qr.context.table);
    if (qr.context.room) url.searchParams.set("room", qr.context.room);
    return url.toString();
  }
}

@Controller()
export class QrController {
  constructor(private readonly qr: QrService) {}

  @RequirePermission("qr.read")
  @Get("api/v1/businesses/:businessId/qr-codes")
  async list(
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.qr.list(context.businessId!),
      requestId: String(request.id),
    };
  }

  @RequirePermission("qr.create")
  @Post("api/v1/businesses/:businessId/qr-codes")
  async create(
    @Body() body: unknown,
    @CurrentAuth() context: RequestAuthContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.qr.create(
        context.businessId!,
        context.userId,
        body,
        String(request.id),
      ),
      requestId: String(request.id),
    };
  }

  @RequirePermission("qr.read")
  @Get("api/v1/businesses/:businessId/qr-codes/:qrCodeId.svg")
  async svg(
    @Param("qrCodeId") qrCodeId: string,
    @CurrentAuth() context: RequestAuthContext,
    @Res() response: FastifyReply,
  ) {
    const svg = await this.qr.svg(context.businessId!, qrCodeId);
    if (!svg)
      return response
        .status(404)
        .send({ error: { code: "NOT_FOUND", message: "QR code not found" } });
    return response
      .header("Content-Type", "image/svg+xml")
      .header(
        "Content-Disposition",
        `inline; filename="atlasqr-${qrCodeId}.svg"`,
      )
      .send(svg);
  }

  @Public()
  @Get("q/:token")
  async resolve(
    @Param("token") token: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: FastifyReply,
  ) {
    const destination = await this.qr.resolve(token, request);
    if (!destination)
      return response.status(404).send("This QR code is unavailable.");
    return response.redirect(destination, 307);
  }
}
