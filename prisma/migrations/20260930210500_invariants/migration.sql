ALTER TABLE "StockBalance" ADD CONSTRAINT stock_nonnegative CHECK ("unsoldQty" >= 0 AND "heldQty" >= 0 AND "heldQty" <= "unsoldQty");
ALTER TABLE "Variant" ADD CONSTRAINT positive_price CHECK ("priceCents" > 0 AND "lowStockThreshold" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT item_values CHECK (quantity > 0 AND "unitPriceCents" > 0 AND "lineTotalCents" = quantity * "unitPriceCents" AND "restockedQty" BETWEEN 0 AND quantity);
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_values CHECK (quantity > 0 AND state IN ('held','released','consumed'));
ALTER TABLE "Order" ADD CONSTRAINT order_values CHECK (currency = 'usd' AND "subtotalCents" >= 0 AND "shippingCents" >= 0 AND "taxCents" >= 0 AND "totalCents" = "subtotalCents" + "shippingCents" + "taxCents" AND "refundedCents" BETWEEN 0 AND "totalCents");
ALTER TABLE "Refund" ADD CONSTRAINT refund_values CHECK ("amountCents" > 0);
ALTER TABLE "StoreSettings" ADD CONSTRAINT settings_values CHECK ("shippingCents" >= 0 AND "shippingCents" <= 999999);
ALTER TABLE "Product" ADD CONSTRAINT product_state CHECK (status IN ('draft','published','archived'));
CREATE FUNCTION immutable_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Stock history is append-only'; END $$;
CREATE TRIGGER protect_movement BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION immutable_movement();
CREATE FUNCTION immutable_purchase_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (to_jsonb(NEW) - 'restockedQty') IS DISTINCT FROM (to_jsonb(OLD) - 'restockedQty') THEN RAISE EXCEPTION 'Purchased item snapshots are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_purchase_item BEFORE UPDATE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION immutable_purchase_item();
CREATE FUNCTION immutable_purchase_config() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW."settingsSnapshot" IS DISTINCT FROM OLD."settingsSnapshot" OR NEW."subtotalCents" <> OLD."subtotalCents" OR NEW."shippingCents" <> OLD."shippingCents" OR NEW."guestHash" <> OLD."guestHash" OR NEW."statusTokenHash" <> OLD."statusTokenHash" THEN RAISE EXCEPTION 'Purchase configuration is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_purchase_config BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION immutable_purchase_config();
