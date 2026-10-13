import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Building2, Plus, Edit2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  const [form, setForm] = useState({
    clientCode: '',
    name: '',
    billingAddress: '',
    gstin: '',
    billingContactName: '',
    billingContactEmail: '',
    paymentTermsDays: 30,
    paymentTermsTrigger: 'SUBMISSION_DATE',
    remarks: '',
  });

  const { data: clientsRes, isLoading } = useQuery({
    queryKey: ['clientsListFull'],
    queryFn: async () => (await api.get('/clients')).data,
  });

  const clients = clientsRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/clients', payload),
    onSuccess: () => {
      toast.success('Client created successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['clientsListFull'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save client'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => await api.put(`/clients/${id}`, payload),
    onSuccess: () => {
      toast.success('Client updated successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['clientsListFull'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update client'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gts-900" />
            Client Master Register
          </h2>
          <p className="text-xs text-gray-500">
            Corporate client accounts, contractual payment terms, and billing entity definitions.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingClient(null);
            setForm({
              clientCode: '',
              name: '',
              billingAddress: '',
              gstin: '',
              billingContactName: '',
              billingContactEmail: '',
              paymentTermsDays: 30,
              paymentTermsTrigger: 'SUBMISSION_DATE',
              remarks: '',
            });
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800"
        >
          <Plus className="w-4 h-4" /> Add Client
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
                  <th className="p-3">Client Code</th>
                  <th className="p-3">Client Name</th>
                  <th className="p-3">GSTIN</th>
                  <th className="p-3">Agreed Payment Terms</th>
                  <th className="p-3">Trigger Clock</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="p-3 font-mono font-bold text-gray-900 flex items-center gap-1.5">
                      {c.clientCode}
                      {c.isDemo && (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-semibold text-[9px]">
                          DEMO DATA
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-gray-800">{c.name}</td>
                    <td className="p-3 font-mono text-gray-600">{c.gstin || '—'}</td>
                    <td className="p-3 font-medium text-gray-900">{c.paymentTermsDays} Calendar Days</td>
                    <td className="p-3 text-gray-600 font-mono text-[11px]">{c.paymentTermsTrigger}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setEditingClient(c);
                          setForm({
                            clientCode: c.clientCode,
                            name: c.name,
                            billingAddress: c.billingAddress || '',
                            gstin: c.gstin || '',
                            billingContactName: c.billingContactName || '',
                            billingContactEmail: c.billingContactEmail || '',
                            paymentTermsDays: c.paymentTermsDays || 30,
                            paymentTermsTrigger: c.paymentTermsTrigger || 'SUBMISSION_DATE',
                            remarks: c.remarks || '',
                          });
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-500 hover:text-gts-900"
                        title="Edit Client"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
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
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 text-xs">
            <h3 className="text-base font-bold text-gray-900 mb-4">
              {editingClient ? 'Edit Client Record' : 'Create New Client Account'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Client Code *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingClient}
                    value={form.clientCode}
                    onChange={(e) => setForm({ ...form, clientCode: e.target.value.toUpperCase() })}
                    className="w-full border rounded p-2 uppercase font-mono disabled:bg-gray-100"
                    placeholder="HYU-MAT"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="Hyundai Materials"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                    className="w-full border rounded p-2 font-mono uppercase"
                    placeholder="33AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Payment Terms (Days) *</label>
                  <input
                    type="number"
                    required
                    value={form.paymentTermsDays}
                    onChange={(e) => setForm({ ...form, paymentTermsDays: parseInt(e.target.value, 10) || 30 })}
                    className="w-full border rounded p-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Payment Clock Trigger *</label>
                <select
                  value={form.paymentTermsTrigger}
                  onChange={(e) => setForm({ ...form, paymentTermsTrigger: e.target.value })}
                  className="w-full border rounded p-2"
                >
                  <option value="SUBMISSION_DATE">Actual Client Submission Date (Recommended)</option>
                  <option value="INVOICE_DATE">Invoice Generation Date</option>
                  <option value="ACKNOWLEDGEMENT_DATE">Client Formal Acknowledgement Date</option>
                </select>
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
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
