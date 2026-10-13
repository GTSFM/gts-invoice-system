import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Settings, Save, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [val, setVal] = useState('');

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['systemSettingsList'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  const settings = settingsRes?.data || [];

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: any) => await api.put(`/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success('System configuration updated with audit log');
      setEditingKey(null);
      queryClient.invalidateQueries({ queryKey: ['systemSettingsList'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update setting'),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-gts-900" />
          System Parameters & Configuration
        </h2>
        <p className="text-xs text-gray-500">
          Organization defaults, variance tolerance percentage, submission SLA thresholds, and DSO policies.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                <th className="p-3">Parameter Key</th>
                <th className="p-3">Description</th>
                <th className="p-3">Configured Value</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settings.map((s: any) => (
                <tr key={s.id || s.key} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold text-gray-900">{s.key}</td>
                  <td className="p-3 text-gray-600 max-w-sm">{s.description || 'System configuration parameter'}</td>
                  <td className="p-3 font-mono">
                    {editingKey === s.key ? (
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        className="border rounded px-2 py-1 text-xs w-full"
                      />
                    ) : (
                      <span className="font-semibold text-gts-900">{s.value}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {editingKey === s.key ? (
                      <div className="space-x-1">
                        <button
                          onClick={() => updateMutation.mutate({ key: s.key, value: val })}
                          className="px-2 py-1 bg-gts-900 text-white rounded font-semibold text-[11px]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="px-2 py-1 border rounded text-[11px] text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingKey(s.key);
                          setVal(s.value);
                        }}
                        className="text-gts-900 font-medium underline hover:text-gts-700 text-[11px]"
                      >
                        Modify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
