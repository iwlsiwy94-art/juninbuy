-- 추가 기능: 품목 관리 (품명 검색, 자동 품목 등록, 품목 기준 단가)
-- Supabase > SQL Editor 에 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다. (여러 번 실행해도 안전)

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spec text not null default '',
  unit text not null default '',
  price double precision,            -- 기준 단가 (비어 있으면 자동 채움에 쓰지 않음)
  memo text not null default '',
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists items_name_spec_uniq on items (name, spec);

-- 지금까지 등록된 거래명세서의 품명을 품목으로 한 번에 등록
insert into items (name, spec, unit)
select distinct on (trim(i->>'name'), coalesce(trim(i->>'spec'), ''))
  trim(i->>'name'), coalesce(trim(i->>'spec'), ''), coalesce(trim(i->>'unit'), '')
from slips, jsonb_array_elements(slips.items) as i
where coalesce(trim(i->>'name'), '') <> ''
order by trim(i->>'name'), coalesce(trim(i->>'spec'), ''), slips.date desc
on conflict (name, spec) do nothing;

alter table items enable row level security;
