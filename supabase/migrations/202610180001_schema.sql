-- Datos administrativos exclusivamente. Los datos clínicos permanecen en Farmatic.
create type public.app_role as enum ('estandar','administrador','superpowers');
create type public.patient_kind as enum ('NUEVO','PROPIO');
create type public.patient_origin as enum ('MOSTRADOR','EXTERNA','TITULAR');

create table public.employees (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 sort_order integer not null default 0, version integer not null default 1,
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null,
 role public.app_role not null default 'estandar', enabled boolean not null default true,
 employee_id uuid unique references public.employees(id), must_change_password boolean not null default true,
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.programme (
 id integer primary key default 1 check(id=1), start_month date check(extract(day from start_month)=1),
 rules_version text not null default 'v1', version integer not null default 1
);
insert into public.programme(id) values(1);
create table public.employment_periods (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 starts_on date not null, ends_on date, weekly_hours numeric(5,2) not null check(weekly_hours>0 and weekly_hours<=80),
 version integer not null default 1, check(ends_on is null or ends_on>=starts_on)
);
create table public.patients (
 id uuid primary key default gen_random_uuid(), farmatic_code text not null unique check(farmatic_code ~ '^[0-9]{1,30}$'),
 joined_on date not null, kind public.patient_kind not null, origin public.patient_origin not null,
 captor_id uuid references public.employees(id), followup_id uuid references public.employees(id),
 validated boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), check(origin<>'EXTERNA' or captor_id is not null)
);
create table public.patient_periods (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 starts_on date not null, ends_on date, version integer not null default 1,
 check(ends_on is null or ends_on>=starts_on)
);
create table public.prospects (
 id uuid primary key default gen_random_uuid(), reference text not null unique default ('INT-' || upper(substr(gen_random_uuid()::text,1,8))),
 captor_id uuid references public.employees(id), origin public.patient_origin not null default 'MOSTRADOR',
 status text not null default 'INTERESADO' check(status in ('INTERESADO','CONTACTADO','DESCARTADO','CONVERTIDO')),
 next_action_on date, converted_patient_id uuid unique references public.patients(id),
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.sales (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), sold_on date not null,
 voided boolean not null default false, correction_reason text,
 recorded_by uuid references public.profiles(id) default auth.uid(), recorded_at timestamptz not null default now(),
 version integer not null default 1, check(not voided or coalesce(length(trim(correction_reason)),0)>0)
);
create index sales_patient_date on public.sales(patient_id,sold_on) where not voided;
create table public.monthly_reviews (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 month date not null check(extract(day from month)=1),
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','SIN_COMPRA')),
 reviewed_by uuid references public.profiles(id) default auth.uid(), version integer not null default 1,
 unique(patient_id,month)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), patient_id uuid references public.patients(id), prospect_id uuid references public.prospects(id),
 assignee_id uuid references public.employees(id), action text not null check(action in ('CONTACTAR','COMPROBAR_COMPRA','REVISAR_ALTA','SEGUIMIENTO_ADMINISTRATIVO')),
 due_on date not null, done boolean not null default false, version integer not null default 1,
 check(num_nonnulls(patient_id,prospect_id)=1)
);
create table public.external_management (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 employee_id uuid not null references public.employees(id), starts_on date not null, ends_on date,
 accepted boolean not null default true, validated_by uuid not null references public.profiles(id) default auth.uid(),
 version integer not null default 1, check(ends_on is null or ends_on>=starts_on)
);
create table public.settlements (
 id uuid primary key default gen_random_uuid(), period_start date not null unique, period_end date not null,
 status text not null default 'BORRADOR' check(status in ('BORRADOR','APROBADA','PAGADA')),
 prepared_by uuid not null references public.profiles(id) default auth.uid(),
 approved_by uuid references public.profiles(id), approved_at timestamptz, snapshot jsonb,
 version integer not null default 1, created_at timestamptz not null default now(),
 check(period_end>=period_start)
);
create table public.settlement_lines (
 id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.settlements(id),
 patient_id uuid not null references public.patients(id), employee_id uuid not null references public.employees(id),
 cycle integer not null, concept text not null check(concept in ('CAPTACION','PERMANENCIA','MANTENIMIENTO')),
 amount numeric(12,2) not null,
 unique(settlement_id,patient_id,employee_id,cycle,concept)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.settlements(id),
 employee_id uuid not null references public.employees(id), amount numeric(12,2) not null check(amount>0),
 paid_on date not null, reference text check(length(reference)<=200), recorded_by uuid not null references public.profiles(id) default auth.uid(),
 recorded_at timestamptz not null default now(), unique(settlement_id,employee_id)
);
create table public.audit_log (
 id bigint generated always as identity primary key, table_name text not null, record_id text not null,
 actor_id uuid, operation text not null, before_data jsonb, after_data jsonb, occurred_at timestamptz not null default now()
);

