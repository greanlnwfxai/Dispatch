import { Injectable } from "@nestjs/common";
import { formatDeliveryTaskNumber } from "@dispatch/domain";
import type { TaskNumberGenerator } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Collision-safe Task number generator (BR-TASK-001: "traceable and
 * lifetime-stable"; format is a technical decision, not a business rule —
 * no format is specified anywhere in Dispatch Knowledge). Backed by the
 * `dispatch_task_number_seq` Postgres sequence (see MVP-02 migration):
 * `nextval()` is atomic, so concurrent Task creation can never observe or
 * be assigned the same value, without depending on counting existing rows.
 * `delivery_tasks_task_number_key` is the unique-constraint backstop.
 */
@Injectable()
export class PrismaTaskNumberGenerator implements TaskNumberGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async next(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('dispatch_task_number_seq') AS nextval`;
    const value = rows[0]?.nextval;
    if (value === undefined) {
      throw new Error("Failed to allocate a Task number from dispatch_task_number_seq.");
    }
    return formatDeliveryTaskNumber(value);
  }
}
