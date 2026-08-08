'use client'
 
import { useEffect, useState } from 'react'
import { approvalApi } from '@/lib/api'
import DashboardPageShell from '@/components/DashboardPageShell'
 
export default function ApprovalCenter() {
    const [approvals, setApprovals] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
 
    const fetchApprovals = async () => {
        try {
            const res = await approvalApi.list()
            setApprovals(res.data || [])
        } catch (err) {
            console.error('Failed to fetch approvals', err)
        } finally {
            setLoading(false)
        }
    }
 
    useEffect(() => {
        fetchApprovals()
    }, [])
 
    const handleApprove = async (ticketId: string, actionId: string) => {
        try {
            await approvalApi.approve(ticketId, actionId)
            alert('Tindakan disetujui dan sedang dikirim ke Agent.')
            fetchApprovals()
        } catch (err) {
            alert('Gagal menyetujui tindakan. Cek log server.')
        }
    }

    const handleReject = async (ticketId: string, actionId: string) => {
        try {
            await approvalApi.reject(ticketId, actionId)
            alert('Tindakan ditolak.')
            fetchApprovals()
        } catch (err) {
            alert('Gagal menolak tindakan. Cek log server.')
        }
    }
 
    return (
        <DashboardPageShell title="Approval Center" subtitle="Otorisasi tindakan otomatis AI sebelum dieksekusi ke PC target.">
            <div className="grid gap-6">
                {loading ? (
                    <div className="text-center py-10 text-slate-500">Loading...</div>
                ) : approvals.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-slate-950/75 p-10 text-center text-slate-500">
                        Semua permintaan persetujuan telah diproses.
                    </div>
                ) : (
                    approvals.map((app) => (
                        <div key={app.id} className="rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur-xl">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                                            app.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
                                            app.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 ring-rose-500/20' :
                                            'bg-amber-500/15 text-amber-400 ring-amber-500/20'
                                        }`}>
                                            {app.status === 'approved' ? 'Approved' : app.status === 'rejected' ? 'Rejected' : 'Need Approval'}
                                        </span>
                                        <span className="text-xs text-slate-500">ID: {app.id.substring(0, 8)}</span>
                                    </div>
                                    <h3 className="mt-2 text-xl font-semibold text-white">Action: {app.reason || 'Requested Fix'}</h3>
                                    <p className="mt-1 text-sm text-slate-400">Target Ticket ID: {app.ticket_id}</p>
                                    <p className="mt-1 text-xs text-slate-500">Dibuat: {new Date(app.created_at).toLocaleString('id-ID')}</p>
                                </div>
                                {app.status === 'pending' || (app.status !== 'approved' && app.status !== 'rejected') ? (
                                    <div className="flex gap-2 self-end sm:self-start">
                                        <button
                                            onClick={() => handleApprove(app.ticket_id, app.job_id || 'manual')}
                                            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 transition-colors"
                                        >
                                            Approve & Run
                                        </button>
                                        <button
                                            onClick={() => handleReject(app.ticket_id, app.job_id || 'manual')}
                                            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-400 italic self-end sm:self-start bg-slate-900/40 px-3 py-2 rounded-xl border border-white/5">
                                        Diproses: {app.approved_at ? new Date(app.approved_at).toLocaleString('id-ID') : 'Selesai'}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </DashboardPageShell>
    )
}
