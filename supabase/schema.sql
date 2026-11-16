-- (주)준인산업 거래명세서 관리시스템 데이터베이스
-- Supabase > SQL Editor 에 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다.

create extension if not exists pgcrypto;

-- 직원 계정
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 회사 정보 (한 줄만 사용)
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default '(주)준인산업',
  biz_no text not null default '',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- 등록 업체(거래처)
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default '매입처' check (kind in ('매입처', '매출처', '공통')),
  biz_no text not null default '',
  ceo text not null default '',
  address text not null default '',
  biz_type text not null default '',
  biz_item text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  payment_terms text not null default '',
  bank_memo text not null default '',
  memo text not null default '',
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vendors_biz_no_uniq on vendors (biz_no) where biz_no <> '';
create index if not exists vendors_name_idx on vendors (name);

-- 거래명세서(전표)
create table if not exists slips (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('매입', '매출')),
  date date not null,
  vendor_id uuid references vendors (id) on delete set null,
  vendor_name text not null,
  biz_no text not null default '',
  doc_no text not null default '',
  items jsonb not null default '[]'::jsonb,
  supply bigint not null default 0,
  vat bigint not null default 0,
  total bigint not null default 0,
  memo text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz
);
create index if not exists slips_date_idx on slips (date desc);
create index if not exists slips_vendor_idx on slips (vendor_id);

-- 업체별 거래 합계
create or replace view vendor_stats with (security_invoker = true) as
  select vendor_id, count(*)::int as slip_count, coalesce(sum(total), 0)::bigint as total_sum, max(date) as last_date
  from slips where vendor_id is not null group by vendor_id;

-- 외부(익명) 접근 차단: 모든 읽기·쓰기는 사이트 서버만 합니다.
alter table users enable row level security;
alter table settings enable row level security;
alter table vendors enable row level security;
alter table slips enable row level security;

-- 원본 사진·PDF 보관함 (비공개)
insert into storage.buckets (id, name, public) values ('originals', 'originals', false)
  on conflict (id) do nothing;
