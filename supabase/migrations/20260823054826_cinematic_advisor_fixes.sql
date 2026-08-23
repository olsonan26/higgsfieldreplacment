-- Covers the prototype import actor foreign key reported by the hosted advisor.
create index if not exists prototype_imports_imported_by_idx
  on public.prototype_imports(imported_by);
