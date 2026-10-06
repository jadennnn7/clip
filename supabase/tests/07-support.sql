\set ON_ERROR_STOP on

-- Support-Anfragen: nur der Server liest und schreibt, der Browser nicht.

insert into auth.users (id, email) values ('f1000000-0000-0000-0000-00000000000f', 'support@example.com');

do $$
begin
  insert into public.support_requests (user_id, email, message, transcript, page)
  values ('f1000000-0000-0000-0000-00000000000f', 'support@example.com', 'Mein Export hängt',
          '[{"role":"user","text":"Export?"}]', '/dashboard/clips');
  begin
    insert into public.support_requests (user_id, email, message) values ('f1000000-0000-0000-0000-00000000000f', 'x@example.com', '   ');
    raise exception 'Empty message accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.support_requests (user_id, email, message, transcript)
    values ('f1000000-0000-0000-0000-00000000000f', 'x@example.com', 'Hallo', '{"role":"user"}');
    raise exception 'Transcript must be an array';
  exception when check_violation then null;
  end;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000f';
do $$
begin
  begin
    perform 1 from public.support_requests;
    raise exception 'authenticated may not read support requests';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.support_requests (user_id, email, message) values ('f1000000-0000-0000-0000-00000000000f', 'x@example.com', 'Hallo');
    raise exception 'authenticated may not write support requests';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select '  Support-Anfragen: ok';
