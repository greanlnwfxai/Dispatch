import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "../../src/auth/decorators/roles.decorator";
import { RolesGuard } from "../../src/auth/guards/roles.guard";

/**
 * Test-only RBAC exercise routes (AUTH-001). Lives under test/, not src/,
 * so it is never compiled into the production `dist/` build or exposed by
 * the running API container — only e2e-spec test files that explicitly
 * register this controller on a TestingModule can reach it. See
 * CLAUDE.md §12 ("Do not add production business routes merely to
 * demonstrate RBAC").
 */
@Controller("test-support/rbac")
export class RbacTestController {
  @Get("super-admin-only")
  @UseGuards(RolesGuard)
  @Roles("SUPER_ADMIN")
  superAdminOnly() {
    return { ok: true };
  }

  @Get("admin-or-dispatcher")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DISPATCHER")
  adminOrDispatcher() {
    return { ok: true };
  }
}
