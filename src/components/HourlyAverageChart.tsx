'use client';

type TimeWindow = 'today' | 'last_7_days' | 'this_month' | 'last_30_days'

interface Conversation {
  conversation_id: string
  agent_id: string
  agent_name: string | null
  start_time_unix_secs: number
  call_duration_secs: number
  status: string
  call_successful: 'success' | 'failure' | 'unknown'
  caller_phone_number: string | null
}

interface HourlyAverageChartProps {
  conversations: Conversation[]
  timeWindow: TimeWindow
  isLoading: boolean
}

const formatHour = (hour: number): string => {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

function getDaysInTimeWindow(timeWindow: TimeWindow): number {
  const now = new Date();
  
  switch (timeWindow) {
    case 'today':
      return 1;
    case 'last_7_days':
      return 7;
    case 'this_month':
      return now.getDate(); // Days elapsed so far this month
    case 'last_30_days':
      return 30;
    default:
      return 7;
  }
}

function getHourlyData(conversations: Conversation[], timeWindow: TimeWindow) {
  const hourCounts = Array(24).fill(0);
  
  conversations.forEach((conv) => {
    const date = new Date(conv.start_time_unix_secs * 1000);
    const hour = date.getHours();
    hourCounts[hour]++;
  });

  const days = getDaysInTimeWindow(timeWindow);
  const isToday = timeWindow === 'today';

  return hourCounts.map((count, hour) => ({
    hour,
    label: formatHour(hour),
    count,
    average: isToday ? count : count / days,
    displayValue: isToday ? count : parseFloat((count / days).toFixed(1)),
  }));
}

export default function HourlyAverageChart({ conversations, timeWindow, isLoading }: HourlyAverageChartProps) {
  const chartData = getHourlyData(conversations, timeWindow);
  const isToday = timeWindow === 'today';
  
  const maxValue = Math.max(...chartData.map(d => d.displayValue), 1);

  const subtitle = isToday 
    ? "Calls per hour today" 
    : `Average calls per hour (${getDaysInTimeWindow(timeWindow)} days)`;

  return (
    <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5">
      <div className="mb-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Hourly Distribution</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex items-end gap-1 h-40 overflow-x-auto">
          {chartData.map((data) => {
            const heightPercent = maxValue > 0 ? (data.displayValue / maxValue) * 100 : 0;
            const minHeight = 4;
            const barHeight = Math.max(heightPercent, minHeight / 128 * 100);
            
            return (
              <div key={data.hour} className="flex-1 min-w-0 flex flex-col items-center gap-1 group">
                <div className="w-full relative flex items-end justify-center h-32">
                  <div 
                    className={`w-full rounded-sm transition-colors ${
                      data.displayValue > 0 
                        ? 'bg-[var(--accent-blue)] group-hover:bg-[var(--accent-blue-hover)]' 
                        : 'bg-[var(--border-subtle)] group-hover:bg-[var(--text-muted)]'
                    }`}
                    style={{ height: `${barHeight}%`, minHeight: `${minHeight}px` }}
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[var(--text-primary)] font-medium whitespace-nowrap z-10 bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    {isToday ? (
                      <>{data.count} call{data.count !== 1 ? 's' : ''}</>
                    ) : (
                      <>
                        {data.displayValue} avg
                        <span className="block text-[var(--text-muted)]">{data.count} total</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-[var(--text-muted)] whitespace-nowrap">{data.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
