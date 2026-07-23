import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CustomerMasterModule } from "./customer-master/customer-master.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infrastructure/database/prisma/prisma.module";
import { RepositoriesModule } from "./infrastructure/database/repositories/repositories.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({
  imports: [PrismaModule, RepositoriesModule, AuthModule, HealthModule, CustomerMasterModule, TasksModule],
})
export class AppModule {}
