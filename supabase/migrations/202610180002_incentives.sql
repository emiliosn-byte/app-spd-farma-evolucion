-- Motor único de cálculo. Todas las cantidades se calculan como numeric, nunca float.
create function public.incentive_components(cutoff date)
returns table(patient_id uuid, employee_id uuid, cycle integer, concept text, month date, amount numeric, liquidable boolean, origin public.patient_origin)
language plpgsql stable security definer set search_path='' as $$
declare p record; c integer; first_month date; cycle_start date; cycle_end date; closing date;
 months date[]; purchase_dates date[]; n integer; k integer; rate numeric; capture_ready boolean;
begin
 for p in select patient.* from public.patients patient where patient.joined_on<=cutoff and patient.origin<>'TITULAR' loop
   first_month=date_trunc('month',p.joined_on)::date;
   rate=case when p.kind='NUEVO' then 40::numeric else 15::numeric end;
   for c in 0..(extract(year from age(cutoff,first_month))::integer*12+extract(month from age(cutoff,first_month))::integer)/12 loop
     cycle_start=(first_month+make_interval(months=>c*12))::date;
     cycle_end=(cycle_start+interval '12 months - 1 day')::date;
     select array_agg(q.m order by q.m),array_agg(q.first_sale order by q.m) into months,purchase_dates from (
       select date_trunc('month',s.sold_on)::date m,min(s.sold_on) first_sale from public.sales s
       where s.patient_id=p.id and not s.voided and s.sold_on between cycle_start and least(cycle_end,cutoff)
       and (p.origin<>'EXTERNA' or exists(select 1 from public.employment_periods ep where ep.employee_id=p.captor_id and s.sold_on between ep.starts_on and coalesce(ep.ends_on,'infinity'::date))
         or exists(select 1 from public.external_management em where em.patient_id=p.id and em.employee_id=p.captor_id and em.accepted and s.sold_on between em.starts_on and coalesce(em.ends_on,'infinity'::date)))
       group by date_trunc('month',s.sold_on)::date
     ) q;
     n=coalesce(array_length(months,1),0);
     if n=0 then continue; end if;
     -- Un cierre de baja sigue madurando su parte aunque el paciente se reactive después.
     select max(q.d) into closing from (
       select cycle_end d where cycle_end<=cutoff
       union all select pp.ends_on from public.patient_periods pp where pp.patient_id=p.id and pp.ends_on between cycle_start and least(cycle_end,cutoff)
       union all select ep.ends_on from public.employment_periods ep
         where p.origin='EXTERNA' and ep.employee_id=p.captor_id and ep.ends_on between cycle_start and least(cycle_end,cutoff)
         and not exists(select 1 from public.employment_periods x where x.employee_id=p.captor_id and ep.ends_on+1 between x.starts_on and coalesce(x.ends_on,'infinity'::date))
         and not exists(select 1 from public.external_management x where x.patient_id=p.id and x.accepted and ep.ends_on+1 between x.starts_on and coalesce(x.ends_on,'infinity'::date))
       union all select em.ends_on from public.external_management em
         where p.origin='EXTERNA' and em.patient_id=p.id and em.accepted and em.ends_on between cycle_start and least(cycle_end,cutoff)
         and not exists(select 1 from public.employment_periods x where x.employee_id=p.captor_id and em.ends_on+1 between x.starts_on and coalesce(x.ends_on,'infinity'::date))
         and not exists(select 1 from public.external_management x where x.patient_id=p.id and x.id<>em.id and x.accepted and em.ends_on+1 between x.starts_on and coalesce(x.ends_on,'infinity'::date))
     ) q;
     capture_ready=c=0 and n>=3 and ((months[3]+interval '1 month - 1 day')::date<=cutoff or closing>=purchase_dates[3]);
     for k in 1..n loop
       patient_id=p.id; employee_id=p.captor_id; cycle=c+1; month=months[k]; origin=p.origin;
       if c=0 and k<=3 then
         -- Antes del tercer mes se muestra progreso, pero no existe aún un premio generado.
         if n<3 then continue; end if;
         concept='CAPTACION'; amount=rate/3; liquidable=capture_ready;
       elsif c=0 then
         concept='PERMANENCIA'; amount=rate/9; liquidable=coalesce(purchase_dates[k]<=closing,false);
       else
         concept='MANTENIMIENTO'; amount=rate/12; liquidable=coalesce(purchase_dates[k]<=closing,false);
       end if;
       return next;
     end loop;
   end loop;
 end loop;
