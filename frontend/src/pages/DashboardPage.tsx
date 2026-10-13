import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { formatINR } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  TrendingUp,
  FileText,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  BarChart,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function DashboardPage() {
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState('');

  // 1. Fetch DSO & Receivables Summary
  const { data: dsoData, isLoading: dsoLoading } = useQuery({
    queryKey: ['dsoDashboard', financialYear, selectedMonth],
    queryFn: async () => {
      const res = await api.get('/dso/dashboard', {
        params: { financialYear, ...(selectedMonth ? { month: selectedMonth } : {}) },
      });
      return res.data;
    },
  });

  // 2. Fetch Pending Actions & Alerts
  const { data: pendingActions, isLoading: actionsLoading } = useQuery({
    queryKey: ['pendingActions'],
    queryFn: async () => {
      const res = await api.get('/reports/pending-actions');
      return res.data;
    },
  });

  // 3. Fetch Projection vs Actual
  const { data: projData, isLoading: projLoading } = useQuery({
    queryKey: ['projectionVsActual', financialYear, selectedMonth],
    queryFn: async () => {
      const res = await api.get('/reports/projection-vs-actual', {
        params: { financialYear, ...(selectedMonth ? { billingMonth: selectedMonth } : {}) },
      });
      return res.data?.data || [];
    },
  });

  const isLoading = dsoLoading || actionsLoading || projLoading;

  // Chart preparation
  const chartData = (projData || []).slice(0, 8).map((item: any) => ({
    name: item.site.substring(0, 15),
    Projected: parseFloat(item.projectedExGst.replace(/,/g, '')) || 0,
    Actual: parseFloat(item.actualExGst.replace(/,/g, '')) || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header and Global Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Executive Financial Dashboard</h2>
          <p className="text-xs text-gray-500">Live consolidated overview of billings, submissions, and collections</p>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Financial Year</label>
            <select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
            >
              <option value="2025-26">FY 2025-26</option>
              <option value="2024-25">FY 2024-25</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Billing Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* 12 Executive KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Closing Outstanding */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Trade Receivables
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gray-900">
                  {formatINR(dsoData?.currentPeriod?.closingOutstanding || 0)}
                </span>
                <span className="p-1 rounded bg-purple-50 text-gts-900">
                  <TrendingUp className="w-5 h-5" />
                </span>
              </div>
              <span className="text-xs text-gray-400 mt-2">Active non-cancelled balance</span>
            </div>

            {/* KPI 2: Overdue Receivables */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Overdue Receivables
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-red-600">
                  {formatINR(dsoData?.currentPeriod?.overdueOutstanding || 0)}
                </span>
                <span className="p-1 rounded bg-red-50 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                </span>
              </div>
              <span className="text-xs text-red-500 mt-2 font-medium">Beyond agreed payment terms</span>
            </div>

            {/* KPI 3: Portfolio DSO */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Days Sales Outstanding (DSO)
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gts-900">
                  {dsoData?.currentPeriod?.dso ? `${dsoData.currentPeriod.dso} Days` : 'N/A'}
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">
                  {dsoData?.trend || 'STABLE'}
                </span>
              </div>
              <span className="text-xs text-gray-400 mt-2">Average days to realize collections</span>
            </div>

            {/* KPI 4: Overdue Submissions Alert */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Submissions Overdue
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-amber-600">
                  {pendingActions?.overdueSubmissions || 0}
                </span>
                <span className="p-1 rounded bg-amber-50 text-amber-600">
                  <Clock className="w-5 h-5" />
                </span>
              </div>
              <span className="text-xs text-amber-600 mt-2 font-medium">Missed client target dates</span>
            </div>
          </div>

          {/* Billing Performance Chart & Variance Ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <BarChart className="w-5 h-5 text-gts-700" />
                  Site-wise Billing: Projected vs Actual (Ex-GST)
                </h3>
                <span className="text-xs text-gray-400">Values in INR</span>
              </div>

              {chartData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBar data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" angle={-15} textAnchor="end" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                      <Tooltip formatter={(value: any) => formatINR(value)} />
                      <Legend />
                      <Bar dataKey="Projected" fill="#3B2A7A" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Actual" fill="#6C5BC0" radius={[4, 4, 0, 0]} />
                    </RechartsBar>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 text-sm">
                  <span>No projection records entered for this period.</span>
                </div>
              )}
            </div>

            {/* Exceptions & Alerts Panel */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Operational Action Items
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-red-50 rounded-md border border-red-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-red-900">Overdue Client Invoices</p>
                    <p className="text-xs text-red-700">Payment terms expired without receipt</p>
                  </div>
                  <span className="text-lg font-bold text-red-700">
                    {pendingActions?.overduePayments || 0}
                  </span>
                </div>

                <div className="p-3 bg-amber-50 rounded-md border border-amber-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-900">Submissions Due (Next 3 Days)</p>
                    <p className="text-xs text-amber-700">Upcoming contractual target dates</p>
                  </div>
                  <span className="text-lg font-bold text-amber-700">
                    {pendingActions?.dueSoonSubmissions || 0}
                  </span>
                </div>

                <div className="p-3 bg-purple-50 rounded-md border border-purple-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-purple-900">Missing Due Dates</p>
                    <p className="text-xs text-purple-700">Submitted invoices awaiting trigger date</p>
                  </div>
                  <span className="text-lg font-bold text-gts-900">
                    {pendingActions?.missingDueDates || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
