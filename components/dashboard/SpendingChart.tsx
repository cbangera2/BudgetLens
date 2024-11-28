"use client";

import { MonthlySpending } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

interface SpendingChartProps {
  monthlySpending: MonthlySpending[];
}

const CustomXAxis = (props: any) => <XAxis {...props} />;
const CustomYAxis = (props: any) => <YAxis {...props} />;

export function SpendingChart({ monthlySpending }: SpendingChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Spending Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={monthlySpending}
              margin={{ left: 10, right: 10, top: 10, bottom: 20 }}
            >
              <XAxis 
                dataKey="month" 
                label={{ value: "Month", position: "bottom"}}
              />
              <YAxis 
                label={{ value: "Amount ($)", angle: -90, dx: -30 }}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Spending"]}
              />
              <Bar
                dataKey="total"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}