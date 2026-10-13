import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { MapPin, Plus, Edit2, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegionsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<any>(null);

  const [form, setForm] = useState({
    regionCode: '',
    name: '',
    regionalManager: '',
    regionalOpsEmail: '',
    billingTeamEmail: '',
    financeContactEmail: '',
  });

  const { data: regionsRes, isLoading } = useQuery({
    queryKey: ['regionsListFull'],
    queryFn: async () => (await api.get('/regions')).data,
  });

  const regions = regionsRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/regions', payload),
    onSuccess: () => {
      toast.success('Region created successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['regionsListFull'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save region'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => await api.put(`/regions/${id}`, payload),
    onSuccess: () => {
      toast.success('Region updated with audit trail');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['regionsListFull'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update region'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: any) => await api.patch(`/regions/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Region status updated safely');
      queryClient.invalidateQueries({ queryKey: ['regionsListFull'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Status change prohibited due to active dependencies'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRegion) {
      updateMutation.mutate({ id: editingRegion.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gts-900" />
            Operating Regions Master
          </h2>
          <p className="text-xs text-gray-500">
            Pre-seeded with 8 operational zones. Referential integrity guarantees historical invoice preservation.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRegion(null);
            setForm({
              regionCode: '',
              name: '',
              regionalManager: '',
              regionalOpsEmail: '',
              billingTeamEmail: '',
              financeContactEmail: '',
            });
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800"
        >
          <Plus className="w-4 h-4" /> Add Region
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                  <th className="p-3">Code</th>
                  <th className="p-3">Region Name</th>
                  <th className="p-3">Regional Ops Email</th>
                  <th className="p-3">Billing Team Email</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {regions.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="p-3 font-mono font-bold text-gray-900">{r.regionCode}</td>
                    <td className="p-3 font-semibold text-gray-800">{r.name}</td>
                    <td className="p-3 text-gray-600">{r.regionalOpsEmail || '—'}</td>
                    <td className="p-3 text-gray-600">{r.billingTeamEmail || '—'}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-center space-x-2">
                      <button
                        onClick={() => {
                          setEditingRegion(r);
                          setForm({
                            regionCode: r.regionCode,
                            name: r.name,
                            regionalManager: r.regionalManager || '',
                            regionalOpsEmail: r.regionalOpsEmail || '',
                            billingTeamEmail: r.billingTeamEmail || '',
                            financeContactEmail: r.financeContactEmail || '',
                          });
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-500 hover:text-gts-900"
                        title="Edit Region"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          const nextStatus = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                          toggleStatusMutation.mutate({ id: r.id, status: nextStatus });
                        }}
                        className="text-[11px] font-medium text-gray-500 hover:text-gts-900 underline"
                      >
                        {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 text-xs">
            <h3 className="text-base font-bold text-gray-900 mb-4">
              {editingRegion ? 'Edit Operating Region' : 'Create New Operating Region'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Region Code *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingRegion}
                  value={form.regionCode}
                  onChange={(e) => setForm({ ...form, regionCode: e.target.value.toUpperCase() })}
                  className="w-full border rounded p-2 uppercase font-mono disabled:bg-gray-100"
                  placeholder="DEL"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Region Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="Delhi"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Regional Ops Email</label>
                <input
                  type="email"
                  value={form.regionalOpsEmail}
                  onChange={(e) => setForm({ ...form, regionalOpsEmail: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="delhi.ops@gts.co.in"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Billing Team Mailbox</label>
                <input
                  type="email"
                  value={form.billingTeamEmail}
                  onChange={(e) => setForm({ ...form, billingTeamEmail: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="delhi.billing@gts.co.in"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-1.5 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800"
                >
                  Save Region
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
