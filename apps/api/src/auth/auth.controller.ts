import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { AUTH_CONFIG, loadRateLimits, type AuthConfig } from "./config/auth.config";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentPrincipal } from "./decorators/current-principal.decorator";
import { OriginGuard } from "./guards/origin.guard";
import type { AuthenticatedPrincipal } from "./types/authenticated-principal";

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

const RATE_LIMITS = loadRateLimits();

/**
 * Auth endpoints (AUTH-001). Every response here is marked `no-store` —
 * access/refresh tokens and principal data must never be cached by a
 * shared cache, service worker, or browser back/forward cache.
 */
@Controller("auth")
@UseGuards(OriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: RATE_LIMITS.login.limit, ttl: RATE_LIMITS.login.ttlSeconds * 1000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.loginId, body.password);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
      principal: result.principal,
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: RATE_LIMITS.refresh.limit, ttl: RATE_LIMITS.refresh.ttlSeconds * 1000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async refreshToken(@Req() req: RequestWithCookies, @Res({ passthrough: true }) res: Response) {
    const cookieToken = req.cookies?.[this.config.cookieName];
    if (!cookieToken) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }

    try {
      const result = await this.authService.refresh(cookieToken);
      this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      return {
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
      };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async logout(@Req() req: RequestWithCookies, @Res({ passthrough: true }) res: Response) {
    const cookieToken = req.cookies?.[this.config.cookieName];
    await this.authService.logout(cookieToken);
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async logoutAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(principal.userId);
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      userId: principal.userId,
      displayName: principal.displayName,
      roleCodes: principal.roleCodes,
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    const maxAgeMs = Math.max(expiresAt.getTime() - Date.now(), 0);
    res.cookie(this.config.cookieName, token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax",
      path: "/auth",
      maxAge: maxAgeMs,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.config.cookieName, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax",
      path: "/auth",
    });
  }
}
