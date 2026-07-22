import { Injectable } from "@nestjs/common";
import type { UserCredentialRecord, UserRecord, UserRepository } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

const USER_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  isActive: true,
  credentialsEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SUMMARY_SELECT });
  }

  async findByLoginId(loginIdNormalized: string): Promise<UserCredentialRecord | null> {
    return this.prisma.user.findUnique({
      where: { loginIdNormalized },
      select: {
        ...USER_SUMMARY_SELECT,
        loginIdNormalized: true,
        passwordHash: true,
        credentialsUpdatedAt: true,
      },
    });
  }
}
