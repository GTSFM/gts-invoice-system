import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { formatINR } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { TrendingUp, AlertTriangle, BarChart, Calendar, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DSOPage() {
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState('');

  // 1. Fetch DSO Dashboard data
  const { data: dsoRes, isLoading: dsoLoading } = useQuery({
    queryKey: ['dsoDashboard', financialYear, selectedMonth],
    queryFn: async () => {
      const res = await api.get('/dso/dashboard', {
        params: {
          financialYear,
          ...(selectedMonth && { month: selectedMonth }),
        },
      });
      return res.data;
    },
  });

  // 2. Fetch DSO 12-Month Trend
  const { data: trendRes, isLoading: trendLoading } = useQuery({
    queryKey: ['dsoTrend'],
    queryFn: async () => (await api.get('/dso/trend')).data?.data || [],
  });

  const isLoading = dsoLoading || trendLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gts-900" />
            Days Sales Outstanding (DSO) & Ageing Dashboard
          </h2>
          <p className="text-xs text-gray-500">
            Portfolio DSO metrics & Indicative DSO calculated against eligible credit sales and closing trade receivables.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="2025-26">FY 2025-26</option>
            <option value="2024-25">FY 2024-25</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Formula Transparency Card */}
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-gts-900 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-950">
              <span className="font-bold">Active Accounting Basis:</span> {dsoRes?.currentPeriod?.formula || 'Portfolio DSO = (Average Trade Receivables ÷ Credit Sales) × Days in Period'}.
              GST is excluded from eligible receivables and credit sales to ensure consistent underlying economic measurement.
            </div>
          </div>

          {/* Core Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Period DSO</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-gts-900">
                  {dsoRes?.currentPeriod?.dso ? `${dsoRes.currentPeriod.dso} Days` : 'N/A'}
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded">
                  {dsoRes?.trend || 'STABLE'}
                </span>
              </div>
              <span className="text-xs text-gray-400 mt-2 block">
                Credit Sales: {formatINR(dsoRes?.currentPeriod?.creditSales || 0)}
              </span>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Indicative DSO (Closing)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-gray-900">
                  {dsoRes?.currentPeriod?.indicativeDso ? `${dsoRes.currentPeriod.indicativeDso} Days` : 'N/A'}
                </span>
              </div>
              <span className="text-xs text-gray-400 mt-2 block">
                Based on closing trade balance
              </span>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue Beyond 30 Days</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-red-600">
                  {formatINR(dsoRes?.amountOverdue30Plus || 0)}
                </span>
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-xs text-red-500 mt-2 block font-medium">Critical recovery focus</span>
            </div>
          </div>

          {/* DSO 12-Month Trend Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-900 text-sm mb-4">DSO Realization Trend (Last 12 Months)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRes || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="d" />
                  <Tooltip />
                  <Line type="monotone" dataKey="dso" stroke="#3B2A7A" strokeWidth={2.5} name="Portfolio DSO" />
                  <Line type="monotone" dataKey="indicativeDso" stroke="#6C5BC0" strokeDasharray="5 5" name="Indicative DSO" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
