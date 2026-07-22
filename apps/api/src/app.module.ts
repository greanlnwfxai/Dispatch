import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infrastructure/database/prisma/prisma.module";
import { RepositoriesModule } from "./infrastructure/database/repositories/repositories.module";

@Module({
  imports: [PrismaModule, RepositoriesModule, AuthModule, HealthModule],
})
export class AppModule {}
