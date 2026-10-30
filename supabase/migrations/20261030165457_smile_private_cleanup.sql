-- Storage metadata only. Actual file deletion always goes through the Storage API.
create or replace function public.smile_expired_objects(p_limit integer default 500)
returns table (name text)
language sql
security definer
set search_path = ''
stable
as $function$
  select o.name
  from storage.objects o
  where o.bucket_id = 'photos'
    and o.created_at < now() - interval '24 hours'
    and o.name ~ '^[0-9]+/smile-pilot/[0-9a-f-]{36}/(source\.enc|mask\.enc|result\.enc|manifest\.json|running\.json)$'
  order by o.created_at, o.name
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$function$;

revoke all on function public.smile_expired_objects(integer) from public, anon, authenticated;
grant execute on function public.smile_expired_objects(integer) to service_role;

select cron.schedule(
  'smile-private-cleanup',
  '17 * * * *',
  $cron$
    select net.http_post(
      url := 'https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1/smile-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret'), ''
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
