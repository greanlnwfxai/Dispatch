import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  let service: PrismaService;

  beforeAll(() => {
    // PrismaClient reads DATABASE_URL at construction time; a syntactically
    // valid placeholder is enough for a unit test that never opens a real
    // connection ($connect/$disconnect are mocked below).
    process.env.DATABASE_URL ??= "postgresql://unit-test:unit-test@localhost:5432/unit-test";
  });

  beforeEach(() => {
    service = new PrismaService();
  });

  it("connects to the database on module init", async () => {
    const connectSpy = jest.spyOn(service, "$connect").mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("disconnects from the database on module destroy", async () => {
    const disconnectSpy = jest.spyOn(service, "$disconnect").mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
