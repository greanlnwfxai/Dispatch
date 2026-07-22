import { Injectable } from "@nestjs/common";
import type { RoleRecord, RoleRepository } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<RoleRecord | null> {
    return this.prisma.role.findUnique({ where: { code } });
  }

  async listAll(): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({ orderBy: { code: "asc" } });
  }
}
