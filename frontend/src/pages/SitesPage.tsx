import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { MapPin, Plus, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SitesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);

  const [form, setForm] = useState({
    siteCode: '',
    name: '',
    clientId: '',
    regionId: '',
    city: '',
    state: '',
    billingContactName: '',
    billingContactEmail: '',
  });

  const { data: sitesRes, isLoading } = useQuery({
    queryKey: ['sitesListDetailed'],
    queryFn: async () => (await api.get('/sites')).data,
  });

  const { data: clients } = useQuery({
    queryKey: ['clientsList'],
    queryFn: async () => (await api.get('/clients')).data.data || [],
  });

  const { data: regions } = useQuery({
    queryKey: ['regionsList'],
    queryFn: async () => (await api.get('/regions')).data.data || [],
  });

  const sites = sitesRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/sites', payload),
    onSuccess: () => {
      toast.success('Operating site created successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['sitesListDetailed'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create site'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => await api.put(`/sites/${id}`, payload),
    onSuccess: () => {
      toast.success('Site record updated');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['sitesListDetailed'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update site'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSite) {
      updateMutation.mutate({ id: editingSite.id, payload: form });
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
            Operating Sites & Facility Master
          </h2>
          <p className="text-xs text-gray-500">
            Physical facilities linked to corporate clients and geographical operating regions.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingSite(null);
            setForm({
              siteCode: '',
              name: '',
              clientId: '',
              regionId: '',
              city: '',
              state: '',
              billingContactName: '',
              billingContactEmail: '',
            });
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800"
        >
          <Plus className="w-4 h-4" /> Add Operating Site
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
                  <th className="p-3">Site Code</th>
                  <th className="p-3">Site Name</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Operating Region</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sites.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-3 font-mono font-bold text-gray-900">{s.siteCode}</td>
                    <td className="p-3 font-semibold text-gray-800">{s.name}</td>
                    <td className="p-3 text-gray-700">{s.client?.name}</td>
                    <td className="p-3 text-gray-600 font-medium">{s.region?.name}</td>
                    <td className="p-3 text-gray-500">{s.city ? `${s.city}, ${s.state || ''}` : 'State-wide'}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setEditingSite(s);
                          setForm({
                            siteCode: s.siteCode,
                            name: s.name,
                            clientId: s.clientId,
                            regionId: s.regionId,
                            city: s.city || '',
                            state: s.state || '',
                            billingContactName: s.billingContactName || '',
                            billingContactEmail: s.billingContactEmail || '',
                          });
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-500 hover:text-gts-900"
                        title="Edit Site"
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
              {editingSite ? 'Edit Facility Record' : 'Create Operating Site'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Site Code *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingSite}
                    value={form.siteCode}
                    onChange={(e) => setForm({ ...form, siteCode: e.target.value.toUpperCase() })}
                    className="w-full border rounded p-2 uppercase font-mono disabled:bg-gray-100"
                    placeholder="CHN-FAC-01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Site Facility Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="Chennai Production Plant 1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Client Entity *</label>
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                    className="w-full border rounded p-2"
                  >
                    <option value="">-- Choose Client --</option>
                    {(clients || []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Region *</label>
                  <select
                    required
                    value={form.regionId}
                    onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                    className="w-full border rounded p-2"
                  >
                    <option value="">-- Choose Region --</option>
                    {(regions || []).map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="Sriperumbudur"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="Tamil Nadu"
                  />
                </div>
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
                  Save Facility Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
