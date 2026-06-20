-- Allow 'image' as an import source (image import is now the primary path).
ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_source_check;
ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_source_check
  CHECK (source IN ('image', 'excel', 'csv', 'pdf'));
