import { Injectable } from "@nestjs/common";
import type { UserRecord, UserRepository } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
