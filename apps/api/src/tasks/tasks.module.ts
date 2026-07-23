import { Module } from "@nestjs/common";
import { RepositoriesModule } from "../infrastructure/database/repositories/repositories.module";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [RepositoriesModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
