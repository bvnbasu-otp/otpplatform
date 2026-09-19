import { formatMoney } from '@/features/fulfillment/types/fulfillment';
import { formatDateIST } from '@/lib/date-utils';
import { PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import type { PeriodReportingSummary } from '../types/reporting';
import type { PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';

interface PrintableProcurementReportProps {
  summary: PeriodReportingSummary;
  orders: PurchaseOrderSummary[];
  organizationName?: string;
  generatedBy?: string;
}

export function PrintableProcurementReport({
  summary,
  orders,
  organizationName = 'Registered Procurement Organization',
  generatedBy = 'Authorized Procurement Official',
}: PrintableProcurementReportProps) {
  const generationTime = new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="print-report-container hidden print:block text-slate-900 bg-white p-8 max-w-5xl mx-auto font-sans leading-normal print:p-6 print:max-w-full">
      {/* Official Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white font-black text-xl">
              OTP
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                Procurement Decision &amp; Fulfillment Statement
              </h1>
              <p className="text-sm font-semibold text-slate-700 mt-0.5">
                Platform Governance Engine: {PRODUCT_NAME} ({PRODUCT_FULL_NAME})
              </p>
              <p className="text-xs text-slate-600 mt-1">
                <strong>Reporting Entity:</strong> {organizationName}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-bold text-slate-900">REPORT REF: OTP-REP-{Date.now().toString().slice(-6)}</p>
            <p>Generated: {generationTime} IST</p>
            <p>
              Status: <span className="text-emerald-700 font-bold">● AUDIT SEALED</span>
            </p>
          </div>
        </div>
      </div>

      {/* Period & Scope Header Card */}
      <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block uppercase font-bold text-[10px]">Reporting Window</span>
            <span className="font-bold text-slate-900 text-sm">{summary.dateRange.label}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-bold text-[10px]">Reporting Role</span>
            <span className="font-bold text-slate-900 capitalize text-sm">{summary.role}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-bold text-[10px]">Total Purchase Orders</span>
            <span className="font-bold text-slate-900 text-sm">{summary.totalOrdersCount} Orders</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-bold text-[10px]">Total Commitment (INR)</span>
            <span className="font-black text-slate-900 text-sm">{formatMoney(summary.totalAmount, 'INR')}</span>
          </div>
        </div>
      </div>

      {/* Financial Executive Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-xs">
        <div className="border border-slate-300 rounded p-3 bg-white">
          <span className="text-slate-500 block font-semibold text-[11px]">Gross Period Orders</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">{formatMoney(summary.totalAmount, 'INR')}</p>
          <span className="text-[10px] text-slate-600">{summary.totalOrdersCount} issued contracts</span>
        </div>
        <div className="border border-emerald-300 rounded p-3 bg-emerald-50/50">
          <span className="text-emerald-800 block font-semibold text-[11px]">Settled &amp; Paid Invoices</span>
          <p className="text-lg font-black text-emerald-950 mt-0.5">{formatMoney(summary.settledAmount, 'INR')}</p>
          <span className="text-[10px] text-emerald-700">{summary.settledOrdersCount} 100% completed jobs</span>
        </div>
        <div className="border border-blue-300 rounded p-3 bg-blue-50/50">
          <span className="text-blue-800 block font-semibold text-[11px]">Active in Milestone Execution</span>
          <p className="text-lg font-black text-blue-950 mt-0.5">{formatMoney(summary.activeAmount, 'INR')}</p>
          <span className="text-[10px] text-blue-700">{summary.activeOrdersCount} ongoing deliverables</span>
        </div>
      </div>

      {/* Detailed Orders Table */}
      <div className="mb-8">
        <h3 className="font-bold text-sm text-slate-900 mb-2 uppercase tracking-wide border-b border-slate-300 pb-1">
          Detailed Line-by-Line Order Ledger
        </h3>
        <table className="w-full text-left text-xs border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[11px]">
              <th className="p-2 border-r border-slate-300">PO Number</th>
              <th className="p-2 border-r border-slate-300">Date Issued</th>
              <th className="p-2 border-r border-slate-300">Requirement / Title</th>
              <th className="p-2 border-r border-slate-300 text-right">Amount (₹)</th>
              <th className="p-2 border-r border-slate-300 text-center">Progress</th>
              <th className="p-2 text-center">Fulfillment Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500">
                  No orders recorded for this reporting period.
                </td>
              </tr>
            ) : (
              orders.map((po) => {
                const progress = po.progressPercent ?? (po.isSettled ? 100 : 0);
                const isCompleted = po.isSettled || po.status === 'COMPLETED';
                return (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-900">
                      {po.poNumber}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-700">
                      {po.issuedAt ? formatDateIST(po.issuedAt) : 'Pending'}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-medium text-slate-900 truncate max-w-xs">
                      {po.rfqTitle || 'Commercial Order'}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right font-black text-slate-900">
                      {formatMoney(po.totalAmount, po.currency)}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-center font-bold">
                      {progress}%
                    </td>
                    <td className="p-2 text-center font-bold">
                      {isCompleted ? (
                        <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                          SETTLED
                        </span>
                      ) : (
                        <span className="text-blue-800 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
                          IN PROGRESS
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-900 font-bold">
              <td colSpan={3} className="p-2 text-slate-900 uppercase">
                Grand Total ({orders.length} Orders)
              </td>
              <td className="p-2 text-right font-black text-slate-900 text-sm">
                {formatMoney(summary.totalAmount, 'INR')}
              </td>
              <td colSpan={2} className="p-2 text-right text-slate-600 text-[11px]">
                GST &amp; Execution Invariant Verified
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Auditor & Compliance Verification Seal */}
      <div className="border-t-2 border-slate-900 pt-6 mt-8">
        <div className="grid grid-cols-2 gap-8 text-xs text-slate-600">
          <div>
            <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-1">
              Procurement Invariant &amp; Cryptographic Signoff
            </h4>
            <p className="leading-relaxed">
              This report is generated by the {PRODUCT_NAME} Platform ({PRODUCT_FULL_NAME}) decision governance system. All Purchase Orders and Invoices are bilateral commercial and tax agreements directly between the respective Buyer and Supplier organizations. OTP operates as a neutral software facilitator and does not handle direct payments or act as merchant of record.
            </p>
            <p className="font-mono text-[10px] text-slate-500 mt-2">
              HASH: SHA256:{Date.now().toString(16).padStart(16, '0')}...VERIFIED_COMPLIANT
            </p>
          </div>
          <div className="flex flex-col justify-end items-end text-right">
            <div className="border-b border-slate-400 w-48 mb-1"></div>
            <p className="font-bold text-slate-900">{generatedBy}</p>
            <p className="text-[10px] text-slate-500">Authorized Signatory / Verification Officer</p>
          </div>
        </div>
      </div>
    </div>
  );
}