end $$;

create function public.month_weights(p_patient uuid,p_month date)
returns table(employee_id uuid,weight numeric) language sql stable security definer set search_path='' as $$
 select ep.employee_id,sum(ep.weekly_hours * (
   least(coalesce(ep.ends_on,'infinity'::date),coalesce(pp.ends_on,'infinity'::date),(p_month+interval '1 month - 1 day')::date)
   -greatest(ep.starts_on,pp.starts_on,p_month)+1)::numeric/7)
 from public.employment_periods ep cross join public.patient_periods pp
 where pp.patient_id=p_patient
   and greatest(ep.starts_on,pp.starts_on,p_month)<=least(coalesce(ep.ends_on,'infinity'::date),coalesce(pp.ends_on,'infinity'::date),(p_month+interval '1 month - 1 day')::date)
 group by ep.employee_id
$$;

create function public.incentive_entitlements(cutoff date,only_liquidable boolean default true)
returns table(patient_id uuid,employee_id uuid,cycle integer,concept text,amount numeric)
language sql stable security definer set search_path='' as $$
 with components as (
   select * from public.incentive_components(cutoff) c where not only_liquidable or c.liquidable
 ), distributed as (
   select c.patient_id,c.employee_id,c.cycle,c.concept,c.amount
   from components c where c.origin='EXTERNA'
   union all
   select c.patient_id,w.employee_id,c.cycle,c.concept,c.amount*w.weight/sum(w.weight) over(partition by c.patient_id,c.cycle,c.concept,c.month)
   from components c cross join lateral public.month_weights(c.patient_id,c.month) w where c.origin='MOSTRADOR'
 ), grouped as (
   select d.patient_id,d.employee_id,d.cycle,d.concept,sum(d.amount) raw from distributed d group by 1,2,3,4
 ), rounded as (
   select g.*,floor(g.raw*100)/100 base,
     round(sum(g.raw) over(partition by g.patient_id,g.cycle,g.concept),2) total,
     sum(floor(g.raw*100)/100) over(partition by g.patient_id,g.cycle,g.concept) bases,
     row_number() over(partition by g.patient_id,g.cycle,g.concept order by (g.raw*100-floor(g.raw*100)) desc,e.sort_order,e.id) position
   from grouped g join public.employees e on e.id=g.employee_id
 ) select r.patient_id,r.employee_id,r.cycle,r.concept,r.base+case when r.position<=round((r.total-r.bases)*100) then 0.01 else 0 end from rounded r
$$;

create function public.source_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'rules',jsonb_build_object('version','v1','nuevo',40,'propio',15,'capture_months',3,'initial_divisor',9,'maintenance_divisor',12),
  'programme',(select to_jsonb(p) from public.programme p where id=1),
  'patients',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.patients p),'[]'),
  'patient_periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.patient_periods p),'[]'),
  'sales',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.sales p),'[]'),
  'reviews',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.monthly_reviews p),'[]'),
  'employees',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.employees p),'[]'),
  'employment_periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.employment_periods p),'[]'),
  'external_management',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.external_management p),'[]'),
  'approved_lines',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.settlement_lines p),'[]')
 )
$$;

create function public.settlement_blockers(cutoff date) returns jsonb language sql stable security definer set search_path='' as $$
 with issues as (
  select 'EQUIPO_INCOMPLETO'::text code,null::uuid patient_id,'Configure al menos las cinco beneficiarias iniciales'::text detail,null::date as month
   where (select count(*) from public.employees)<5 and not exists(select 1 from public.settlements where status<>'BORRADOR')
  union all
  select 'EMPLEADA_SIN_JORNADA',null::uuid,e.name,null::date from public.employees e where not exists(select 1 from public.employment_periods ep where ep.employee_id=e.id)
  union all
  select 'CLASIFICACION' code,p.id patient_id,p.farmatic_code detail,null::date as month from public.patients p where not validated and joined_on<=cutoff
  union all
  select 'MES_PENDIENTE',p.id,p.farmatic_code,m.d::date from public.patients p
   cross join lateral generate_series(date_trunc('month',p.joined_on),date_trunc('month',cutoff),interval '1 month') m(d)
   where p.origin<>'TITULAR' and exists(select 1 from public.patient_periods pp where pp.patient_id=p.id
     and pp.starts_on<=(m.d+interval '1 month - 1 day')::date and coalesce(pp.ends_on,'infinity'::date)>=m.d::date)
   and (p.origin<>'EXTERNA' or exists(select 1 from public.employment_periods ep where ep.employee_id=p.captor_id and ep.starts_on<=(m.d+interval '1 month - 1 day')::date and coalesce(ep.ends_on,'infinity'::date)>=m.d::date)
     or exists(select 1 from public.external_management em where em.patient_id=p.id and em.accepted and em.starts_on<=(m.d+interval '1 month - 1 day')::date and coalesce(em.ends_on,'infinity'::date)>=m.d::date))
   and not exists(select 1 from public.sales s where s.patient_id=p.id and not s.voided and date_trunc('month',s.sold_on)::date=m.d::date and s.sold_on<=cutoff)
   and not exists(select 1 from public.monthly_reviews r where r.patient_id=p.id and r.month=m.d::date and r.status='SIN_COMPRA')
  union all
  select 'SIN_REPARTO',c.patient_id,p.farmatic_code,c.month from public.incentive_components(cutoff) c join public.patients p on p.id=c.patient_id
   where c.liquidable and c.origin='MOSTRADOR' and not exists(select 1 from public.month_weights(c.patient_id,c.month))
 ) select coalesce(jsonb_agg(to_jsonb(issues)),'[]') from issues
