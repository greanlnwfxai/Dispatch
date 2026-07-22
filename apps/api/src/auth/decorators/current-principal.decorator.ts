import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "../types/authenticated-principal";

interface RequestWithPrincipal {
  principal?: AuthenticatedPrincipal;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return request.principal;
  },
);
