import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaRoleRepository } from "./prisma-role.repository";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { PrismaUserRepository } from "./prisma-user.repository";
import { PrismaUserRoleAssignmentRepository } from "./prisma-user-role-assignment.repository";

/**
 * Identity/Role/Session repository boundary. AUTH-001 adds
 * PrismaSessionRepository (server-side session/revocation persistence) and
 * PrismaUserRoleAssignmentRepository (role-code resolution for the
 * authenticated principal) alongside the DEV-FOUNDATION-002 User/Role
 * repositories.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    PrismaUserRepository,
    PrismaRoleRepository,
    PrismaUserRoleAssignmentRepository,
    PrismaSessionRepository,
  ],
  exports: [
    PrismaUserRepository,
    PrismaRoleRepository,
    PrismaUserRoleAssignmentRepository,
    PrismaSessionRepository,
  ],
})
export class RepositoriesModule {}
