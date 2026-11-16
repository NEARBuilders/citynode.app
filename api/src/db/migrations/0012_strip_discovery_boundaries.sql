-- Discovery profiles carried geocoder boundary copies inside the data blob
-- (countries only). Map geometry lives in the places catalog now — strip the
-- dead copies instead of dragging them through every profile read/write.
UPDATE "discovery_profiles" SET "data" = "data" - 'boundary' WHERE "data" ? 'boundary';
