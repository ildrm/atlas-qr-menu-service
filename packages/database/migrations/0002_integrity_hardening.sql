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
  if new.parent_id = new.id then
    raise exception 'category cannot be its own parent' using errcode = '23514';
  end if;
  select business_id, catalog_id
    into parent_business, parent_catalog
    from categories
    where id = new.parent_id;
  if parent_business is distinct from new.business_id or parent_catalog is distinct from new.catalog_id then
    raise exception 'parent category must belong to the same business and catalog' using errcode = '23514';
  end if;
  if exists (
    with recursive ancestors(id) as (
      select new.parent_id
      union
      select category.parent_id
      from categories category
      join ancestors on category.id = ancestors.id
      where category.parent_id is not null
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'category hierarchy cannot contain a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function enforce_membership_role_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from roles
    where id = new.role_id and business_id = new.business_id
  ) then
    raise exception 'membership role must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger memberships_role_scope
before insert or update of role_id, business_id on memberships
for each row execute function enforce_membership_role_scope();

create or replace function enforce_catalog_branch_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from catalogs catalog
    join branches branch on branch.id = new.branch_id
    where catalog.id = new.catalog_id
      and catalog.business_id = branch.business_id
  ) then
    raise exception 'catalog and branch must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger catalog_branches_scope
before insert or update of catalog_id, branch_id on catalog_branches
for each row execute function enforce_catalog_branch_scope();

create or replace function enforce_item_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from catalogs catalog
    join categories category on category.id = new.category_id
    where catalog.id = new.catalog_id
      and catalog.business_id = new.business_id
      and category.business_id = new.business_id
      and category.catalog_id = new.catalog_id
  ) then
    raise exception 'item catalog and category must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger items_scope
before insert or update of business_id, catalog_id, category_id on items
for each row execute function enforce_item_scope();

create or replace function enforce_qr_scope()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is not null and not exists (
    select 1 from branches
    where id = new.branch_id and business_id = new.business_id
  ) then
    raise exception 'QR branch must belong to the same business' using errcode = '23514';
  end if;
  if new.campaign_id is not null and not exists (
    select 1 from campaigns
    where id = new.campaign_id and business_id = new.business_id
  ) then
    raise exception 'QR campaign must belong to the same business' using errcode = '23514';
  end if;
  if new.target_type = 'catalog' and not exists (
    select 1 from catalogs
    where id = new.target_id and business_id = new.business_id
  ) then
    raise exception 'QR catalog target must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger qr_codes_scope
before insert or update of business_id, branch_id, campaign_id, target_type, target_id on qr_codes
for each row execute function enforce_qr_scope();

create or replace function enforce_event_reference_scope()
returns trigger
language plpgsql
as $$
begin
  if new.catalog_id is not null and not exists (
    select 1 from catalogs where id = new.catalog_id and business_id = new.business_id
  ) then
    raise exception 'analytics catalog must belong to the same business' using errcode = '23514';
  end if;
  if new.category_id is not null and not exists (
    select 1 from categories
    where id = new.category_id
      and business_id = new.business_id
      and (new.catalog_id is null or catalog_id = new.catalog_id)
  ) then
    raise exception 'analytics category must belong to the same business and catalog' using errcode = '23514';
  end if;
  if new.item_id is not null and not exists (
    select 1 from items
    where id = new.item_id
      and business_id = new.business_id
      and (new.catalog_id is null or catalog_id = new.catalog_id)
      and (new.category_id is null or category_id = new.category_id)
  ) then
    raise exception 'analytics item must belong to the same business hierarchy' using errcode = '23514';
  end if;
  if new.qr_code_id is not null and not exists (
    select 1 from qr_codes where id = new.qr_code_id and business_id = new.business_id
  ) then
    raise exception 'analytics QR code must belong to the same business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger analytics_events_scope
before insert or update of business_id, catalog_id, category_id, item_id, qr_code_id on analytics_events
for each row execute function enforce_event_reference_scope();

create or replace function enforce_qr_scan_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from qr_codes
    where id = new.qr_code_id and business_id = new.business_id
  ) then
    raise exception 'QR scan must belong to the QR code business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger qr_scans_scope
before insert or update of business_id, qr_code_id on qr_scans
for each row execute function enforce_qr_scan_scope();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['invitations', 'notifications'] loop
    execute format('alter table %I enable row level security', table_name);
    if not exists (
      select 1 from pg_policies
      where schemaname = current_schema()
        and tablename = table_name
        and policyname = 'tenant_isolation'
    ) then
      execute format(
        'create policy tenant_isolation on %I using (business_id = atlas_current_business_id()) with check (business_id = atlas_current_business_id())',
        table_name
      );
    end if;
  end loop;
end;
$$;

comment on function atlas_current_business_id is
  'Returns app.current_business_id for a tenant-scoped transaction. Runtime integration must set it before using a restricted production role.';
