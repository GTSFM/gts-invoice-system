import React, { useState } from 'react';
import api from '../services/api';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState('');

  const reports = [
    {
      id: 'projection-vs-actual',
      title: 'Projection vs Actual Billing Report',
      description: 'Site-wise variance, variance percentage, and remarks audit.',
    },
    {
      id: 'invoice-register',
      title: 'Master Invoice Register',
      description: 'Consolidated commercial invoice lifecycle records, receipts, and outstanding.',
    },
    {
      id: 'submission-tracker',
      title: 'Invoice Submission Compliance Tracker',
      description: 'Target vs actual dates, delay days, and acknowledgement SLA status.',
    },
    {
      id: 'pending-actions',
      title: 'Pending Actions & Overdue Exceptions',
      description: 'Overdue invoices, due dates pending, and submission target alerts.',
    },
  ];

  const handleDownload = (reportId: string, format: 'xlsx' | 'csv' | 'pdf') => {
    const params = new URLSearchParams({
      format,
      financialYear,
      ...(selectedMonth && { billingMonth: selectedMonth }),
    });

    const url = `/api/reports/${reportId}?${params.toString()}`;
    window.open(url, '_blank');
    toast.success(`Exporting ${reportId} as ${format.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Download className="w-5 h-5 text-gts-900" />
            Executive Reports & Export Centre
          </h2>
          <p className="text-xs text-gray-500">
            Download certified audit reports in Excel (.xlsx), CSV (.csv), or executive PDF format.
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
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((rep) => (
          <div key={rep.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-gray-900">{rep.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{rep.description}</p>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => handleDownload(rep.id, 'xlsx')}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold hover:bg-emerald-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
              </button>
              <button
                onClick={() => handleDownload(rep.id, 'csv')}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-semibold hover:bg-blue-100"
              >
                <FileText className="w-3.5 h-3.5" /> CSV (.csv)
              </button>
              <button
                onClick={() => handleDownload(rep.id, 'pdf')}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-semibold hover:bg-red-100"
              >
                <Download className="w-3.5 h-3.5" /> PDF (.pdf)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
