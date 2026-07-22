-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credentials_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credentials_updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "login_id_normalized" VARCHAR(320),
ADD COLUMN     "password_hash" VARCHAR(255);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(64),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token_records" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_token_id" UUID,

    CONSTRAINT "refresh_token_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_records_token_hash_key" ON "refresh_token_records"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_records_replaced_by_token_id_key" ON "refresh_token_records"("replaced_by_token_id");

-- CreateIndex
CREATE INDEX "refresh_token_records_session_id_idx" ON "refresh_token_records"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_normalized_key" ON "users"("login_id_normalized");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_records" ADD CONSTRAINT "refresh_token_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_records" ADD CONSTRAINT "refresh_token_records_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_token_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
