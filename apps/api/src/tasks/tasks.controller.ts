import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentPrincipal } from "../auth/decorators/current-principal.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthenticatedPrincipal } from "../auth/types/authenticated-principal";
import { CreateDeliveryTaskDto } from "./dto/create-delivery-task.dto";
import { ListDeliveryTasksQueryDto } from "./dto/list-delivery-tasks-query.dto";
import { UpdateDeliveryTaskDraftDto } from "./dto/update-delivery-task-draft.dto";
import { TasksService } from "./tasks.service";

const CREATE_EDIT_SUBMIT_ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"] as const;
const READ_ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "STOCK", "MANAGEMENT_AUDITOR"] as const;

/**
 * Delivery Task creation/editing/submission (MVP-02). No DELETE endpoint
 * exists — see CLAUDE.md §7 "Do not implement DELETE /tasks". RBAC per
 * Dispatch Knowledge Topic 03 §22: creation/edit/submit is restricted to
 * SUPER_ADMIN/ADMIN/DISPATCHER; read access additionally includes
 * STOCK/MANAGEMENT_AUDITOR. INTERNAL_DELIVERY_EMPLOYEE has no access to
 * these general Task routes — its own record-scoped read access to a
 * currently-assigned Task is served separately by
 * `GET /assigned-tasks`/`GET /assigned-tasks/:id` (see
 * apps/api/src/assignment) so record scope never depends on this
 * controller's broader read-role list.
 */
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CREATE_EDIT_SUBMIT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() body: CreateDeliveryTaskDto) {
    return this.tasksService.create(principal.userId, body);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(...READ_ROLES)
  @Header("Cache-Control", "no-store")
  async list(@Query() query: ListDeliveryTasksQueryDto) {
    return this.tasksService.list(query);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles(...READ_ROLES)
  @Header("Cache-Control", "no-store")
  async findById(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.tasksService.findById(id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(...CREATE_EDIT_SUBMIT_ROLES)
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDeliveryTaskDraftDto,
  ) {
    return this.tasksService.update(principal.userId, id, body);
  }

  @Post(":id/submit")
  @UseGuards(RolesGuard)
  @Roles(...CREATE_EDIT_SUBMIT_ROLES)
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async submit(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.tasksService.submit(principal.userId, id);
  }
}
