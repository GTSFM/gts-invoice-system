import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatINR, formatDate } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  ExternalLink,
} from 'lucide-react';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState('');

  // 1. Invoices List Query
  const { data: invoicesRes, isLoading } = useQuery({
    queryKey: ['invoicesList', activeTab, searchTerm, financialYear, selectedMonth],
    queryFn: async () => {
      const res = await api.get('/invoices', {
        params: {
          financialYear,
          ...(selectedMonth && { billingMonth: selectedMonth }),
          ...(activeTab !== 'ALL' && { status: activeTab }),
          ...(searchTerm && { search: searchTerm }),
        },
      });
      return res.data;
    },
  });

  const invoices = invoicesRes?.data || [];

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-700' },
      SUBMITTED_TO_CLIENT: { bg: 'bg-indigo-50 border border-indigo-200', text: 'text-indigo-700' },
      ACKNOWLEDGED: { bg: 'bg-teal-50 border border-teal-200', text: 'text-teal-700' },
      PARTIALLY_PAID: { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-700' },
      PAID: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700' },
      DISPUTED: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700' },
      CANCELLED: { bg: 'bg-red-50 border border-red-200', text: 'text-red-700' },
    };
    const c = map[status] || { bg: 'bg-gray-50', text: 'text-gray-600' };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gts-900" />
            Commercial Invoice Register
          </h2>
          <p className="text-xs text-gray-500">
            Track full lifecycle from draft preparation through submission, acknowledgement, and realization.
          </p>
        </div>

        <button
          onClick={() => navigate('/invoices/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800 transition"
        >
          <Plus className="w-4 h-4" />
          Create Commercial Invoice
        </button>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto">
          {['ALL', 'DRAFT', 'SUBMITTED_TO_CLIENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'PAID'].map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition ${
                  activeTab === tab
                    ? 'bg-gts-900 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.replace(/_/g, ' ')}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gts-700"
            />
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            No invoices found for the current selection.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <th className="p-3">Invoice Number</th>
                  <th className="p-3">Client & Site</th>
                  <th className="p-3">Month</th>
                  <th className="p-3 text-right">Invoice Value</th>
                  <th className="p-3 text-right">Total Received</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-gray-50/80 transition">
                    <td className="p-3 font-bold text-gray-900 flex items-center gap-1.5">
                      <span className="text-gts-900">{inv.invoiceNumber}</span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-800">{inv.client?.name}</div>
                      <div className="text-gray-400 text-[10px]">{inv.site?.name}</div>
                    </td>
                    <td className="p-3 text-gray-600 font-medium">{inv.billingMonth}</td>
                    <td className="p-3 text-right font-bold text-gray-900">
                      {formatINR(inv.totalAmount)}
                    </td>
                    <td className="p-3 text-right font-semibold text-emerald-600">
                      {formatINR(inv.totalReceived)}
                    </td>
                    <td className="p-3 text-right font-bold text-red-600">
                      {formatINR(inv.outstandingAmount)}
                    </td>
                    <td className="p-3 text-center">{getStatusBadge(inv.status)}</td>
                    <td className="p-3 text-gray-600">
                      {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-gray-400">Due Date Pending</span>}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                        className="p-1 text-gray-500 hover:text-gts-900 hover:bg-gray-100 rounded"
                        title="View Full Lifecycle Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
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