create function public.today_madrid() returns date language sql stable set search_path='' as $$
 select (now() at time zone 'Europe/Madrid')::date
$$;
create function public.current_app_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and enabled and not must_change_password
$$;
create function public.is_manager() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.current_app_role() in ('administrador','superpowers'),false)
$$;
create function public.own_employee() returns uuid language sql stable security definer set search_path='' as $$
 select employee_id from public.profiles where id=auth.uid() and public.current_app_role() is not null
$$;

create function public.guard_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Un mismo cerrojo serializa cambios de origen y aprobaciones económicas.
 perform 1 from public.programme where id=1 for update;
 if TG_OP='UPDATE' then new.version=old.version+1; end if;
 if TG_TABLE_NAME='profiles' then
   if TG_OP='UPDATE' and old.role='superpowers' and old.enabled and (new.role<>'superpowers' or not new.enabled) then
     if not exists(select 1 from public.profiles where id<>old.id and role='superpowers' and enabled) then
       raise exception 'Debe conservarse al menos una cuenta superpowers habilitada';
     end if;
   end if;
 elsif TG_TABLE_NAME='employment_periods' then
   perform 1 from public.employees where id=new.employee_id for update;
   if exists(select 1 from public.employment_periods p where p.employee_id=new.employee_id and p.id<>new.id
     and daterange(p.starts_on,p.ends_on,'[]') && daterange(new.starts_on,new.ends_on,'[]')) then
     raise exception 'Las jornadas de una empleada no pueden solaparse';
   end if;
 elsif TG_TABLE_NAME='patient_periods' then
   if new.starts_on>(select public.today_madrid()) or coalesce(new.ends_on,new.starts_on)>public.today_madrid() then raise exception 'El alta o la baja no puede ser futura'; end if;
   if new.starts_on<(select joined_on from public.patients where id=new.patient_id) then raise exception 'El periodo no puede preceder al alta original'; end if;
   if exists(select 1 from public.patient_periods p where p.patient_id=new.patient_id and p.id<>new.id
     and daterange(p.starts_on,p.ends_on,'[]') && daterange(new.starts_on,new.ends_on,'[]')) then raise exception 'Los periodos del paciente no pueden solaparse'; end if;
   if TG_OP='UPDATE' and exists(select 1 from public.sales s where s.patient_id=new.patient_id and not s.voided
      and s.sold_on between old.starts_on and coalesce(old.ends_on,'infinity'::date)
      and s.sold_on not between new.starts_on and coalesce(new.ends_on,'infinity'::date)) then
     raise exception 'Hay ventas fuera del periodo propuesto; corríjalas primero';
   end if;
 elsif TG_TABLE_NAME='patients' then
   if new.joined_on>public.today_madrid() then raise exception 'La fecha de alta no puede ser futura'; end if;
   if TG_OP='UPDATE' and new.joined_on<>old.joined_on then
     if not public.is_manager() then raise exception 'Solo administración puede corregir la fecha de alta original'; end if;
     if exists(select 1 from public.sales s where s.patient_id=new.id and not s.voided and s.sold_on<new.joined_on) then raise exception 'La fecha corregida dejaría ventas anteriores al alta'; end if;
   end if;
   if public.current_app_role()='estandar' and (TG_OP='INSERT' or row(new.kind,new.origin,new.captor_id) is distinct from row(old.kind,old.origin,old.captor_id)) then new.validated=false; end if;
 elsif TG_TABLE_NAME='sales' then
   if new.sold_on>public.today_madrid() then raise exception 'La fecha real de venta no puede ser futura'; end if;
   if not new.voided and not exists(select 1 from public.patient_periods p where p.patient_id=new.patient_id and new.sold_on between p.starts_on and coalesce(p.ends_on,'infinity'::date)) then
     raise exception 'La venta debe pertenecer a un periodo de alta del paciente';
   end if;
   if exists(select 1 from public.settlements where status<>'BORRADOR') and new.sold_on<(select start_month from public.programme where id=1) then
     raise exception 'No se puede adelantar el inicio de un programa con liquidaciones aprobadas';
   end if;
   if TG_OP='UPDATE' and row(new.patient_id,new.sold_on,new.voided) is distinct from row(old.patient_id,old.sold_on,old.voided)
     and coalesce(length(trim(new.correction_reason)),0)=0 then raise exception 'Indique el motivo de la corrección'; end if;
 elsif TG_TABLE_NAME='monthly_reviews' then
   if new.month>=date_trunc('month',public.today_madrid())::date and new.status='SIN_COMPRA' then raise exception 'Solo pueden cerrarse sin compra meses terminados'; end if;
 elsif TG_TABLE_NAME='external_management' then
   if not exists(select 1 from public.patients where id=new.patient_id and origin='EXTERNA' and captor_id=new.employee_id) then raise exception 'La continuidad debe corresponder a la captadora externa del paciente'; end if;
   new.validated_by=auth.uid();
   if exists(select 1 from public.external_management p where p.patient_id=new.patient_id and p.id<>new.id and p.accepted and new.accepted
     and daterange(p.starts_on,p.ends_on,'[]') && daterange(new.starts_on,new.ends_on,'[]')) then raise exception 'Los periodos de continuidad no pueden solaparse'; end if;
 end if;
 return new;
