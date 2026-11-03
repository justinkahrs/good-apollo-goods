-- Normalize legacy catalog group labels into the controlled commerce category
-- vocabulary without changing product visibility, prices, variants, or stock.
UPDATE "Product"
SET "category" = CASE
  WHEN "category" = 'wearables' THEN 'hat'
  WHEN "category" = 'art' THEN 'other'
  ELSE "category"
END
WHERE "category" IN ('wearables', 'art');
