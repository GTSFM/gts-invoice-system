import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatINR, formatDate } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Clock,
  ArrowLeft,
  X,
  CreditCard,
  Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [submitData, setSubmitData] = useState({
    submissionDate: new Date().toISOString().split('T')[0],
    submissionChannel: 'Client Portal',
    submissionReference: '',
  });

  const [ackData, setAckData] = useState({
    acknowledgementDate: new Date().toISOString().split('T')[0],
  });

  const [cancelData, setCancelData] = useState({
    cancellationReason: '',
  });

  // Query invoice details
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoiceDetail', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Mutations
  const submitMutation = useMutation({
    mutationFn: async (payload: any) => await api.patch(`/invoices/${id}/submit`, payload),
    onSuccess: () => {
      toast.success('Invoice marked as Submitted to Client. Due date calculated.');
      setSubmitModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['invoiceDetail', id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Submission failed'),
  });

  const ackMutation = useMutation({
    mutationFn: async (payload: any) => await api.patch(`/invoices/${id}/acknowledge`, payload),
    onSuccess: () => {
      toast.success('Client acknowledgement recorded successfully.');
      setAckModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['invoiceDetail', id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Action failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (payload: any) =>
      await api.patch(`/invoices/${id}/status`, {
        status: 'CANCELLED',
        cancellationReason: payload.cancellationReason,
      }),
    onSuccess: () => {
      toast.success('Invoice cancelled and removed from active receivables.');
      setCancelModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['invoiceDetail', id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Cancellation failed'),
  });

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center text-gray-500">
        Invoice record not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gts-900 font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </button>

        <div className="flex items-center gap-2">
          {invoice.status === 'DRAFT' && (
            <button
              onClick={() => setSubmitModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gts-900 text-white rounded text-xs font-semibold hover:bg-gts-800"
            >
              <Send className="w-4 h-4" /> Record Client Submission
            </button>
          )}

          {invoice.status === 'SUBMITTED_TO_CLIENT' && (
            <button
              onClick={() => setAckModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-xs font-semibold hover:bg-teal-700"
            >
              <CheckCircle2 className="w-4 h-4" /> Record Client Acknowledgement
            </button>
          )}

          {!invoice.isCancelled && invoice.status !== 'PAID' && (
            <button
              onClick={() => setCancelModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-semibold hover:bg-red-100"
            >
              <Ban className="w-4 h-4" /> Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {/* Main Overview Card */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-4 gap-2">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-extrabold text-gray-900">{invoice.invoiceNumber}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {invoice.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Client: <span className="font-semibold text-gray-800">{invoice.client?.name}</span> &bull; Site:{' '}
              <span className="font-semibold text-gray-800">{invoice.site?.name}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-gray-400">Total Tax Invoice Value</span>
            <p className="text-2xl font-extrabold text-gts-900">{formatINR(invoice.totalAmount)}</p>
          </div>
        </div>

        {/* Financial Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b text-xs">
          <div>
            <span className="text-gray-400">Ex-GST Base:</span>
            <p className="font-bold text-gray-900">{formatINR(invoice.amountExGst)}</p>
          </div>
          <div>
            <span className="text-gray-400">GST (18%):</span>
            <p className="font-bold text-gray-900">{formatINR(invoice.gstAmount)}</p>
          </div>
          <div>
            <span className="text-gray-400">Total Received:</span>
            <p className="font-bold text-emerald-600">{formatINR(invoice.totalReceived)}</p>
          </div>
          <div>
            <span className="text-gray-400">Outstanding Balance:</span>
            <p className="font-bold text-red-600">{formatINR(invoice.outstandingAmount)}</p>
          </div>
        </div>

        {/* Dates & SLA Lifecycle */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <span className="text-gray-400">Invoice Date:</span>
            <p className="font-medium text-gray-800">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <div>
            <span className="text-gray-400">Submission Target:</span>
            <p className="font-medium text-gray-800">{formatDate(invoice.submissionTargetDate)}</p>
          </div>
          <div>
            <span className="text-gray-400">Actual Client Submission:</span>
            <p className="font-medium text-indigo-700">
              {invoice.actualSubmissionDate ? formatDate(invoice.actualSubmissionDate) : 'Not Submitted'}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Payment Due Date:</span>
            <p className="font-bold text-gray-900">
              {invoice.dueDate ? formatDate(invoice.dueDate) : 'Due Date Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Receipts & Allocations */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          Receipt Allocations Recorded
        </h3>

        {(invoice.paymentAllocations || []).length === 0 ? (
          <p className="text-xs text-gray-400">No payment receipts have been allocated against this invoice yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="p-2">Receipt Ref / UTR</th>
                <th className="p-2">Allocation Date</th>
                <th className="p-2 text-right">Allocated Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.paymentAllocations.map((alloc: any) => (
                <tr key={alloc.id} className="border-b">
                  <td className="p-2 font-semibold text-gray-800">{alloc.receipt?.receiptReference || alloc.receiptId}</td>
                  <td className="p-2 text-gray-600">{formatDate(alloc.allocationDate)}</td>
                  <td className="p-2 text-right font-bold text-emerald-600">{formatINR(alloc.allocatedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Client Submission */}
      {submitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">Record Client Submission</h3>
            <p className="text-xs text-gray-500 mb-4">
              Recording actual submission will calculate the payment due date based on agreed terms ({invoice.client?.paymentTermsDays || 30} days).
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMutation.mutate(submitData);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-gray-700 font-medium mb-1">Actual Submission Date *</label>
                <input
                  type="date"
                  required
                  value={submitData.submissionDate}
                  onChange={(e) => setSubmitData({ ...submitData, submissionDate: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Submission Channel</label>
                <select
                  value={submitData.submissionChannel}
                  onChange={(e) => setSubmitData({ ...submitData, submissionChannel: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                >
                  <option value="Client Portal">Client Portal</option>
                  <option value="Official Email">Official Email</option>
                  <option value="Physical Hand Delivery">Physical Hand Delivery</option>
                  <option value="Courier / Speed Post">Courier / Speed Post</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Submission Reference / Acknowledgment Slip #</label>
                <input
                  type="text"
                  value={submitData.submissionReference}
                  onChange={(e) => setSubmitData({ ...submitData, submissionReference: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                  placeholder="e.g. PORTAL-TICKET-8921"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="px-4 py-1.5 bg-gts-900 text-white rounded font-semibold hover:bg-gts-800"
                >
                  Confirm Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Client Acknowledgement */}
      {ackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">Record Client Acknowledgement</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ackMutation.mutate(ackData);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-gray-700 font-medium mb-1">Acknowledgement Date *</label>
                <input
                  type="date"
                  required
                  value={ackData.acknowledgementDate}
                  onChange={(e) => setAckData({ ...ackData, acknowledgementDate: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setAckModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ackMutation.isPending}
                  className="px-4 py-1.5 bg-teal-600 text-white rounded font-semibold hover:bg-teal-700"
                >
                  Record Acknowledgement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cancel Invoice */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-red-600 mb-2">Cancel Commercial Invoice</h3>
            <p className="text-xs text-gray-500 mb-4">
              Cancelling removes this invoice from active trade receivables and DSO calculations while permanently retaining audit history.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!cancelData.cancellationReason) {
                  toast.error('Cancellation reason is strictly mandatory');
                  return;
                }
                cancelMutation.mutate(cancelData);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-gray-700 font-medium mb-1">Cancellation Reason *</label>
                <textarea
                  rows={3}
                  required
                  value={cancelData.cancellationReason}
                  onChange={(e) => setCancelData({ ...cancelData, cancellationReason: e.target.value })}
                  className="w-full border border-gray-300 rounded p-2"
                  placeholder="e.g. Revised tax invoice issued with updated PO reference..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Abort
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending}
                  className="px-4 py-1.5 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
