import { Injectable } from "@nestjs/common";
import type { UserRoleAssignmentRepository } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaUserRoleAssignmentRepository implements UserRoleAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRoleCodesForUser(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      select: { role: { select: { code: true } } },
      orderBy: { assignedAt: "asc" },
    });
    return assignments.map((assignment) => assignment.role.code);
  }
}
