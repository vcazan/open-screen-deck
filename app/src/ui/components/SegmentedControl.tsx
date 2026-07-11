interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((o) => o.value === value);

  return (
    <div className={`segmented ${className}`.trim()} role="tablist">
      <span
        className="segmented-thumb"
        style={{
          width: `${100 / options.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
        aria-hidden
      />
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={`segmented-option ${opt.value === value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
