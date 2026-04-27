import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function formatDayLabel(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function ClickChart({ data }) {
  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayLabel}
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={formatDayLabel}
            formatter={function formatCount(value) {
              return [value, 'Clicks'];
            }}
            contentStyle={{
              background: '#fffdf8',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              borderRadius: '14px',
              boxShadow: '0 18px 38px rgba(15, 23, 42, 0.12)'
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#db6a4d"
            strokeWidth={3}
            dot={{ r: 4, fill: '#db6a4d', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ClickChart;
