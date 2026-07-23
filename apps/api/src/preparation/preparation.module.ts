import { Module } from "@nestjs/common";
import { PrismaModule } from "../infrastructure/database/prisma/prisma.module";
import { PreparationController } from "./preparation.controller";
import { PreparationService } from "./preparation.service";
import { EvidenceStorageService } from "./storage/evidence-storage.service";

@Module({
  imports: [PrismaModule],
  controllers: [PreparationController],
  providers: [PreparationService, EvidenceStorageService],
})
export class PreparationModule {}
