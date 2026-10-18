create function public.administrative_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select public.source_snapshot() || jsonb_build_object(
  'format_version',1,'exported_at',now(),
  'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p),'[]'),
  'prospects',coalesce((select jsonb_agg(to_jsonb(p)) from public.prospects p),'[]'),
  'tasks',coalesce((select jsonb_agg(to_jsonb(p)) from public.tasks p),'[]'),
  'settlements',coalesce((select jsonb_agg(to_jsonb(p)) from public.settlements p),'[]'),
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p),'[]'),
  'audit_log',coalesce((select jsonb_agg(to_jsonb(p)) from public.audit_log p),'[]')
 )
$$;
create or replace function public.export_administrative_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role then raise exception 'Solo superpowers puede exportar todos los datos'; end if;
 return public.administrative_snapshot();
end $$;

-- Herramienta de recuperación: solo clave de servicio, destino vacío y todo en una transacción.
create function public.restore_administrative_data(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; source_key text; n integer;
begin
 perform 1 from public.programme where id=1 for update;
 if (p_data->>'format_version')::integer is distinct from 1 then raise exception 'Versión de copia no compatible'; end if;
 if p_data->'rules'->>'version' is distinct from 'v1' then raise exception 'Versión de reglas no compatible'; end if;
 if exists(select 1 from public.employees) or exists(select 1 from public.profiles) or exists(select 1 from public.patients)
   or exists(select 1 from public.audit_log) then raise exception 'La restauración requiere una base de datos administrativa vacía'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'profiles') p where not exists(select 1 from auth.users u where u.id=(p->>'id')::uuid)) then
   raise exception 'Primero deben recrearse las cuentas de acceso con sus identificadores originales';
 end if;
 foreach t in array array['employees','profiles','patients','patient_periods','prospects','employment_periods','sales','monthly_reviews','tasks','external_management','settlements','settlement_lines','payments'] loop
   execute format('alter table public.%I disable trigger user',t);
 end loop;
 foreach t in array array['employees','profiles','patients','patient_periods','prospects','employment_periods','sales','monthly_reviews','tasks','external_management','settlements','settlement_lines','payments'] loop
   source_key=case t when 'monthly_reviews' then 'reviews' when 'settlement_lines' then 'approved_lines' else t end;
   execute format('insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I,$1)',t) using coalesce(p_data->source_key,'[]'::jsonb);
 end loop;
 insert into public.audit_log overriding system value select * from jsonb_populate_recordset(null::public.audit_log,coalesce(p_data->'audit_log','[]'));
 perform setval(pg_get_serial_sequence('public.audit_log','id'),greatest(coalesce((select max(id) from public.audit_log),0),1),exists(select 1 from public.audit_log));
 update public.programme set start_month=(p_data->'programme'->>'start_month')::date,rules_version=coalesce(p_data->'programme'->>'rules_version','v1'),version=(p_data->'programme'->>'version')::integer where id=1;
 update public.profiles set must_change_password=true;
 foreach t in array array['employees','profiles','patients','patient_periods','prospects','employment_periods','sales','monthly_reviews','tasks','external_management','settlements','settlement_lines','payments'] loop
   execute format('alter table public.%I enable trigger user',t);
 end loop;
 insert into public.audit_log(table_name,record_id,operation,after_data) values('restore','1','RESTORE',jsonb_build_object('exported_at',p_data->>'exported_at','restored_at',now()));
 select count(*) into n from public.patients;
 return jsonb_build_object('patients',n,'employees',(select count(*) from public.employees),'sales',(select count(*) from public.sales));
end $$;
revoke all on function public.administrative_snapshot(),public.restore_administrative_data(jsonb) from public,anon,authenticated;
grant execute on function public.administrative_snapshot(),public.restore_administrative_data(jsonb) to service_role;
