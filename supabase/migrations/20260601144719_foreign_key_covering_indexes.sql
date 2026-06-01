-- BoxOps - foreign key covering indexes.
--
-- Supabase performance advisors flag foreign keys without a leading covering
-- index. This migration creates deterministic B-tree indexes only where the
-- current environment still lacks coverage.

DO $$
DECLARE
  target_fk record;
  target_index_name text;
BEGIN
  FOR target_fk IN
    WITH fk_columns AS (
      SELECT
        constraint_row.oid AS constraint_oid,
        namespace_row.nspname AS table_schema,
        table_row.relname AS table_name,
        constraint_row.conname AS constraint_name,
        constraint_row.conrelid AS table_oid,
        constraint_row.conkey::smallint[] AS key_attnums,
        string_agg(format('%I', attribute_row.attname), ', ' ORDER BY key_column.ordinality) AS indexed_columns,
        string_agg(attribute_row.attname, '_' ORDER BY key_column.ordinality) AS index_suffix
      FROM pg_constraint constraint_row
      JOIN pg_class table_row
        ON table_row.oid = constraint_row.conrelid
      JOIN pg_namespace namespace_row
        ON namespace_row.oid = table_row.relnamespace
      JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        ON true
      JOIN pg_attribute attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = key_column.attnum
      WHERE constraint_row.contype = 'f'
        AND namespace_row.nspname = 'public'
      GROUP BY
        constraint_row.oid,
        namespace_row.nspname,
        table_row.relname,
        constraint_row.conname,
        constraint_row.conrelid,
        constraint_row.conkey
    )
    SELECT fk_columns.*
    FROM fk_columns
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index index_row
      WHERE index_row.indrelid = fk_columns.table_oid
        AND index_row.indisvalid
        AND index_row.indisready
        AND (index_row.indkey::smallint[])[1:cardinality(fk_columns.key_attnums)] = fk_columns.key_attnums
    )
    ORDER BY fk_columns.table_name, fk_columns.constraint_name
  LOOP
    target_index_name := left(
      format(
        '%s_%s_fk_idx',
        target_fk.table_name,
        target_fk.index_suffix
      ),
      54
    ) || '_' || substr(md5(target_fk.constraint_name || ':' || target_fk.index_suffix), 1, 8);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      target_index_name,
      target_fk.table_schema,
      target_fk.table_name,
      target_fk.indexed_columns
    );
  END LOOP;
END;
$$;
