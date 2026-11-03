ALTER TABLE "Product" ADD COLUMN "taxClass" TEXT NOT NULL DEFAULT 'hats';
ALTER TABLE "StoreSettings" ADD COLUMN "taxConfigured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD CONSTRAINT tax_class_values CHECK ("taxClass" IN ('hats','clothing','children','general'));
