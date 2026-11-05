ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProductImage" ADD COLUMN "altSource" TEXT NOT NULL DEFAULT 'generated', ADD COLUMN "assetId" TEXT;
UPDATE "ProductImage" SET "altSource"='custom' WHERE length(trim(alt)) > 0;
CREATE TABLE "AdminMutation" (
  id TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, fingerprint TEXT NOT NULL,
  result JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MediaAsset" (
  id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, keys JSONB NOT NULL,
  "storageBytes" BIGINT NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE "MediaCleanup" (
  "assetId" TEXT PRIMARY KEY REFERENCES "MediaAsset"(id), attempts INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Duplicated listing images already share the same original/derivative keys.
-- Preserve those references; visibility and the original gallery stay unchanged.
INSERT INTO "MediaAsset" (id, identity, keys, "storageBytes")
SELECT min(id), COALESCE("originalKey", 'image:' || id),
  to_jsonb(array_remove(ARRAY["originalKey"] || ARRAY(SELECT value->>'key' FROM jsonb_array_elements(derivatives)), NULL)),
  max("storageBytes")
FROM "ProductImage"
GROUP BY COALESCE("originalKey", 'image:' || id), derivatives, "originalKey";
UPDATE "ProductImage" i SET "assetId"=a.id FROM "MediaAsset" a
WHERE a.identity=COALESCE(i."originalKey", 'image:' || i.id);
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"(id) ON DELETE RESTRICT;
CREATE INDEX "ProductImage_assetId_idx" ON "ProductImage"("assetId");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
