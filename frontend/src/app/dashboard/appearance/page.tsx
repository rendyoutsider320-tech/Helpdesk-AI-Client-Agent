'use client'

import DashboardPageShell from '@/components/DashboardPageShell'

export default function DashboardAppearancePage() {
  return (
    <DashboardPageShell title="Appearance / Tampilan" subtitle="Atur tema, gaya, dan tampilan utama dari portal helpdesk Anda.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Pengaturan Tampilan</h2>
        <p className="mt-3 text-sm text-slate-400">Kelola pengaturan tema, layout, dan preferensi tampilan untuk portal pengguna dan admin.</p>
      </div>
    </DashboardPageShell>
  )
}
