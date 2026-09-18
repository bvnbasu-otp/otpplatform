import React from 'react';
import type { ProcurementContract } from '@otp/domain';

export interface TamperEvidentContractViewerProps {
  contract: ProcurementContract;
  currentUserId?: string;
  isBuyer?: boolean;
  isSupplier?: boolean;
  onSignContract?: (partyType: 'BUYER' | 'SUPPLIER') => Promise<void>;
  className?: string;
}

export function TamperEvidentContractViewer({
  contract,
  currentUserId,
  isBuyer = false,
  isSupplier = false,
  onSignContract,
  className = '',
}: TamperEvidentContractViewerProps) {
  const canBuyerSign = isBuyer && !contract.buyerSignedAt && contract.status.includes('BUYER');
  const canSupplierSign = isSupplier && !contract.supplierSignedAt && contract.status.includes('SUPPLIER');

  return (
    <div
      data-testid="tamper-evident-contract-viewer"
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Procurement Contract: {contract.contractNumber}
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
              {contract.status}
            </span>
          </div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
            SHA-256 Hash: {contract.documentHash}
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 max-h-72 overflow-y-auto">
        <pre className="text-xs font-sans whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed">
          {contract.contractBodyMarkdown}
        </pre>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <span className="block font-semibold text-slate-900 dark:text-slate-100">
            Buyer Sign-Off
          </span>
          {contract.buyerSignedAt ? (
            <div className="mt-1 text-emerald-600 dark:text-emerald-400">
              ✓ Signed on {new Date(contract.buyerSignedAt).toLocaleDateString()}
              <span className="block text-[10px] font-mono text-slate-500 truncate mt-0.5">
                Sig: {contract.buyerSignatureHash}
              </span>
            </div>
          ) : (
            <div className="mt-2">
              <span className="text-amber-600 dark:text-amber-400 block mb-2">Pending Execution</span>
              {canBuyerSign && (
                <button
                  type="button"
                  onClick={() => onSignContract?.('BUYER')}
                  className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Sign as Buyer
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <span className="block font-semibold text-slate-900 dark:text-slate-100">
            Supplier Sign-Off
          </span>
          {contract.supplierSignedAt ? (
            <div className="mt-1 text-emerald-600 dark:text-emerald-400">
              ✓ Signed on {new Date(contract.supplierSignedAt).toLocaleDateString()}
              <span className="block text-[10px] font-mono text-slate-500 truncate mt-0.5">
                Sig: {contract.supplierSignatureHash}
              </span>
            </div>
          ) : (
            <div className="mt-2">
              <span className="text-amber-600 dark:text-amber-400 block mb-2">Pending Execution</span>
              {canSupplierSign && (
                <button
                  type="button"
                  onClick={() => onSignContract?.('SUPPLIER')}
                  className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Sign as Supplier
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
