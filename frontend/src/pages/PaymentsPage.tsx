import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { formatINR, formatDate } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { CreditCard, Plus, CheckCircle2, AlertCircle, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'RECEIPTS' | 'OUTSTANDING' | 'AGEING'>('OUTSTANDING');

  // Modal State
  const [createReceiptOpen, setCreateReceiptOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  // Form State
  const [receiptForm, setReceiptForm] = useState({
    receiptReference: '',
    receiptDate: new Date().toISOString().split('T')[0],
    amountReceived: '',
    bankReference: '',
    utrNumber: '',
    paymentMode: 'NEFT',
    clientId: '',
    remarks: '',
  });

  const [allocations, setAllocations] = useState<{ invoiceId: string; amount: string }[]>([]);

  // 1. Fetch Receipts
  const { data: receiptsRes, isLoading: receiptsLoading } = useQuery({
    queryKey: ['paymentReceipts'],
    queryFn: async () => (await api.get('/payments')).data,
    enabled: activeTab === 'RECEIPTS',
  });

  // 2. Fetch Outstanding Receivables
  const { data: outstandingRes, isLoading: outstandingLoading } = useQuery({
    queryKey: ['outstandingReceivables'],
    queryFn: async () => (await api.get('/payments/outstanding')).data,
    enabled: activeTab === 'OUTSTANDING' || allocateModalOpen,
  });

  // 3. Fetch Ageing Summary
  const { data: ageingRes, isLoading: ageingLoading } = useQuery({
    queryKey: ['ageingSummary'],
    queryFn: async () => (await api.get('/payments/ageing-summary')).data,
    enabled: activeTab === 'AGEING',
  });

  const { data: clients } = useQuery({
    queryKey: ['clientsList'],
    queryFn: async () => (await api.get('/clients')).data.data || [],
  });

  // Mutations
  const createReceiptMutation = useMutation({
    mutationFn: async (payload: any) => await api.post('/payments', payload),
    onSuccess: () => {
      toast.success('Payment receipt recorded successfully');
      setCreateReceiptOpen(false);
      queryClient.invalidateQueries({ queryKey: ['paymentReceipts'] });
      setActiveTab('RECEIPTS');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to record receipt'),
  });

  const allocateMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => await api.post(`/payments/${id}/allocate`, payload),
    onSuccess: () => {
      toast.success('Receipt allocated to invoices within transaction');
      setAllocateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['paymentReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['outstandingReceivables'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Allocation failed'),
  });

  const handleCreateReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    createReceiptMutation.mutate({
      ...receiptForm,
      amountReceived: parseFloat(receiptForm.amountReceived) || 0,
    });
  };

  const handleAllocateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validAllocations = allocations
      .filter((a) => parseFloat(a.amount) > 0)
      .map((a) => ({ invoiceId: a.invoiceId, amount: parseFloat(a.amount) }));

    if (validAllocations.length === 0) {
      toast.error('Enter at least one allocation amount');
      return;
    }

    allocateMutation.mutate({
      id: selectedReceipt.id,
      payload: { allocations: validAllocations },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gts-900" />
            Payment Receipts & Trade Receivables
          </h2>
          <p className="text-xs text-gray-500">
            Multi-invoice receipt allocation, transaction consistency, and age-categorized collections tracking.
          </p>
        </div>

        <button
          onClick={() => setCreateReceiptOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gts-900 text-white text-xs font-semibold rounded shadow-sm hover:bg-gts-800"
        >
          <Plus className="w-4 h-4" /> Record Payment Receipt
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 text-xs">
        {[
          { key: 'OUTSTANDING', label: 'Outstanding Receivables' },
          { key: 'RECEIPTS', label: 'Receipts Register' },
          { key: 'AGEING', label: 'Ageing Buckets Breakdown' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`pb-2 px-3 font-semibold transition border-b-2 ${
              activeTab === tab.key
                ? 'border-gts-900 text-gts-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Outstanding Receivables Tab */}
      {activeTab === 'OUTSTANDING' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {outstandingLoading ? (
            <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Client & Site</th>
                    <th className="p-3 text-right">Invoice Total</th>
                    <th className="p-3 text-right">Received</th>
                    <th className="p-3 text-right">Outstanding</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-center">Overdue Days</th>
                    <th className="p-3 text-center">Ageing Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(outstandingRes?.data || []).map((inv: any) => (
                    <tr key={inv.invoiceId || inv.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{inv.invoiceNumber}</td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-800">{inv.clientName}</div>
                        <div className="text-gray-400 text-[10px]">{inv.siteName}</div>
                      </td>
                      <td className="p-3 text-right font-bold text-gray-900">{formatINR(inv.totalAmount)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600">{formatINR(inv.totalReceived)}</td>
                      <td className="p-3 text-right font-extrabold text-red-600">{formatINR(inv.outstandingAmount)}</td>
                      <td className="p-3 text-gray-600">{inv.dueDate ? formatDate(inv.dueDate) : 'Pending'}</td>
                      <td className="p-3 text-center font-bold">
                        {inv.daysOverdue > 0 ? (
                          <span className="text-red-600">+{inv.daysOverdue}d</span>
                        ) : (
                          <span className="text-emerald-600">Not Due</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                          {inv.agingBucket || 'CURRENT'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. Receipts Register Tab */}
      {activeTab === 'RECEIPTS' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {receiptsLoading ? (
            <div className="py-20 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-600 font-semibold uppercase">
                    <th className="p-3">Receipt Ref #</th>
                    <th className="p-3">Receipt Date</th>
                    <th className="p-3">Bank UTR / Ref</th>
                    <th className="p-3 text-right">Amount Received</th>
                    <th className="p-3 text-right">Unallocated Amount</th>
                    <th className="p-3 text-center">Allocations</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(receiptsRes?.data || []).map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{r.receiptReference}</td>
                      <td className="p-3 text-gray-600">{formatDate(r.receiptDate)}</td>
                      <td className="p-3 text-gray-500 font-mono">{r.utrNumber || r.bankReference || '—'}</td>
                      <td className="p-3 text-right font-bold text-gray-900">{formatINR(r.amountReceived)}</td>
                      <td className="p-3 text-right font-extrabold text-amber-600">{formatINR(r.unallocatedAmount)}</td>
                      <td className="p-3 text-center text-gray-600 font-medium">
                        {r.allocations?.length || 0} invoice(s)
                      </td>
                      <td className="p-3 text-center">
                        {parseFloat(r.unallocatedAmount) > 0 && (
                          <button
                            onClick={() => {
                              setSelectedReceipt(r);
                              setAllocations([]);
                              setAllocateModalOpen(true);
                            }}
                            className="px-2 py-1 bg-gts-900 text-white rounded text-[11px] font-semibold hover:bg-gts-800"
                          >
                            Allocate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Ageing Breakdown Tab */}
      {activeTab === 'AGEING' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Contractual Due Date Ageing Tiers</h3>
            <div className="space-y-3 text-xs">
              {(ageingRes?.data || []).map((tier: any) => (
                <div key={tier.bucket} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <span className="font-semibold text-gray-800">{tier.bucket.replace(/_/g, ' ')}</span>
                    <p className="text-[10px] text-gray-400">{tier.count} open invoices</p>
                  </div>
                  <span className="font-extrabold text-gray-900 text-sm">{formatINR(tier.totalOutstanding)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Payment Receipt */}
      {createReceiptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Record Payment Receipt</h3>
            <form onSubmit={handleCreateReceipt} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Receipt Reference *</label>
                  <input
                    type="text"
                    required
                    value={receiptForm.receiptReference}
                    onChange={(e) => setReceiptForm({ ...receiptForm, receiptReference: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="REC-2025-001"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Receipt Date *</label>
                  <input
                    type="date"
                    required
                    value={receiptForm.receiptDate}
                    onChange={(e) => setReceiptForm({ ...receiptForm, receiptDate: e.target.value })}
                    className="w-full border rounded p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Amount Received (INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={receiptForm.amountReceived}
                    onChange={(e) => setReceiptForm({ ...receiptForm, amountReceived: e.target.value })}
                    className="w-full border rounded p-2 font-mono font-bold"
                    placeholder="500000.00"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Bank UTR Number</label>
                  <input
                    type="text"
                    value={receiptForm.utrNumber}
                    onChange={(e) => setReceiptForm({ ...receiptForm, utrNumber: e.target.value })}
                    className="w-full border rounded p-2 font-mono"
                    placeholder="HDFC00012398"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setCreateReceiptOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createReceiptMutation.isPending}
                  className="px-4 py-1.5 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800"
                >
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Allocate Receipt to Invoices */}
      {allocateModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[85vh] flex flex-col">
            <h3 className="text-base font-bold text-gray-900 mb-1">Allocate Receipt to Outstanding Invoices</h3>
            <p className="text-xs text-gray-500 mb-4">
              Receipt #{selectedReceipt.receiptReference} &bull; Available Balance:{' '}
              <span className="font-bold text-emerald-600">{formatINR(selectedReceipt.unallocatedAmount)}</span>
            </p>

            <form onSubmit={handleAllocateSubmit} className="flex-1 overflow-y-auto space-y-3 text-xs">
              <div className="divide-y border rounded">
                {(outstandingRes?.data || []).map((inv: any) => {
                  const currentAlloc = allocations.find((a) => a.invoiceId === inv.invoiceId)?.amount || '';
                  return (
                    <div key={inv.invoiceId} className="p-3 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <span className="font-bold text-gray-900">{inv.invoiceNumber}</span>
                        <div className="text-[10px] text-gray-500">{inv.clientName} &bull; {inv.siteName}</div>
                        <div className="text-[10px] text-red-600 font-semibold">
                          Outstanding: {formatINR(inv.outstandingAmount)}
                        </div>
                      </div>

                      <div className="w-36">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Amount ₹"
                          value={currentAlloc}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAllocations((prev) => {
                              const filtered = prev.filter((a) => a.invoiceId !== inv.invoiceId);
                              return val ? [...filtered, { invoiceId: inv.invoiceId, amount: val }] : filtered;
                            });
                          }}
                          className="w-full border rounded p-1.5 font-mono text-right"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setAllocateModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocateMutation.isPending}
                  className="px-4 py-1.5 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800"
                >
                  Execute Transaction Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
