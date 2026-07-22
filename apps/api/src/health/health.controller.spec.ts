import { Test, TestingModule } from "@nestjs/testing";
import { expectOkHealthResponse } from "@dispatch/test-utils";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("returns a deterministic ok response identifying dispatch-api", () => {
    const result = controller.getHealth();
    expectOkHealthResponse(result, "dispatch-api");
  });

  it("does not include any secret-shaped fields", () => {
    const result = controller.getHealth();
    expect(Object.keys(result).sort()).toEqual(["service", "status"]);
  });
});
