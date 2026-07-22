import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaRoleRepository } from "./prisma-role.repository";
import { PrismaUserRepository } from "./prisma-user.repository";

/**
 * Identity/Role repository boundary (DEV-FOUNDATION-002). No controller and
 * no application use case consume these yet — this milestone only
 * establishes the persistence boundary future modules (AUTH-001 onward)
 * will build on.
 */
@Module({
  imports: [PrismaModule],
  providers: [PrismaUserRepository, PrismaRoleRepository],
  exports: [PrismaUserRepository, PrismaRoleRepository],
})
export class RepositoriesModule {}
