import React from 'react'

export const ResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="responsive-container">{children}</div>
)

export const BarChart = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="bar-chart">{children}</div>
)

export const Bar = () => <div data-testid="bar" role="graphics-symbol" />

export const LineChart = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="line-chart">{children}</div>
)

export const Line = () => <div data-testid="line" role="graphics-symbol" />

export const CartesianGrid = () => <div data-testid="cartesian-grid" />
export const XAxis = () => <div data-testid="x-axis" />
export const YAxis = () => <div data-testid="y-axis" />
export const Tooltip = () => <div data-testid="tooltip" />
export const Legend = () => <div data-testid="legend" />
export const Cell = () => <div data-testid="cell" />
export const PieChart = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="pie-chart">{children}</div>
)
export const Pie = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="pie">{children}</div>
)
