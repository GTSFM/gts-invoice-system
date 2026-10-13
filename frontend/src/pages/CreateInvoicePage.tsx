import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatINR } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { FilePlus, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    regionId: '',
    siteId: '',
    billingMonth: '',
    financialYear: '2025-26',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    amountExGst: '',
    gstAmount: '',
    submissionTargetDate: '',
    remarks: '',
  });

  // Queries for masters
  const { data: clients } = useQuery({
    queryKey: ['clientsList'],
    queryFn: async () => (await api.get('/clients')).data.data || [],
  });

  const { data: regions } = useQuery({
    queryKey: ['regionsList'],
    queryFn: async () => (await api.get('/regions')).data.data || [],
  });

  const { data: sites } = useQuery({
    queryKey: ['sitesList', formData.clientId, formData.regionId],
    queryFn: async () => {
      const res = await api.get('/sites', {
        params: {
          ...(formData.clientId && { clientId: formData.clientId }),
          ...(formData.regionId && { regionId: formData.regionId }),
        },
      });
      return res.data.data || [];
    },
  });

  // Check linked projection
  const { data: projectionInfo } = useQuery({
    queryKey: ['siteProjection', formData.siteId, formData.billingMonth],
    queryFn: async () => {
      if (!formData.siteId || !formData.billingMonth) return null;
      const res = await api.get('/projections', {
        params: { siteId: formData.siteId, billingMonth: formData.billingMonth },
      });
      return res.data?.data?.[0] || null;
    },
    enabled: !!formData.siteId && !!formData.billingMonth,
  });

  // Invoice creation mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/invoices', payload),
    onSuccess: (res) => {
      toast.success('Invoice drafted successfully');
      navigate(`/invoices/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to prepare invoice');
    },
  });

  const handleAmountChange = (val: string) => {
    const amt = parseFloat(val) || 0;
    const gst = (amt * 0.18).toFixed(2);
    setFormData({
      ...formData,
      amountExGst: val,
      gstAmount: gst,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      amountExGst: parseFloat(formData.amountExGst) || 0,
      gstAmount: parseFloat(formData.gstAmount) || 0,
    });
  };

  const actualAmt = parseFloat(formData.amountExGst) || 0;
  const projAmt = projectionInfo ? parseFloat(projectionInfo.projectedAmountExGst) : 0;
  const variance = actualAmt - projAmt;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FilePlus className="w-5 h-5 text-gts-900" />
          Prepare New Commercial Invoice
        </h2>
        <p className="text-xs text-gray-500">
          Guided commercial workflow validating projections, contractual entities, and submission targets.
        </p>
      </div>

      {/* Progress Wizard */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 text-xs">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-gts-900 font-bold' : 'text-gray-400'}`}>
          <span className="w-6 h-6 rounded-full bg-gts-100 flex items-center justify-center font-bold">1</span>
          Commercial Entity
        </div>
        <div className="h-0.5 w-12 bg-gray-200" />
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-gts-900 font-bold' : 'text-gray-400'}`}>
          <span className="w-6 h-6 rounded-full bg-gts-100 flex items-center justify-center font-bold">2</span>
          Billing & Variance
        </div>
        <div className="h-0.5 w-12 bg-gray-200" />
        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-gts-900 font-bold' : 'text-gray-400'}`}>
          <span className="w-6 h-6 rounded-full bg-gts-100 flex items-center justify-center font-bold">3</span>
          Submission Target
        </div>
      </div>

      {/* Form Wizard Body */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6 text-xs">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 border-b pb-2">Step 1: Select Client, Region & Operating Site</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Client Entity *</label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                >
                  <option value="">-- Choose Client --</option>
                  {(clients || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} {c.isDemo ? '(DEMO)' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Region *</label>
                <select
                  required
                  value={formData.regionId}
                  onChange={(e) => setFormData({ ...formData, regionId: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                >
                  <option value="">-- Choose Region --</option>
                  {(regions || []).map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">Operating Facility / Site *</label>
              <select
                required
                value={formData.siteId}
                onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                className="w-full border border-gray-300 rounded p-2"
              >
                <option value="">-- Choose Site --</option>
                {(sites || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.siteCode}) &bull; {s.city || 'State-wide'}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Billing Month *</label>
                <input
                  type="month"
                  required
                  value={formData.billingMonth}
                  onChange={(e) => setFormData({ ...formData, billingMonth: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Financial Year *</label>
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

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!formData.clientId || !formData.siteId || !formData.billingMonth}
                className="flex items-center gap-1.5 px-4 py-2 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800 disabled:opacity-40"
              >
                Continue to Billing Details
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 border-b pb-2">Step 2: Commercial Values & Projection Comparison</h3>

            {/* Projection Variance Banner */}
            <div className="p-3 bg-purple-50 rounded border border-purple-100 flex items-center justify-between">
              <div>
                <span className="text-gray-600">Fixed Site Projection for {formData.billingMonth}:</span>
                <p className="text-base font-extrabold text-gts-900">
                  {projectionInfo ? formatINR(projectionInfo.projectedAmountExGst) : 'No Projection Logged'}
                </p>
              </div>

              {projectionInfo && actualAmt > 0 && (
                <div className="text-right">
                  <span className="text-gray-500 text-[10px]">Variance vs Projection:</span>
                  <p className={`font-extrabold text-sm ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                    {formatINR(variance)} ({projAmt > 0 ? `${((variance / projAmt) * 100).toFixed(1)}%` : 'N/A'})
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Tax Invoice Number *</label>
                <input
                  type="text"
                  required
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2 font-mono uppercase"
                  placeholder="GTS/2025-26/001"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Invoice Date *</label>
                <input
                  type="date"
                  required
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Amount Excluding GST (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.amountExGst}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 font-mono font-bold"
                  placeholder="450000.00"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">GST Amount (18% auto-computed) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.gstAmount}
                  onChange={(e) => setFormData({ ...formData, gstAmount: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!formData.invoiceNumber || !formData.amountExGst}
                className="flex items-center gap-1.5 px-4 py-2 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800 disabled:opacity-40"
              >
                Continue to Targets <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 border-b pb-2">Step 3: Submission Target & Review</h3>

            <div>
              <label className="block text-gray-700 font-medium mb-1">Client Submission Target Date</label>
              <input
                type="date"
                value={formData.submissionTargetDate}
                onChange={(e) => setFormData({ ...formData, submissionTargetDate: e.target.value })}
                className="w-full border border-gray-300 rounded p-2"
              />
              <span className="text-[10px] text-gray-400">Used for SLA compliance tracking. Can be overridden later.</span>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">Commercial Remarks / Scope Notes</label>
              <textarea
                rows={3}
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="w-full border border-gray-300 rounded p-2"
                placeholder="Explanations for variance against projection, extra billing, or documentation remarks."
              />
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 px-6 py-2 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {createMutation.isPending ? 'Drafting...' : 'Create Commercial Invoice'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
