-- Land / building size are typed per document by staff, not kept on the unit.
ALTER TABLE units DROP COLUMN luas_tanah, DROP COLUMN luas_bangunan;
