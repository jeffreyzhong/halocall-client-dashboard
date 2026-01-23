interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
}

export default function StatsCard({ title, value, change, changeType = 'neutral', icon }: StatsCardProps) {
  return (
    <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)] mt-2">{value}</p>
          {change && (
            <p 
              className="text-xs mt-2 font-medium"
              style={{ 
                color: changeType === 'positive' 
                  ? 'var(--accent-green)' 
                  : changeType === 'negative' 
                  ? 'var(--accent-red)' 
                  : 'var(--text-muted)' 
              }}
            >
              {change}
            </p>
          )}
        </div>
        <div className="text-[var(--text-muted)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
