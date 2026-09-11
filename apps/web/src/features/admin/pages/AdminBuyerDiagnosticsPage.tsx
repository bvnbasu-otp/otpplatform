import React, { useState, useEffect } from 'react';
import { fetchLiveTransactions } from '../api/admin-ops';
import { AdminBuyerTroubleshooter } from '../components/AdminBuyerTroubleshooter';
import type { LiveTransactionItem } from '../types/admin';

export function AdminBuyerDiagnosticsPage() {
  const [transactions, setTransactions] = useState<LiveTransactionItem[]>([]);

  const loadTx = async () => {
    const res = await fetchLiveTransactions({ limit: 100 });
    if (res.ok) setTransactions(res.transactions);
  };

  useEffect(() => {
    void loadTx();
  }, []);

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full">
      <div className="zero-scroll-pane">
        <AdminBuyerTroubleshooter
          transactions={transactions}
          onRefreshTelemetry={loadTx}
        />
      </div>
    </div>
  );
}
