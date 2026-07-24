import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/decorators/current-principal.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthenticatedPrincipal } from "../auth/types/authenticated-principal";
import { AssignmentService } from "./assignment.service";
import { AssignTaskDto, ListAssignedTasksQueryDto, ListAssignmentCandidatesQueryDto, ReassignTaskDto } from "./dto/assignment.dto";

const ASSIGNMENT_READ_ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "STOCK", "MANAGEMENT_AUDITOR"] as const;
const ASSIGNMENT_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"] as const;
const ASSIGNED_EMPLOYEE_ROLES = ["INTERNAL_DELIVERY_EMPLOYEE"] as const;

/**
 * MVP-04 — Delivery Task Assignment. No DELETE endpoint exists for an
 * assignment or its history (append-only, BR-ASSIGN-004). Candidate search
 * and assignment mutation are restricted to the roles that actually
 * perform assignment (SUPER_ADMIN/ADMIN/DISPATCHER); read access
 * additionally includes STOCK/MANAGEMENT_AUDITOR. The `/assigned-tasks`
 * routes are the INTERNAL_DELIVERY_EMPLOYEE's own record-scoped view and
 * are never reachable by any other role — a supporting-only or unrelated
 * employee gets 404, never 403, so existence is never leaked (BR-SECURITY-004).
 */
@Controller()
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Get("assignment-candidates")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNMENT_WRITE_ROLES)
  @Header("Cache-Control", "no-store")
  async listCandidates(@Query() query: ListAssignmentCandidatesQueryDto) {
    return this.assignmentService.listCandidates(query);
  }

  @Get("tasks/:id/assignment")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNMENT_READ_ROLES)
  @Header("Cache-Control", "no-store")
  async getCurrentAssignment(@Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.assignmentService.getCurrentAssignment(taskId);
  }

  @Get("tasks/:id/assignment/history")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNMENT_READ_ROLES)
  @Header("Cache-Control", "no-store")
  async getAssignmentHistory(@Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.assignmentService.getAssignmentHistory(taskId);
  }

  @Post("tasks/:id/assignment")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNMENT_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async assign(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: AssignTaskDto,
  ) {
    return this.assignmentService.assign(taskId, principal.userId, body);
  }

  @Patch("tasks/:id/assignment")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNMENT_WRITE_ROLES)
  @Header("Cache-Control", "no-store")
  async reassign(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: ReassignTaskDto,
  ) {
    return this.assignmentService.reassign(taskId, principal.userId, body);
  }

  @Get("assigned-tasks")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNED_EMPLOYEE_ROLES)
  @Header("Cache-Control", "no-store")
  async listMyAssignedTasks(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ListAssignedTasksQueryDto) {
    return this.assignmentService.listMyAssignedTasks(principal.userId, query);
  }

  @Get("assigned-tasks/:id")
  @UseGuards(RolesGuard)
  @Roles(...ASSIGNED_EMPLOYEE_ROLES)
  @Header("Cache-Control", "no-store")
  async getMyAssignedTaskDetail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.assignmentService.getMyAssignedTaskDetail(principal.userId, taskId);
  }
}
