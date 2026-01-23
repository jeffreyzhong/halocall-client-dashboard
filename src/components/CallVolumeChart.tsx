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

interface CallVolumeChartProps {
  conversations: Conversation[]
  timeWindow: TimeWindow
  isLoading: boolean
}

// Generate 24 hours of data (0-23)
const formatHour = (hour: number): string => {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

const formatDay = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatShortDay = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function getHourlyData(conversations: Conversation[]) {
  const hourCounts = Array(24).fill(0);
  
  conversations.forEach((conv) => {
    const date = new Date(conv.start_time_unix_secs * 1000);
    const hour = date.getHours();
    hourCounts[hour]++;
  });

  return hourCounts.map((calls, hour) => ({
    label: formatHour(hour),
    calls,
  }));
}

function getDailyData(conversations: Conversation[], days: number) {
  const now = new Date();
  const dayData: { date: Date; calls: number }[] = [];
  
  // Create entries for each day
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    dayData.push({ date, calls: 0 });
  }

  // Count conversations per day
  conversations.forEach((conv) => {
    const convDate = new Date(conv.start_time_unix_secs * 1000);
    convDate.setHours(0, 0, 0, 0);
    
    const dayEntry = dayData.find(d => d.date.getTime() === convDate.getTime());
    if (dayEntry) {
      dayEntry.calls++;
    }
  });

  return dayData.map(d => ({
    label: formatShortDay(d.date),
    fullLabel: formatDay(d.date),
    calls: d.calls,
  }));
}

function getMonthDailyData(conversations: Conversation[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysSoFar = now.getDate();
  
  const dayData: { date: Date; calls: number }[] = [];
  
  for (let i = 0; i < daysSoFar; i++) {
    const date = new Date(startOfMonth);
    date.setDate(date.getDate() + i);
    dayData.push({ date, calls: 0 });
  }

  conversations.forEach((conv) => {
    const convDate = new Date(conv.start_time_unix_secs * 1000);
    convDate.setHours(0, 0, 0, 0);
    
    const dayEntry = dayData.find(d => d.date.getTime() === convDate.getTime());
    if (dayEntry) {
      dayEntry.calls++;
    }
  });

  return dayData.map(d => ({
    label: d.date.getDate().toString(),
    fullLabel: formatDay(d.date),
    calls: d.calls,
  }));
}

export default function CallVolumeChart({ conversations, timeWindow, isLoading }: CallVolumeChartProps) {
  let chartData: { label: string; fullLabel?: string; calls: number }[] = [];
  let subtitle = '';

  if (timeWindow === 'today') {
    chartData = getHourlyData(conversations);
    subtitle = "Today's hourly breakdown";
  } else if (timeWindow === 'last_7_days') {
    chartData = getDailyData(conversations, 7);
    subtitle = 'Last 7 days breakdown';
  } else if (timeWindow === 'this_month') {
    chartData = getMonthDailyData(conversations);
    subtitle = 'This month breakdown';
  } else if (timeWindow === 'last_30_days') {
    chartData = getDailyData(conversations, 30);
    subtitle = 'Last 30 days breakdown';
  }

  const maxCalls = Math.max(...chartData.map(d => d.calls), 1);

  return (
    <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5">
      <div className="mb-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Call Volume</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex items-end gap-1 h-40 overflow-x-auto">
          {chartData.map((data, index) => {
            const heightPercent = maxCalls > 0 ? (data.calls / maxCalls) * 100 : 0;
            const minHeight = 4;
            const barHeight = Math.max(heightPercent, minHeight / 128 * 100);
            
            return (
              <div key={index} className="flex-1 min-w-0 flex flex-col items-center gap-1 group">
                <div className="w-full relative flex items-end justify-center h-32">
                  <div 
                    className={`w-full rounded-sm transition-colors ${
                      data.calls > 0 
                        ? 'bg-[var(--accent-green)] group-hover:bg-[var(--accent-green-hover)]' 
                        : 'bg-[var(--border-subtle)] group-hover:bg-[var(--text-muted)]'
                    }`}
                    style={{ height: `${barHeight}%`, minHeight: `${minHeight}px` }}
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[var(--text-primary)] font-medium whitespace-nowrap z-10 bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    {data.calls} call{data.calls !== 1 ? 's' : ''}
                    {data.fullLabel && <span className="block text-[var(--text-muted)]">{data.fullLabel}</span>}
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
