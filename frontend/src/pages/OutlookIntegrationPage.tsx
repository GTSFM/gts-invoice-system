import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Mail, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OutlookIntegrationPage() {
  const { data: statusRes, isLoading } = useQuery({
    queryKey: ['emailStatus'],
    queryFn: async () => (await api.get('/email-integration/status')).data,
  });

  const { data: activityRes } = useQuery({
    queryKey: ['emailActivity'],
    queryFn: async () => (await api.get('/email-integration/activity')).data,
  });

  const handleConnect = async () => {
    try {
      const res = await api.post('/email-integration/connect');
      if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error ||
          'Microsoft Graph API credentials not configured in server environment. Manual ops remain operational.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-5 h-5 text-gts-900" />
          Microsoft 365 & Outlook Mailbox Integration
        </h2>
        <p className="text-xs text-gray-500">
          Microsoft Graph API OAuth 2.0 connectivity for automated client submission tracking and follow-up correspondence.
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Connection Health Banner */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {statusRes?.isServerConfigured ? (
                <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="font-bold text-sm text-gray-900">
                  {statusRes?.isServerConfigured
                    ? 'Microsoft Entra ID Configured On Server'
                    : 'Microsoft Graph Credentials Not Configured (Graceful Degrade)'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  {statusRes?.message}
                </p>
              </div>
            </div>

            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-gts-900 text-white rounded text-xs font-semibold hover:bg-gts-800 shrink-0"
            >
              Connect Official Mailbox
            </button>
          </div>

          {/* Activity Register */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-sm text-gray-900">Email Activity Audit Register</h3>
              <p className="text-xs text-gray-400">Synchronized notifications and client submission correspondence.</p>
            </div>

            {(activityRes?.data || []).length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-xs">
                No external email activities logged yet. All actions recorded internally.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Invoice Ref</th>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activityRes.data.map((act: any) => (
                    <tr key={act.id}>
                      <td className="p-3 text-gray-500">{new Date(act.createdAt).toLocaleString('en-IN')}</td>
                      <td className="p-3 font-semibold text-gray-800">{act.invoice?.invoiceNumber || '—'}</td>
                      <td className="p-3 text-gray-600">{act.recipient}</td>
                      <td className="p-3 text-gray-700">{act.subject}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-semibold">
                          {act.deliveryStatus || 'DELIVERED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
