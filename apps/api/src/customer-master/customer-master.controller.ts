import { Body, Controller, Header, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/decorators/current-principal.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthenticatedPrincipal } from "../auth/types/authenticated-principal";
import { CustomerMasterSearchDto } from "./dto/customer-master-search.dto";
import { CustomerMasterService } from "./customer-master.service";

/**
 * Read-only Customer/Destination Master search (§5, §7). RBAC: SUPER_ADMIN,
 * ADMIN, DISPATCHER only — matches the roles authorized to create Tasks
 * (Dispatch Knowledge Topic 03 §22).
 */
@Controller("customer-master")
export class CustomerMasterController {
  constructor(private readonly customerMasterService: CustomerMasterService) {}

  @Post("search")
  @UseGuards(RolesGuard)
  @Roles("SUPER_ADMIN", "ADMIN", "DISPATCHER")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async search(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() body: CustomerMasterSearchDto) {
    return this.customerMasterService.search(principal.userId, body.query);
  }
}
