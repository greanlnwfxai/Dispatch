import { Module } from "@nestjs/common";
import { RepositoriesModule } from "../infrastructure/database/repositories/repositories.module";
import { CustomerMasterController } from "./customer-master.controller";
import { CustomerMasterService } from "./customer-master.service";

@Module({
  imports: [RepositoriesModule],
  controllers: [CustomerMasterController],
  providers: [CustomerMasterService],
})
export class CustomerMasterModule {}