$$;

create function public.settlement_preview(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.settlements; entries jsonb; source jsonb; cutoff date;
begin
 if not public.is_manager() then raise exception 'No autorizado'; end if;
 select * into strict s from public.settlements where id=p_id;
 if s.status<>'BORRADOR' then return s.snapshot || jsonb_build_object('approved',true); end if;
 cutoff=least(s.period_end,public.today_madrid());
 with rights as (select * from public.incentive_entitlements(cutoff,true)),
 previous as (select l.patient_id,l.employee_id,l.cycle,l.concept,sum(l.amount) amount from public.settlement_lines l group by 1,2,3,4),
 deltas as (
 select coalesce(r.patient_id,p.patient_id) patient_id,coalesce(r.employee_id,p.employee_id) employee_id,
   coalesce(r.cycle,p.cycle) cycle,coalesce(r.concept,p.concept) concept,coalesce(r.amount,0)-coalesce(p.amount,0) amount
 from rights r full join previous p using(patient_id,employee_id,cycle,concept)
 ) select coalesce(jsonb_agg(to_jsonb(d) order by d.patient_id,d.employee_id,d.cycle,d.concept),'[]') into entries from deltas d where d.amount<>0;
 source=public.source_snapshot();
 return jsonb_build_object('id',s.id,'cutoff',cutoff,'lines',entries,'blockers',public.settlement_blockers(cutoff),'signature',md5(source::text),'approved',false);
end $$;

create function public.create_settlement(p_start date) returns uuid language plpgsql security definer set search_path='' as $$
declare anchor date; result uuid; distance integer;
begin
 if not public.is_manager() then raise exception 'No autorizado'; end if;
 select start_month into anchor from public.programme where id=1 for update;
 if anchor is null then raise exception 'El programa comenzará con la primera venta'; end if;
 distance=(extract(year from p_start)::integer-extract(year from anchor)::integer)*12+extract(month from p_start)::integer-extract(month from anchor)::integer;
 if extract(day from p_start)<>1 or distance<0 or distance%3<>0 then raise exception 'El periodo debe ser un trimestre del programa'; end if;
 insert into public.settlements(period_start,period_end) values(p_start,(p_start+interval '3 months - 1 day')::date)
 on conflict(period_start) do nothing returning id into result;
 if result is null then select id into result from public.settlements where period_start=p_start; end if;
 return result;
end $$;

create function public.approve_settlement(p_id uuid,p_signature text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.settlements; preview jsonb; source_before jsonb; anchor date; distance integer;
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role then raise exception 'Solo superpowers puede aprobar'; end if;
 perform 1 from public.programme where id=1 for update;
 select * into strict s from public.settlements where id=p_id for update;
 if s.status<>'BORRADOR' then return s.id; end if;
 select start_month into anchor from public.programme where id=1;
 distance=(extract(year from s.period_start)::integer-extract(year from anchor)::integer)*12+extract(month from s.period_start)::integer-extract(month from anchor)::integer;
 if anchor is null or distance<0 or distance%3<>0 then raise exception 'El inicio del programa ha cambiado. Prepare un borrador del calendario actualizado'; end if;
 if s.period_end>=public.today_madrid() then raise exception 'El trimestre debe haber terminado'; end if;
 if exists(select 1 from public.settlements where status<>'BORRADOR' and period_end>s.period_end) then raise exception 'Revise los ajustes en un trimestre posterior al último aprobado'; end if;
 preview=public.settlement_preview(p_id);
 if preview->>'signature' is distinct from p_signature then raise exception 'Los datos han cambiado. Vuelva a revisar la vista previa'; end if;
 if jsonb_array_length(preview->'blockers')>0 then raise exception 'Hay meses pendientes, datos sin validar o jornadas incompletas'; end if;
 source_before=public.source_snapshot();
 insert into public.settlement_lines(settlement_id,patient_id,employee_id,cycle,concept,amount)
 select s.id,x.patient_id,x.employee_id,x.cycle,x.concept,x.amount
 from jsonb_to_recordset(preview->'lines') as x(patient_id uuid,employee_id uuid,cycle integer,concept text,amount numeric);
 update public.settlements set status='APROBADA',approved_by=auth.uid(),approved_at=now(),snapshot=preview||jsonb_build_object('source',source_before) where id=s.id;
 return s.id;
end $$;

create function public.employee_balances() returns table(employee_id uuid,approved numeric,paid numeric,outstanding numeric,latest_settlement uuid)
language sql stable security definer set search_path='' as $$
 with a as (select l.employee_id,sum(l.amount) approved from public.settlement_lines l group by 1),
 p as (select x.employee_id,sum(x.amount) paid from public.payments x group by 1)
 select a.employee_id,a.approved,coalesce(p.paid,0),a.approved-coalesce(p.paid,0),
  (select l.settlement_id from public.settlement_lines l join public.settlements s on s.id=l.settlement_id where l.employee_id=a.employee_id order by s.period_end desc,s.approved_at desc limit 1)
 from a left join p using(employee_id)
$$;

create function public.record_payment(p_settlement uuid,p_employee uuid,p_paid_on date,p_reference text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; balance record;
begin
 if public.current_app_role() is distinct from 'superpowers'::public.app_role then raise exception 'Solo superpowers puede confirmar pagos'; end if;
 perform 1 from public.programme where id=1 for update;
 select id into result from public.payments where settlement_id=p_settlement and employee_id=p_employee;
 if result is not null then return result; end if;
 select * into balance from public.employee_balances() where employee_id=p_employee;
 if balance.latest_settlement is distinct from p_settlement then raise exception 'El saldo ha cambiado. Actualice la liquidación'; end if;
 if coalesce(balance.outstanding,0)<=0 then raise exception 'No hay saldo positivo pendiente de pago'; end if;
 if p_paid_on>public.today_madrid() or p_paid_on is null then raise exception 'Indique una fecha real de pago no futura'; end if;
 if p_paid_on<(select (approved_at at time zone 'Europe/Madrid')::date from public.settlements where id=p_settlement) then raise exception 'El pago no puede preceder a la aprobación'; end if;
 insert into public.payments(settlement_id,employee_id,amount,paid_on,reference) values(p_settlement,p_employee,balance.outstanding,p_paid_on,nullif(trim(p_reference),'')) returning id into result;
 update public.settlements s set status='PAGADA' where status='APROBADA' and not exists(
  select 1 from public.settlement_lines l join public.employee_balances() b on b.employee_id=l.employee_id where l.settlement_id=s.id and b.outstanding>0
 );
 return result;
end $$;

create function public.financial_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if public.current_app_role() is null then raise exception 'No autorizado'; end if;
 select jsonb_build_object(
  'accrued',coalesce((select sum(amount) from public.incentive_entitlements(public.today_madrid(),false) where public.is_manager() or employee_id=public.own_employee()),0),
  'liquidable',coalesce((select sum(amount) from public.incentive_entitlements(public.today_madrid(),true) where public.is_manager() or employee_id=public.own_employee()),0)-coalesce((select sum(amount) from public.settlement_lines where public.is_manager() or employee_id=public.own_employee()),0),
  'approved',coalesce((select sum(amount) from public.settlement_lines where public.is_manager() or employee_id=public.own_employee()),0),
  'paid',coalesce((select sum(amount) from public.payments where public.is_manager() or employee_id=public.own_employee()),0),
  'balances',coalesce((select jsonb_agg(to_jsonb(b)) from public.employee_balances() b where public.is_manager() or b.employee_id=public.own_employee()),'[]'),
  'entitlements',coalesce((select jsonb_agg(to_jsonb(e)) from public.incentive_entitlements(public.today_madrid(),false) e where public.is_manager() or e.employee_id=public.own_employee()),'[]')
 ) into result;
 return result;
end $$;
