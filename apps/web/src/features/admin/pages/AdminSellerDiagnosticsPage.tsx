import React from 'react';
import { AdminSellerTroubleshooter } from '../components/AdminSellerTroubleshooter';

export function AdminSellerDiagnosticsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground max-w-7xl mx-auto w-full p-3 pb-36 overflow-x-hidden">
      <div className="w-full">
        <AdminSellerTroubleshooter onRefreshTelemetry={() => {}} />
      </div>
    </div>
  );
}
