-- 008_rename_presence_table.up.sql

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'technician_presence') AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'technician_presences') THEN
        ALTER TABLE technician_presence RENAME TO technician_presences;
    END IF;
END
$$;
