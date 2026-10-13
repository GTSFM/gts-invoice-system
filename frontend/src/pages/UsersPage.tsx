import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Users, Plus, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CENTRAL_BILLING',
    department: 'Commercial Billing',
    designation: 'Billing Executive',
  });

  const { data: usersRes, isLoading } = useQuery({
    queryKey: ['usersList'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const users = usersRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/users', payload),
    onSuccess: () => {
      toast.success('User registered successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['usersList'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create user'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-gts-900" />
            User & Role Management
          </h2>
          <p className="text-xs text-gray-500">
            RBAC permission management across Central Billing, Regional Ops, Finance, and Management.
          </p>
        </div>

        <button
          onClick={() => {
            setForm({
              name: '',
              email: '',
              password: '',
              role: 'CENTRAL_BILLING',
              department: 'Commercial Billing',
              designation: 'Billing Executive',
            });
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800"
        >
          <Plus className="w-4 h-4" /> Add User
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
                  <th className="p-3">Name</th>
                  <th className="p-3">Official Email</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-gray-900">{u.name}</td>
                    <td className="p-3 text-gray-600">{u.email}</td>
                    <td className="p-3 text-gray-500">{u.department || 'Operations'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-gts-900">
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        {u.accountStatus}
                      </span>
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
            <h3 className="text-base font-bold text-gray-900 mb-4">Register New System User</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="Priya Raman"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Official Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="priya.raman@gts.co.in"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Initial Password *</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Assigned Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border rounded p-2"
                >
                  <option value="CENTRAL_BILLING">Central Billing Team</option>
                  <option value="REGIONAL_OPERATIONS">Regional Operations Team</option>
                  <option value="FINANCE_COLLECTIONS">Finance / Collections Team</option>
                  <option value="MANAGEMENT">Management (Consolidated Read-Only)</option>
                  <option value="SUPER_ADMIN">Super Administrator</option>
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
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
