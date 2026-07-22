import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { loadAuthConfig } from "./auth/config/auth.config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use(cookieParser());

  // Exact-origin credentialed CORS (AUTH-001) — no wildcard origin with
  // credentials. Requests without an Origin header (server-to-server,
  // most non-browser HTTP clients) are allowed through; OriginGuard adds a
  // stricter, auth-route-scoped check on top of this.
  const authConfig = loadAuthConfig();
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || authConfig.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });

  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`dispatch-api listening on port ${port}`);
}

void bootstrap();
