import { PrismaClient } from "@prisma/client";
import { normalizeLoginId } from "../auth/login-id";
import { Argon2PasswordHasher } from "../auth/password/argon2-password-hasher";
import { validatePasswordPolicy } from "../auth/password/password-policy";

/**
 * Operator-only initial SUPER_ADMIN bootstrap (AUTH-001).
 *
 * NEVER run automatically — not part of `npm run build`, `start`, Docker
 * container startup, or `prisma db seed`. Invoke explicitly:
 *
 *   npm run auth:bootstrap-super-admin --workspace=apps/api -- \
 *     --login-id="<loginId>" --display-name="<Display Name>"
 *
 * Refuses to run if any SUPER_ADMIN already exists. Prompts for the
 * password interactively (hidden input) when stdin is a TTY; otherwise
 * reads it from `AUTH_BOOTSTRAP_PASSWORD` (operator-supplied at invocation,
 * never a committed default). Prints only safe identifiers — never the
 * password or its hash.
 */

const PASSWORD_POLICY = { minLength: 12, maxLength: 128 };
const SUPER_ADMIN_CODE = "SUPER_ADMIN";

// Control codes compared by char code, never by literal escape sequence, to
// keep this file free of unprintable raw bytes.
const CODE_NEWLINE = 10; // \n
const CODE_ENTER = 13; // \r
const CODE_EOF = 4; // Ctrl+D
const CODE_INTERRUPT = 3; // Ctrl+C
const CODE_BACKSPACE = 127; // Backspace/Delete
const CODE_BACKSPACE_ALT = 8;

export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const withoutPrefix = raw.slice(2);
    const separatorIndex = withoutPrefix.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = withoutPrefix.slice(0, separatorIndex);
    const value = withoutPrefix.slice(separatorIndex + 1);
    args[key] = value;
  }
  return args;
}

function readHiddenInput(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("stdin is not a TTY — cannot prompt interactively."));
      return;
    }
    process.stdout.write(promptText);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (charBuffer: string) => {
      const char = charBuffer.toString();
      const code = char.charCodeAt(0);

      if (code === CODE_NEWLINE || code === CODE_ENTER || code === CODE_EOF) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
        return;
      }

      if (code === CODE_INTERRUPT) {
        process.stdout.write("\n");
        reject(new Error("Aborted."));
        return;
      }

      if (code === CODE_BACKSPACE || code === CODE_BACKSPACE_ALT) {
        input = input.slice(0, -1);
        return;
      }

      input += char;
    };
    stdin.on("data", onData);
  });
}

async function obtainPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    const password = await readHiddenInput("New SUPER_ADMIN password: ");
    const confirmation = await readHiddenInput("Confirm password: ");
    if (password !== confirmation) {
      throw new Error("Passwords did not match.");
    }
    return password;
  }

  const envPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (!envPassword) {
    throw new Error(
      "stdin is not a TTY and AUTH_BOOTSTRAP_PASSWORD is not set — refusing to proceed without an explicit password.",
    );
  }
  return envPassword;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawLoginId = args["login-id"];
  const displayName = args["display-name"];

  if (!rawLoginId || !displayName) {
    console.error(
      'Usage: npm run auth:bootstrap-super-admin --workspace=apps/api -- --login-id="<loginId>" --display-name="<Display Name>"',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    const existingSuperAdminCount = await prisma.userRoleAssignment.count({
      where: { role: { code: SUPER_ADMIN_CODE } },
    });
    if (existingSuperAdminCount > 0) {
      console.error("Refusing to bootstrap: a SUPER_ADMIN already exists.");
      process.exitCode = 1;
      return;
    }

    const loginIdNormalized = normalizeLoginId(rawLoginId);
    const existingUser = await prisma.user.findUnique({ where: { loginIdNormalized } });
    if (existingUser) {
      console.error("Refusing to bootstrap: loginId is already in use.");
      process.exitCode = 1;
      return;
    }

    const role = await prisma.role.findUnique({ where: { code: SUPER_ADMIN_CODE } });
    if (!role) {
      console.error(`Refusing to bootstrap: role ${SUPER_ADMIN_CODE} does not exist. Run the system-role seed first.`);
      process.exitCode = 1;
      return;
    }

    const password = await obtainPassword();
    const policyError = validatePasswordPolicy(password, PASSWORD_POLICY);
    if (policyError) {
      console.error(`Refusing to bootstrap: ${policyError}`);
      process.exitCode = 1;
      return;
    }

    const passwordHasher = new Argon2PasswordHasher();
    const passwordHash = await passwordHasher.hash(password);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          displayName,
          loginIdNormalized,
          passwordHash,
          credentialsEnabled: true,
          credentialsUpdatedAt: new Date(),
        },
      });
      await tx.userRoleAssignment.create({
        data: { userId: createdUser.id, roleId: role.id },
      });
      return createdUser;
    });

    console.log("SUPER_ADMIN bootstrap complete.");
    console.log(`  User ID:  ${user.id}`);
    console.log(`  loginId:  ${loginIdNormalized}`);
    console.log(`  Role:     ${SUPER_ADMIN_CODE}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Guarded so importing this module (e.g. to unit-test `parseArgs`) never
// runs the bootstrap itself — only direct CLI execution does.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("SUPER_ADMIN bootstrap failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
