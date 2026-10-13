import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { formatDate } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Calendar, Clock, AlertTriangle, CheckCircle2, TrendingUp, Filter } from 'lucide-react';

export default function SubmissionTrackerPage() {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 1. Fetch KPIs
  const { data: kpiData } = useQuery({
    queryKey: ['submissionKPIs', selectedMonth, selectedRegion],
    queryFn: async () => {
      const res = await api.get('/submission/kpis', {
        params: {
          ...(selectedMonth && { billingMonth: selectedMonth }),
          ...(selectedRegion && { regionId: selectedRegion }),
        },
      });
      return res.data;
    },
  });

  // 2. Fetch Submission list
  const { data: submissionsRes, isLoading } = useQuery({
    queryKey: ['submissionList', selectedMonth, selectedRegion, statusFilter],
    queryFn: async () => {
      const res = await api.get('/submission', {
        params: {
          ...(selectedMonth && { billingMonth: selectedMonth }),
          ...(selectedRegion && { regionId: selectedRegion }),
          ...(statusFilter && { status: statusFilter }),
        },
      });
      return res.data;
    },
  });

  const { data: regions } = useQuery({
    queryKey: ['regionsList'],
    queryFn: async () => (await api.get('/regions')).data.data || [],
  });

  const rows = submissionsRes?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gts-900" />
            Invoice Submission Compliance Tracker
          </h2>
          <p className="text-xs text-gray-500">
            Target vs actual submission date tracking. Submission delay calculated as: Actual Date &minus; Target Date.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase">On-Time Submissions</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-600">{kpiData?.onTimeCount || 0}</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            Compliance rate: {kpiData?.onTimePct ? `${kpiData.onTimePct}%` : 'N/A'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase">Late Submissions</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-600">{kpiData?.lateCount || 0}</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">Submitted beyond SLA target</span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase">Overdue & Pending</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-red-600">{kpiData?.overdueNotSubmitted || 0}</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <span className="text-[10px] text-red-500 mt-1 font-medium block">Target passed, not submitted</span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase">Average Delay</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-gts-900">
              {kpiData?.averageDelayDays !== undefined ? `${kpiData.averageDelayDays}d` : '0d'}
            </span>
            <TrendingUp className="w-5 h-5 text-gts-700" />
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">Days across delayed invoices</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-lg border border-gray-200 text-xs">
        <div>
          <label className="block text-gray-500 mb-1">Billing Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-gray-500 mb-1">Region</label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="">All Regions</option>
            {(regions || []).map((r: any) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-500 mb-1">Compliance Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="ON_TIME">On Time</option>
            <option value="EARLY">Early</option>
            <option value="LATE">Late</option>
            <option value="DUE_SOON">Due Soon (3-day window)</option>
            <option value="OVERDUE_NOT_SUBMITTED">Overdue & Not Submitted</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs">
            No submission compliance records match the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Client & Site</th>
                  <th className="p-3">Month</th>
                  <th className="p-3">Target Date</th>
                  <th className="p-3">Actual Date</th>
                  <th className="p-3 text-center">Variance (Days)</th>
                  <th className="p-3 text-center">SLA Compliance</th>
                  <th className="p-3">Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((item: any) => (
                  <tr key={item.invoiceId || item.id} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900">{item.invoiceNumber}</td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-800">{item.clientName}</div>
                      <div className="text-gray-400 text-[10px]">{item.siteName}</div>
                    </td>
                    <td className="p-3 text-gray-600">{item.billingMonth}</td>
                    <td className="p-3 font-medium text-gray-800">
                      {item.targetDate ? formatDate(item.targetDate) : 'Not Configured'}
                    </td>
                    <td className="p-3 text-gray-700">
                      {item.actualDate ? formatDate(item.actualDate) : 'Pending'}
                    </td>
                    <td className="p-3 text-center font-bold">
                      {item.delayDays !== null && item.delayDays !== undefined ? (
                        <span className={item.delayDays > 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {item.delayDays > 0 ? `+${item.delayDays}d` : `${item.delayDays}d`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.submissionStatus === 'ON_TIME'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.submissionStatus === 'EARLY'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : item.submissionStatus === 'LATE'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : item.submissionStatus === 'OVERDUE_NOT_SUBMITTED'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {item.submissionStatus}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">{item.submissionChannel || 'Portal'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
