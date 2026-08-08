'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { cmdbApi } from '@/lib/api'

interface Node {
  id: string
  label: string
  type: string
}

interface Link {
  source: string
  target: string
  type: string
}

interface ImpactedCI {
  id: string
  name: string
  type: string
  impact_level: number
}

export default function CmdbPage() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [impactChain, setImpactChain] = useState<ImpactedCI[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingImpact, setIsLoadingImpact] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTopology = async () => {
    try {
      const res = await cmdbApi.getTopology()
      setNodes(res.data?.nodes || [])
      setLinks(res.data?.links || [])
    } catch (err) {
      console.error('Failed to load CMDB topology', err)
      setError('Gagal memuat peta topologi CMDB.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTopology()
  }, [])

  const handleSelectNode = async (node: Node) => {
    setSelectedNode(node)
    setIsLoadingImpact(true)
    try {
      const res = await cmdbApi.getImpactAnalysis(node.id)
      setImpactChain(res.data || [])
    } catch (err) {
      console.error('Failed to load impact chain', err)
      setImpactChain([])
    } finally {
      setIsLoadingImpact(false)
    }
  }

  return (
    <DashboardPageShell
      title="CMDB Topologi & Relasi CI"
      subtitle="Jelajahi hubungan dependensi antar Item Konfigurasi (CI) dan lakukan analisis dampak kegagalan (impact analysis) secara real-time."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: List of Configuration Items (CIs) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card-soft p-6 rounded-3xl">
            <h2 className="text-xl font-semibold text-white mb-2">Item Konfigurasi (CI)</h2>
            <p className="text-xs text-slate-400 mb-4">Pilih salah satu CI untuk menganalisis jalur dampak kegagalannya.</p>

            {isLoading ? (
              <p className="text-slate-500 text-sm">Memuat daftar CI...</p>
            ) : error ? (
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm">{error}</div>
            ) : nodes.length === 0 ? (
              <p className="text-slate-500 text-sm">Belum ada CI yang terdaftar.</p>
            ) : (
              <div className="grid gap-2">
                {nodes.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleSelectNode(n)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedNode?.id === n.id
                        ? 'border-sky-500 bg-sky-500/5'
                        : 'border-white/5 bg-slate-900/40 hover:border-white/10'
                    }`}
                  >
                    <div>
                      <h3 className="font-semibold text-sm text-white">{n.label}</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">{n.id}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      n.type === 'server' ? 'bg-indigo-500/20 text-indigo-300' :
                      n.type === 'database' ? 'bg-amber-500/20 text-amber-300' :
                      n.type === 'website' ? 'bg-sky-500/20 text-sky-300' :
                      'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {n.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right columns: Visual Topology and Impact Analysis */}
        <div className="lg:col-span-2 space-y-6">
          {selectedNode ? (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Impact analysis chain */}
              <div className="glass-card-soft p-6 rounded-3xl">
                <h2 className="text-xl font-semibold text-rose-400 mb-1">Analisis Dampak Gangguan</h2>
                <p className="text-xs text-slate-400 mb-6">Jika terjadi kegagalan pada <strong>{selectedNode.label}</strong>, komponen berikut akan terdampak:</p>

                {isLoadingImpact ? (
                  <p className="text-slate-500 text-sm">Menganalisis dampak...</p>
                ) : impactChain.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 text-emerald-300 text-xs text-center">
                    Komponen mandiri. Tidak ada dependensi hilir (downstream) yang terdampak.
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-slate-800 space-y-6">
                    {impactChain.map((ci) => (
                      <div key={ci.id} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full bg-rose-500 border-4 border-slate-950" />
                        
                        <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-white text-xs">{ci.name}</h4>
                            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              TINGKAT {ci.impact_level}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">{ci.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CI Connections list */}
              <div className="glass-card-soft p-6 rounded-3xl space-y-4">
                <h2 className="text-xl font-semibold text-white mb-2">Relasi Terhubung</h2>
                <p className="text-xs text-slate-400 mb-4">Daftar hubungan relasional langsung CI terpilih.</p>

                <div className="space-y-3">
                  {links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).map((link, idx) => {
                    const srcNode = nodes.find(n => n.id === link.source)
                    const tgtNode = nodes.find(n => n.id === link.target)

                    return (
                      <div key={idx} className="p-4 rounded-2xl border border-white/5 bg-slate-900/30 flex items-center justify-between text-xs gap-3">
                        <div className="flex-1 truncate">
                          <p className="font-semibold text-slate-200 truncate">{srcNode ? srcNode.label : link.source}</p>
                          <p className="text-[10px] text-slate-500 uppercase mt-0.5">{srcNode ? srcNode.type : 'node'}</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 text-[9px] font-semibold uppercase">
                            {link.type}
                          </span>
                          <span className="text-[10px] text-slate-600 mt-1">──▶</span>
                        </div>
                        <div className="flex-1 text-right truncate">
                          <p className="font-semibold text-slate-200 truncate">{tgtNode ? tgtNode.label : link.target}</p>
                          <p className="text-[10px] text-slate-500 uppercase mt-0.5">{tgtNode ? tgtNode.type : 'node'}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card-soft p-6 rounded-3xl text-center text-slate-400 text-sm py-16">
              Pilih salah satu Item Konfigurasi di kolom kiri untuk menampilkan relasi topologi dan analisis dampak dependensi layanannya.
            </div>
          )}
        </div>
      </div>
    </DashboardPageShell>
  )
}
