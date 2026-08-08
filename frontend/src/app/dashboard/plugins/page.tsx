'use client'

import DashboardPageShell from '@/components/DashboardPageShell'

export default function DashboardPluginsPage() {
  return (
    <DashboardPageShell title="Plugins / Ekstensi" subtitle="Kelola integrasi dan fitur tambahan untuk memperluas kapabilitas helpdesk.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Ekstensi Plugin</h2>
        <p className="mt-3 text-sm text-slate-400">Anda dapat menambahkan dukungan integrasi seperti email, WhatsApp, Slack, dan custom tools di halaman ini.</p>
      </div>
    </DashboardPageShell>
  )
}