end $$;

create function public.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(table_name,record_id,actor_id,operation,before_data,after_data)
 values(TG_TABLE_NAME,new.id::text,auth.uid(),TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','employees','employment_periods','patients','patient_periods','prospects','sales','monthly_reviews','tasks','external_management','settlements'] loop
   execute format('create trigger guard_record before insert or update on public.%I for each row execute function public.guard_record()',t);
   execute format('create trigger audit_record after insert or update on public.%I for each row execute function public.audit_record()',t);
 end loop;
 foreach t in array array['settlement_lines','payments'] loop
   execute format('create trigger audit_record after insert on public.%I for each row execute function public.audit_record()',t);
 end loop;
end $$;

create function public.patient_first_period() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.patient_periods(patient_id,starts_on) values(new.id,new.joined_on); return new; end $$;
create trigger patient_first_period after insert on public.patients for each row execute function public.patient_first_period();
create function public.correct_first_period() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.joined_on is distinct from old.joined_on then
  update public.patient_periods set starts_on=new.joined_on where patient_id=new.id and starts_on=old.joined_on;
  if not found then raise exception 'No se ha encontrado el primer periodo del paciente'; end if;
 end if;
 return new;
end $$;
create trigger correct_first_period after update of joined_on on public.patients for each row execute function public.correct_first_period();
create function public.refresh_programme() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.settlements where status<>'BORRADOR') then
   update public.programme set start_month=(select date_trunc('month',min(sold_on))::date from public.sales where not voided),version=version+1 where id=1;
 end if;
 return new;
end $$;
create trigger refresh_programme after insert or update on public.sales for each row execute function public.refresh_programme();

-- Las escrituras se realizan exclusivamente a través de RPC con autorización y versión esperada.
do $$ declare t text; begin
 foreach t in array array['profiles','employees','employment_periods','programme','patients','patient_periods','prospects','sales','monthly_reviews','tasks','external_management','settlements','settlement_lines','payments','audit_log'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['employees','programme','patients','patient_periods','prospects','sales','monthly_reviews','tasks'] loop
   execute format('create policy read_authorized on public.%I for select to authenticated using (public.current_app_role() is not null)',t);
 end loop;
end $$;
create policy read_profiles on public.profiles for select to authenticated using (id=auth.uid() or public.is_manager());
create policy read_journeys on public.employment_periods for select to authenticated using (public.is_manager() or employee_id=public.own_employee());
create policy read_continuity on public.external_management for select to authenticated using (public.is_manager());
create policy read_settlements on public.settlements for select to authenticated using (public.is_manager());
create policy read_lines on public.settlement_lines for select to authenticated using (public.is_manager() or employee_id=public.own_employee());
create policy read_payments on public.payments for select to authenticated using (public.is_manager() or employee_id=public.own_employee());
create policy read_audit on public.audit_log for select to authenticated using (public.is_manager());
