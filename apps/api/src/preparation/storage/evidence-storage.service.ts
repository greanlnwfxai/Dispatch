import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";

export interface StoredEvidenceObject {
  objectKey: string;
  absolutePath: string;
}

@Injectable()
export class EvidenceStorageService {
  private readonly root = path.resolve(process.env.EVIDENCE_STORAGE_ROOT ?? "/var/lib/dispatch/evidence");

  async writeObject(objectKey: string, bytes: Buffer): Promise<StoredEvidenceObject> {
    const absolutePath = this.resolveObjectPath(objectKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
    return { objectKey, absolutePath };
  }

  async deleteObjectIfExists(objectKey: string): Promise<void> {
    const absolutePath = this.resolveObjectPath(objectKey);
    await fs.rm(absolutePath, { force: true });
  }

  async openReadStream(objectKey: string) {
    const absolutePath = this.resolveObjectPath(objectKey);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new InternalServerErrorException("Evidence object is unavailable.");
    }
    return createReadStream(absolutePath);
  }

  private resolveObjectPath(objectKey: string): string {
    if (!/^preparation\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(objectKey)) {
      throw new InternalServerErrorException("Evidence object key is invalid.");
    }
    const resolved = path.resolve(this.root, objectKey);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InternalServerErrorException("Evidence object key is invalid.");
    }
    return resolved;
  }
}
