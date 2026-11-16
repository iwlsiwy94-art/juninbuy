-- 추가 기능: 구매 일괄 회계 반영·전표 출력, 단가 관리
-- Supabase > SQL Editor 에 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다. (여러 번 실행해도 안전)

-- 회계 전표 (업체별 매입전표)
create table if not exists vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text not null unique,
  voucher_date date not null,
  vendor_id uuid references vendors (id) on delete set null,
  vendor_name text not null,
  biz_no text not null default '',
  debit_account text not null default '원재료',
  vat_account text not null default '부가세대급금',
  credit_account text not null default '외상매입금',
  summary text not null default '',
  period_from date,
  period_to date,
  slip_count int not null default 0,
  supply bigint not null default 0,
  vat bigint not null default 0,
  total bigint not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vouchers_date_idx on vouchers (voucher_date desc);

-- 명세서의 회계 반영 상태
alter table slips add column if not exists posted boolean not null default false;
alter table slips add column if not exists voucher_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'slips_voucher_fk') then
    alter table slips add constraint slips_voucher_fk foreign key (voucher_id) references vouchers (id) on delete set null;
  end if;
end $$;
create index if not exists slips_posted_idx on slips (posted, kind, date);

-- 업체별 기본 회계 계정 (비어 있으면 원재료)
alter table vendors add column if not exists account text not null default '';

-- 단가표
create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  kind text not null default '매입' check (kind in ('매입', '매출')),
  vendor_id uuid references vendors (id) on delete cascade,
  item_name text not null,
  spec text not null default '',
  unit text not null default '',
  price double precision not null,
  valid_from date not null default current_date,
  memo text not null default '',
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists prices_item_idx on prices (item_name);

alter table vouchers enable row level security;
alter table prices enable row level security;
