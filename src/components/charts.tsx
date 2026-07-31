"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

export function ScoreTrendChart({
  data,
}: {
  data: { date: string; score: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-400">
        No scored conversations in this window.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#a3a3a3" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#a3a3a3" />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" }}
        />
        <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "pass 75", fontSize: 10, fill: "#ef4444" }} />
        <Line type="monotone" dataKey="score" stroke="#0284c7" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
