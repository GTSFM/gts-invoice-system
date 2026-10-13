import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Shield, Search, Lock } from 'lucide-react';

export default function AuditLogsPage() {
  const [recordType, setRecordType] = useState('');

  const { data: logsRes, isLoading } = useQuery({
    queryKey: ['auditLogsList', recordType],
    queryFn: async () => {
      const res = await api.get('/audit', {
        params: { ...(recordType && { recordType }) },
      });
      return res.data;
    },
  });

  const logs = logsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-gts-900" />
            Immutable Audit Trail & Compliance Log
          </h2>
          <p className="text-xs text-gray-500">
            Append-only system ledger capturing all financial modifications, invoice status transitions, and projection revisions.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="">All Record Types</option>
            <option value="BillingProjection">Billing Projections</option>
            <option value="Invoice">Invoices</option>
            <option value="PaymentReceipt">Payment Receipts</option>
            <option value="PaymentAllocation">Payment Allocations</option>
            <option value="USER">User Authentication</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs">
            No audit records match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                  <th className="p-3">Timestamp (IST)</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Record Type & ID</th>
                  <th className="p-3">Change Reason / Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-500 whitespace-nowrap font-mono">
                      {new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </td>
                    <td className="p-3 font-semibold text-gray-800">
                      {log.user?.name || 'System / Auto'}
                      <div className="text-[10px] text-gray-400">{log.user?.email}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-gts-900">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-gray-700">
                      <span className="font-semibold text-gray-900">{log.recordType}</span>
                      <div className="text-[10px] text-gray-400">{log.recordId}</div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {log.changeReason ? (
                        <span className="italic">"{log.changeReason}"</span>
                      ) : (
                        <span className="text-gray-400">Regular system operation</span>
                      )}
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
