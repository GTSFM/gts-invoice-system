import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { formatINR } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  BarChart3,
  Plus,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProjectionsPage() {
  const queryClient = useQueryClient();
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedClient, setSelectedClient] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [reviseModalOpen, setReviseModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedProj, setSelectedProj] = useState<any>(null);

  // Form states
  const [formData, setFormData] = useState({
    siteId: '',
    billingMonth: '',
    financialYear: '2025-26',
    projectedAmountExGst: '',
    projectedGst: '',
    isZeroProjection: false,
    zeroReason: '',
    remarks: '',
  });

  const [reviseData, setReviseData] = useState({
    newAmountExGst: '',
    newGst: '',
    revisionReason: '',
  });

  // Queries
  const { data: regions } = useQuery({
    queryKey: ['regionsList'],
    queryFn: async () => (await api.get('/regions')).data.data || [],
  });

  const { data: clients } = useQuery({
    queryKey: ['clientsList'],
    queryFn: async () => (await api.get('/clients')).data.data || [],
  });

  const { data: sites } = useQuery({
    queryKey: ['sitesList'],
    queryFn: async () => (await api.get('/sites')).data.data || [],
  });

  const { data: projectionsRes, isLoading } = useQuery({
    queryKey: ['projections', financialYear, selectedMonth, selectedRegion, selectedClient],
    queryFn: async () => {
      const res = await api.get('/projections', {
        params: {
          financialYear,
          ...(selectedMonth && { billingMonth: selectedMonth }),
          ...(selectedRegion && { regionId: selectedRegion }),
          ...(selectedClient && { clientId: selectedClient }),
        },
      });
      return res.data;
    },
  });

  // Revisions query
  const { data: revisionsData } = useQuery({
    queryKey: ['projectionRevisions', selectedProj?.id],
    queryFn: async () => {
      if (!selectedProj?.id) return [];
      const res = await api.get(`/projections/${selectedProj.id}/revisions`);
      return res.data?.data || [];
    },
    enabled: !!selectedProj?.id && historyModalOpen,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/projections', payload),
    onSuccess: () => {
      toast.success('Billing projection created successfully');
      setCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projections'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create projection');
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => await api.put(`/projections/${id}`, payload),
    onSuccess: () => {
      toast.success('Billing projection revised with audit log');
      setReviseModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projections'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to revise projection');
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (id: string) => await api.patch(`/projections/${id}/lock`),
    onSuccess: () => {
      toast.success('Projection lock status updated');
      queryClient.invalidateQueries({ queryKey: ['projections'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => await api.patch(`/projections/${id}/approve`),
    onSuccess: () => {
      toast.success('Projection approved');
      queryClient.invalidateQueries({ queryKey: ['projections'] });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      projectedAmountExGst: Number(formData.projectedAmountExGst) || 0,
      projectedGst: Number(formData.projectedGst) || 0,
    });
  };

  const handleReviseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviseData.revisionReason) {
      toast.error('Revision reason is strictly mandatory');
      return;
    }
    reviseMutation.mutate({
      id: selectedProj.id,
      payload: {
        newAmountExGst: Number(reviseData.newAmountExGst),
        newGst: Number(reviseData.newGst) || 0,
        revisionReason: reviseData.revisionReason,
      },
    });
  };

  const rows = projectionsRes?.data || [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gts-900" />
            Monthly Billing Projections
          </h2>
          <p className="text-xs text-gray-500">
            Fixed commercial billing projections per site & month. Projections remain independent of invoice amounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800 transition"
          >
            <Plus className="w-4 h-4" />
            Add Site Projection
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200 text-xs">
        <div>
          <label className="block text-gray-500 font-medium mb-1">Financial Year</label>
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
          >
            <option value="2025-26">FY 2025-26</option>
            <option value="2024-25">FY 2024-25</option>
          </select>
        </div>

        <div>
          <label className="block text-gray-500 font-medium mb-1">Billing Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
          />
        </div>

        <div>
          <label className="block text-gray-500 font-medium mb-1">Region</label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
          >
            <option value="">All Regions</option>
            {(regions || []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-500 font-medium mb-1">Client</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gts-700"
          >
            <option value="">All Clients</option>
            {(clients || []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.isDemo ? '(DEMO)' : ''}
              </option>
            ))}
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
          <div className="p-12 text-center text-gray-500">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold">No billing projections found for selected filters.</p>
            <p className="text-xs text-gray-400 mt-1">Use the "Add Site Projection" button above to record a new site projection.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <th className="p-3">Month</th>
                  <th className="p-3">Client & Region</th>
                  <th className="p-3">Site</th>
                  <th className="p-3 text-right">Projected (Ex-GST)</th>
                  <th className="p-3 text-right">Actual Invoiced</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Controls</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((p: any) => {
                  const variance = p.variance !== null && p.variance !== undefined ? p.variance : null;
                  const variancePct = p.variancePct !== null && p.variancePct !== undefined ? p.variancePct : null;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition">
                      <td className="p-3 font-semibold text-gray-900">{p.billingMonth}</td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-800">{p.client?.name || '—'}</div>
                        <div className="text-gray-400 text-[10px]">{p.region?.name || '—'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{p.site?.name || '—'}</div>
                        <div className="text-gray-400 text-[10px]">{p.site?.siteCode || ''}</div>
                      </td>
                      <td className="p-3 text-right font-bold text-gray-900">
                        {formatINR(p.projectedAmountExGst)}
                      </td>
                      <td className="p-3 text-right font-medium text-gray-700">
                        {p.actualBilling !== null ? formatINR(p.actualBilling) : '—'}
                      </td>
                      <td className="p-3 text-right">
                        {variance !== null ? (
                          <div>
                            <span
                              className={`font-semibold ${
                                variance < 0
                                  ? 'text-red-600'
                                  : variance > 0
                                  ? 'text-emerald-600'
                                  : 'text-gray-700'
                              }`}
                            >
                              {formatINR(variance)}
                            </span>
                            <div className="text-[10px] text-gray-400">
                              {variancePct !== null ? `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%` : 'N/A'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.status === 'UNDERBILLING'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : p.status === 'OVERBILLING'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : p.status === 'ON_TARGET'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {p.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="p-3 text-center space-x-1">
                        {p.isLocked && (
                          <span title="Locked" className="inline-block p-1 bg-amber-50 text-amber-700 rounded">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {p.isApproved && (
                          <span title="Approved" className="inline-block p-1 bg-emerald-50 text-emerald-700 rounded">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedProj(p);
                            setReviseData({
                              newAmountExGst: p.projectedAmountExGst,
                              newGst: p.projectedGst || '0',
                              revisionReason: '',
                            });
                            setReviseModalOpen(true);
                          }}
                          disabled={p.isLocked}
                          title="Revise projection with audit trail"
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 disabled:opacity-40 font-medium text-[11px]"
                        >
                          Revise
                        </button>

                        <button
                          onClick={() => {
                            setSelectedProj(p);
                            setHistoryModalOpen(true);
                          }}
                          title="View revision history"
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium text-[11px]"
                        >
                          <History className="w-3.5 h-3.5 inline mr-0.5" />
                          Audit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Projection */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-4">Enter Monthly Site Projection</h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Select Site</label>
                <select
                  required
                  value={formData.siteId}
                  onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                >
                  <option value="">-- Choose Site --</option>
                  {(sites || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.siteCode}) &bull; {s.client?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Billing Month</label>
                  <input
                    type="month"
                    required
                    value={formData.billingMonth}
                    onChange={(e) => setFormData({ ...formData, billingMonth: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Financial Year</label>
                  <input
                    type="text"
                    required
                    value={formData.financialYear}
                    onChange={(e) => setFormData({ ...formData, financialYear: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2"
                    placeholder="2025-26"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Projected Amount (Ex-GST) ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.projectedAmountExGst}
                    onChange={(e) => setFormData({ ...formData, projectedAmountExGst: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2 font-mono font-semibold"
                    placeholder="500000.00"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Projected GST (18%) ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.projectedGst}
                    onChange={(e) => setFormData({ ...formData, projectedGst: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2 font-mono"
                    placeholder="90000.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Commercial Remarks</label>
                <textarea
                  rows={2}
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                  placeholder="Contract scope, planned manpower additions, or extra services"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Projection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revise Projection */}
      {reviseModalOpen && selectedProj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setReviseModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-1">Revise Billing Projection</h3>
            <p className="text-xs text-gray-500 mb-4">
              Site: <span className="font-semibold">{selectedProj.site?.name}</span> &bull; Month:{' '}
              <span className="font-semibold">{selectedProj.billingMonth}</span>
            </p>

            <form onSubmit={handleReviseSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <p className="text-gray-500">Current Projected Value (Ex-GST):</p>
                <p className="text-base font-extrabold text-gray-900">
                  {formatINR(selectedProj.projectedAmountExGst)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">New Projected (Ex-GST) ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={reviseData.newAmountExGst}
                    onChange={(e) => setReviseData({ ...reviseData, newAmountExGst: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2 font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">New GST ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reviseData.newGst}
                    onChange={(e) => setReviseData({ ...reviseData, newGst: e.target.value })}
                    className="w-full border border-gray-300 rounded p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1 text-red-600">
                  Mandatory Revision Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviseData.revisionReason}
                  onChange={(e) => setReviseData({ ...reviseData, revisionReason: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                  placeholder="e.g., Manpower deployment increased as per client amendment letter dated..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReviseModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviseMutation.isPending}
                  className="px-4 py-2 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800 disabled:opacity-50"
                >
                  {reviseMutation.isPending ? 'Recording Audit...' : 'Commit Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revisions History */}
      {historyModalOpen && selectedProj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setHistoryModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-1">Revision History & Audit Log</h3>
            <p className="text-xs text-gray-500 mb-4">
              Site: <span className="font-semibold">{selectedProj.site?.name}</span> &bull; Month:{' '}
              <span className="font-semibold">{selectedProj.billingMonth}</span>
            </p>

            <div className="flex-1 overflow-y-auto space-y-3">
              {(revisionsData || []).length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  No revisions recorded for this projection. Initial entry remains unmodified.
                </div>
              ) : (
                revisionsData.map((rev: any, idx: number) => (
                  <div key={rev.id || idx} className="p-3 bg-gray-50 rounded border border-gray-200 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-gray-900">
                          {formatINR(rev.previousAmountExGst)} &rarr; {formatINR(rev.newAmountExGst)}
                        </span>
                        <p className="text-gray-600 mt-1 italic">"{rev.revisionReason}"</p>
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {new Date(rev.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
