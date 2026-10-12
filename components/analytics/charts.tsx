"use client"

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

// Validated categorical pair (dataviz reference palette, slots 1–2).
const SERIES_1 = "#2a78d6"
const SERIES_2 = "#eb6834"
const AXIS = { fontSize: 11, fill: "#6B6F76" }
const GRID = "#EEEEF0"
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: "1px solid #E6E6E9", boxShadow: "0 1px 2px rgb(16 24 40 / 0.06)" }

export function OutreachLine({ data }: { data: { day: string; drafted: number; sent: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#C9CBD0" }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#1A1A1A" }} />
        <Line type="monotone" dataKey="drafted" name="Drafted" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="sent" name="Sent" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function FunnelBars({ data }: { data: { stage: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -18 }} barCategoryGap={8}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="stage" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F4F4F5" }} />
        <Bar dataKey="value" name="Count" fill={SERIES_1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "#1A1A1A" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const OPENER: Record<string, string> = { founder_post: "Founder post", founder_quote: "Founder quote", product_detail: "Product detail", shared_investor: "Shared investor", unknown: "Unknown" }

export function ReplyRateBars({ data }: { data: { opener: string; sent: number; replied: number; rate: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: OPENER[d.opener] ?? d.opener }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis unit="%" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "#F4F4F5" }}
          formatter={(v, _n, item) => [`${v}% (${item.payload.replied}/${item.payload.sent} sent)`, "Reply rate"]}
        />
        <Bar dataKey="rate" name="Reply rate" fill={SERIES_1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="rate" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "#1A1A1A" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RejectionBars({ data }: { data: { code: string; n: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 8 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="code" width={170} tick={{ ...AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F4F4F5" }} />
        <Bar dataKey="n" name="Startups" radius={[0, 4, 4, 0]}>
          {data.map((d) => <Cell key={d.code} fill={SERIES_1} />)}
          <LabelList dataKey="n" position="right" style={{ fontSize: 11, fill: "#1A1A1A" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
