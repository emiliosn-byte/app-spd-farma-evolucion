create function public.save_record(p_resource text,p_patch jsonb,p_id uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[]; fields text; assignments text; result jsonb; key text;
begin
 if public.current_app_role() is null then raise exception 'No autorizado'; end if;
 perform 1 from public.programme where id=1 for update;
 case p_resource
 when 'patients' then allowed=array['farmatic_code','joined_on','kind','origin','captor_id','followup_id','validated'];
 when 'prospects' then allowed=array['captor_id','origin','status','next_action_on'];
 when 'sales' then allowed=array['patient_id','sold_on','voided','correction_reason'];
 when 'monthly_reviews' then allowed=array['patient_id','month','status'];
 when 'tasks' then allowed=array['patient_id','prospect_id','assignee_id','action','due_on','done'];
 when 'employees' then allowed=array['name','sort_order'];
 when 'employment_periods' then allowed=array['employee_id','starts_on','ends_on','weekly_hours'];
 when 'external_management' then allowed=array['patient_id','employee_id','starts_on','ends_on','accepted'];
 when 'profiles' then allowed=array['display_name','role','enabled','employee_id'];
 else raise exception 'Recurso no permitido'; end case;
 if p_resource in ('employees','employment_periods','external_management','profiles') and public.current_app_role()<>'superpowers' then raise exception 'Solo superpowers puede modificar esta configuración'; end if;
 if p_resource='profiles' and p_id is null then raise exception 'Cree las cuentas desde el panel de acceso'; end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'No hay datos para guardar'; end if;
 for key in select jsonb_object_keys(p_patch) loop
   if not key=any(allowed) then raise exception 'Campo no permitido: %',key; end if;
 end loop;
 if p_resource='patients' and p_patch ? 'validated' and (p_patch->>'validated')::boolean and not public.is_manager() then raise exception 'Solo administración puede validar la clasificación'; end if;
 if p_resource='prospects' and p_patch->>'status'='CONVERTIDO' then raise exception 'Use la operación de conversión a paciente'; end if;
 if p_resource='prospects' and p_id is not null and exists(select 1 from public.prospects where id=p_id and converted_patient_id is not null) then raise exception 'El interesado ya está convertido; edite el paciente'; end if;
 select string_agg(format('%I',k),','),string_agg(format('%1$I = typed.%1$I',k),',') into fields,assignments from jsonb_object_keys(p_patch) k;
 if p_id is null then
   execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',p_resource,fields) into result using p_patch;
 else
   if p_version is null then raise exception 'Falta la versión del registro'; end if;
   execute format('update public.%1$I target set %2$s from jsonb_populate_record(null::public.%1$I,$1) typed where target.id=$2 and target.version=$3 returning to_jsonb(target.*)',p_resource,assignments) into result using p_patch,p_id,p_version;
   if result is null then raise exception 'El registro ha cambiado o ya no existe. Actualice la página'; end if;
 end if;
 return result;
end $$;

create function public.provision_profile(p_user uuid,p_name text,p_role public.app_role,p_employee uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role then raise exception 'Solo superpowers puede crear accesos'; end if;
 insert into public.profiles(id,display_name,role,employee_id) values(p_user,p_name,p_role,p_employee);
 return p_user;
end $$;

create function public.convert_prospect(p_id uuid,p_version integer,p_code text,p_joined date,p_kind public.patient_kind)
returns uuid language plpgsql security definer set search_path='' as $$
declare prospect public.prospects; patient uuid;
begin
 if public.current_app_role() is null then raise exception 'No autorizado'; end if;
 perform 1 from public.programme where id=1 for update;
 select * into strict prospect from public.prospects where id=p_id for update;
 if prospect.converted_patient_id is not null then return prospect.converted_patient_id; end if;
 if prospect.version<>p_version then raise exception 'El interesado ha cambiado. Actualice la página'; end if;
 insert into public.patients(farmatic_code,joined_on,kind,origin,captor_id,followup_id,validated)
 values(p_code,p_joined,p_kind,prospect.origin,prospect.captor_id,prospect.captor_id,public.is_manager()) returning id into patient;
 update public.prospects set status='CONVERTIDO',converted_patient_id=patient where id=p_id;
 update public.tasks set patient_id=patient,prospect_id=null where prospect_id=p_id;
 return patient;
end $$;

create function public.set_patient_status(p_id uuid,p_version integer,p_date date,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare patient public.patients; period public.patient_periods;
begin
 if public.current_app_role() is null then raise exception 'No autorizado'; end if;
 perform 1 from public.programme where id=1 for update;
 select * into strict patient from public.patients where id=p_id for update;
 if patient.version<>p_version then raise exception 'El paciente ha cambiado. Actualice la página'; end if;
 if p_date is null or p_date>public.today_madrid() then raise exception 'Indique una fecha real no futura'; end if;
 select * into period from public.patient_periods where patient_id=p_id and ends_on is null;
 if p_active then
   if period.id is not null then raise exception 'El paciente ya está activo'; end if;
   insert into public.patient_periods(patient_id,starts_on) values(p_id,p_date);
 else
   if period.id is null then raise exception 'El paciente ya está de baja'; end if;
   update public.patient_periods set ends_on=p_date where id=period.id;
 end if;
 update public.patients set version=version where id=p_id;
 return p_id;
end $$;

create function public.export_administrative_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role then raise exception 'Solo superpowers puede exportar todos los datos'; end if;
 return public.source_snapshot() || jsonb_build_object(
  'format_version',1,'exported_at',now(),
  'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p),'[]'),
  'prospects',coalesce((select jsonb_agg(to_jsonb(p)) from public.prospects p),'[]'),
  'tasks',coalesce((select jsonb_agg(to_jsonb(p)) from public.tasks p),'[]'),
  'settlements',coalesce((select jsonb_agg(to_jsonb(p)) from public.settlements p),'[]'),
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p),'[]'),
  'audit_log',coalesce((select jsonb_agg(to_jsonb(p)) from public.audit_log p),'[]')
 );
end $$;

create function public.request_password_reset(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role or p_user=auth.uid() then raise exception 'No autorizado'; end if;
 update public.profiles set must_change_password=true where id=p_user;
 if not found then raise exception 'La cuenta no existe'; end if;
end $$;

-- Nada de funciones SECURITY DEFINER ejecutables por omisión.
revoke all on all functions in schema public from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on all tables in schema public from anon,authenticated;
grant usage on schema public to authenticated;
grant execute on function public.today_madrid(),public.current_app_role(),public.is_manager(),public.own_employee() to authenticated;
grant execute on function public.save_record(text,jsonb,uuid,integer),public.provision_profile(uuid,text,public.app_role,uuid),
 public.request_password_reset(uuid),
 public.convert_prospect(uuid,integer,text,date,public.patient_kind),public.set_patient_status(uuid,integer,date,boolean),
 public.create_settlement(date),public.settlement_preview(uuid),public.approve_settlement(uuid,text),
 public.record_payment(uuid,uuid,date,text),public.financial_summary(),public.export_administrative_data() to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public;
