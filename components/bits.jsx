'use client';

export function KindPill({ kind }) {
  return <span className={`pill ${kind === '매출' ? 'sale' : 'buy'}`}>{kind}</span>;
}

export function VendorKindPill({ kind }) {
  const cls = kind === '매출처' ? 'sale' : kind === '공통' ? 'both' : 'buy';
  return <span className={`pill ${cls}`}>{kind}</span>;
}

export function Seg({ value, options, onChange, kindColors }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={[value === v ? 'on' : '', kindColors && v === '매입' ? 'buy' : '', kindColors && v === '매출' ? 'sale' : ''].join(' ')}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
