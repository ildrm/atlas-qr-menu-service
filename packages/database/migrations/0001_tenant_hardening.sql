alter table categories
  add constraint categories_parent_fk
  foreign key (parent_id) references categories(id) on delete set null;

create unique index roles_business_code_idx on roles (business_id, code) where business_id is not null;
create unique index api_keys_prefix_idx on api_keys (prefix);
create index items_search_idx on items using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(description, '')));
create index analytics_events_occurred_brin_idx on analytics_events using brin (occurred_at);
create index qr_scans_occurred_brin_idx on qr_scans using brin (occurred_at);

create or replace function enforce_category_parent_scope()
returns trigger
language plpgsql
as $$
declare
  parent_business uuid;
  parent_catalog uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select business_id, catalog_id into parent_business, parent_catalog from categories where id = new.parent_id;
  if parent_business is distinct from new.business_id or parent_catalog is distinct from new.catalog_id then
    raise exception 'parent category must belong to the same business and catalog' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_parent_scope
before insert or update of parent_id, business_id, catalog_id on categories
for each row execute function enforce_category_parent_scope();

create or replace function atlas_current_business_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_business_id', true), '')::uuid
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'analytics_events', 'api_keys', 'attribute_definitions', 'attribute_values',
    'audit_events', 'availability_rules', 'branch_item_overrides', 'branches',
    'campaigns', 'catalogs', 'categories', 'items', 'media_assets', 'memberships',
    'option_groups', 'options', 'outbox_events', 'qr_codes', 'qr_scans', 'roles',
    'subscriptions', 'themes', 'variants', 'webhooks', 'domains'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format(
      'create policy tenant_isolation on %I using (business_id = atlas_current_business_id()) with check (business_id = atlas_current_business_id())',
      table_name
    );
  end loop;
end;
$$;

comment on function atlas_current_business_id is
  'Returns the transaction-scoped tenant set by the API. Production uses a non-owner database role so RLS is enforced; migrations run as the owner.';
