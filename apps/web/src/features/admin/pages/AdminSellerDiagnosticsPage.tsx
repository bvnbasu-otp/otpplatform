import React from 'react';
import { AdminSellerTroubleshooter } from '../components/AdminSellerTroubleshooter';

export function AdminSellerDiagnosticsPage() {
  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full">
      <div className="zero-scroll-pane">
        <AdminSellerTroubleshooter onRefreshTelemetry={() => {}} />
      </div>
    </div>
  );
}
