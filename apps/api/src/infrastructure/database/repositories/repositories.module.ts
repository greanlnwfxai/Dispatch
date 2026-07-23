import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaRoleRepository } from "./prisma-role.repository";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { PrismaUserRepository } from "./prisma-user.repository";
import { PrismaUserRoleAssignmentRepository } from "./prisma-user-role-assignment.repository";
import { PrismaCustomerMasterRepository } from "./prisma-customer-master.repository";
import { PrismaCustomerMasterSearchRepository } from "./prisma-customer-master-search.repository";
import { PrismaDeliveryTaskRepository } from "./prisma-delivery-task.repository";
import { PrismaTaskNumberGenerator } from "./prisma-task-number.generator";

/**
 * Identity/Role/Session repository boundary. AUTH-001 adds
 * PrismaSessionRepository (server-side session/revocation persistence) and
 * PrismaUserRoleAssignmentRepository (role-code resolution for the
 * authenticated principal) alongside the DEV-FOUNDATION-002 User/Role
 * repositories. MVP-02 adds the Customer Master search, Customer Master
 * search-evidence, Delivery Task, and Task-number repository adapters.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    PrismaUserRepository,
    PrismaRoleRepository,
    PrismaUserRoleAssignmentRepository,
    PrismaSessionRepository,
    PrismaCustomerMasterRepository,
    PrismaCustomerMasterSearchRepository,
    PrismaDeliveryTaskRepository,
    PrismaTaskNumberGenerator,
  ],
  exports: [
    PrismaUserRepository,
    PrismaRoleRepository,
    PrismaUserRoleAssignmentRepository,
    PrismaSessionRepository,
    PrismaCustomerMasterRepository,
    PrismaCustomerMasterSearchRepository,
    PrismaDeliveryTaskRepository,
    PrismaTaskNumberGenerator,
  ],
})
export class RepositoriesModule {}
