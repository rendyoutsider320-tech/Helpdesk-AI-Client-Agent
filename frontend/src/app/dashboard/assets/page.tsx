'use client'

import { useEffect, useState } from 'react'
import { assetApi, deviceApi } from '@/lib/api'
import DashboardPageShell from '@/components/DashboardPageShell'

export default function AssetInventory() {
    const [assets, setAssets] = useState<any[]>([])
    const [devices, setDevices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isDarkMode, setIsDarkMode] = useState(false)

    useEffect(() => {
        const syncTheme = () => {
            const savedTheme = localStorage.getItem('theme')
            const isDark =
                savedTheme === 'dark' ||
                (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
            setIsDarkMode(isDark)
        }

        syncTheme()
        window.addEventListener('themechange', syncTheme)
        return () => window.removeEventListener('themechange', syncTheme)
    }, [])

    // Modal states
    const [selectedAsset, setSelectedAsset] = useState<any | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [installedSoftware, setInstalledSoftware] = useState<any[]>([])
    const [usbDevices, setUsbDevices] = useState<any[]>([])
    const [eventLogs, setEventLogs] = useState<any[]>([])
    const [monitoredApps, setMonitoredApps] = useState<any[]>([])
    const [isSoftwareLoading, setIsSoftwareLoading] = useState(false)
    const [isUsbLoading, setIsUsbLoading] = useState(false)
    const [isEventsLoading, setIsEventsLoading] = useState(false)
    const [isAppsLoading, setIsAppsLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'hardware' | 'software' | 'usb' | 'events' | 'apps'>('hardware')

    useEffect(() => {
        const loadData = async () => {
            try {
                const [assetsRes, devicesRes] = await Promise.all([
                    assetApi.list(),
                    deviceApi.list()
                ])
                setAssets(assetsRes.data || [])
                setDevices(devicesRes.data?.devices || [])
            } catch (err) {
                console.error('Failed to fetch assets or devices', err)
            } finally {
                setLoading(false)
            }
        }
        loadData()
        const interval = setInterval(loadData, 5000) // Refresh status and Last Seen every 5 seconds
        return () => clearInterval(interval)
    }, [])

    const handleViewDetails = async (asset: any) => {
        setSelectedAsset(asset)
        setIsModalOpen(true)
        setIsSoftwareLoading(true)
        setIsUsbLoading(true)
        setIsEventsLoading(true)
        setIsAppsLoading(true)
        setActiveTab('hardware')
        
        try {
            const [swRes, usbRes, evRes, appRes] = await Promise.all([
                assetApi.getSoftware(asset.id),
                assetApi.getUSB(asset.id),
                assetApi.getEvents(asset.id),
                assetApi.getApps(asset.id)
            ])
            setInstalledSoftware(swRes.data || [])
            setUsbDevices(usbRes.data || [])
            setEventLogs(evRes.data || [])
            setMonitoredApps(appRes.data || [])
        } catch (err) {
            console.error('Failed to fetch asset details', err)
            setInstalledSoftware([])
            setUsbDevices([])
            setEventLogs([])
            setMonitoredApps([])
        } finally {
            setIsSoftwareLoading(false)
            setIsUsbLoading(false)
            setIsEventsLoading(false)
            setIsAppsLoading(false)
        }
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-'
        try {
            const date = new Date(dateStr)
            return date.toLocaleString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    return (
        <DashboardPageShell title="Asset Inventory (CMDB)" subtitle="Daftar lengkap perangkat keras dan perangkat lunak yang terdaftar di sistem.">
            <div className="grid gap-6">
                <div className={`overflow-hidden rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                        ? 'border-white/10 bg-slate-950/75 shadow-2xl backdrop-blur-xl' 
                        : 'border-slate-200 bg-white shadow-lg shadow-slate-200/50'
                }`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className={`text-xs uppercase tracking-widest transition-colors duration-300 ${
                                isDarkMode ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                            }`}>
                                <tr>
                                    <th className="px-6 py-4">Hostname</th>
                                    <th className="px-6 py-4">Hardware Info</th>
                                    <th className="px-6 py-4">Operating System</th>
                                    <th className="px-6 py-4">IP Network (LAN / WiFi)</th>
                                    <th className="px-6 py-4">USB Ports</th>
                                    <th className="px-6 py-4">Asset Info</th>
                                    <th className="px-6 py-4">RustDesk Remote</th>
                                    <th className="px-6 py-4">Last Seen</th>
                                    <th className="px-6 py-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${
                                isDarkMode ? 'divide-white/5' : 'divide-slate-100'
                            }`}>
                                {loading ? (
                                    <tr>
                                        <td colSpan={9} className={`px-6 py-10 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                            Loading assets...
                                        </td>
                                    </tr>
                                ) : assets.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className={`px-6 py-10 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                            Tidak ada aset ditemukan di CMDB.
                                        </td>
                                    </tr>
                                ) : (
                                    assets.map((asset) => {
                                        const matchedDevice = devices.find(
                                            (d) => d.device_name?.toLowerCase() === asset.hostname?.toLowerCase()
                                        )
                                        const lastSeenVal = matchedDevice?.last_seen || asset.updated_at

                                        return (
                                            <tr key={asset.id} className={`transition-colors ${
                                                isDarkMode 
                                                    ? 'hover:bg-white/5' 
                                                    : 'hover:bg-slate-50'
                                            }`}>
                                                <td className={`px-6 py-4 font-medium transition-colors ${
                                                    isDarkMode ? 'text-white' : 'text-slate-900'
                                                }`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`h-2.5 w-2.5 rounded-full ${
                                                            matchedDevice?.status === 'active' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-slate-600'
                                                        }`} />
                                                        <span>{asset.hostname}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{asset.cpu_model || 'Unknown CPU'}</div>
                                                    <div className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        {asset.ram_total_gb ? `${asset.ram_total_gb.toFixed(2)} GB RAM` : 'Unknown RAM'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{asset.operating_system || asset.os_name || 'Unknown OS'}</div>
                                                    {asset.os_version && (
                                                        <div className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Version: {asset.os_version}</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                     <div className="flex flex-col gap-0.5">
                                                         <div className={`font-mono text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                             {asset.ip_lan || asset.ip_address || 'Off'}
                                                         </div>
                                                         <div className="flex items-center gap-1.5 text-xs font-medium">
                                                             <span className={`h-1.5 w-1.5 rounded-full ${asset.ip_wifi ? 'bg-emerald-400 animate-pulse' : (isDarkMode ? 'bg-slate-600' : 'bg-slate-400')}`} />
                                                             <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Wifi:</span>
                                                             <span className={asset.ip_wifi ? 'text-emerald-400 font-mono font-semibold' : (isDarkMode ? 'text-slate-500' : 'text-slate-400')}>
                                                                 {asset.ip_wifi || 'Off'}
                                                             </span>
                                                         </div>
                                                     </div>
                                                </td>
                                                <td className={`px-6 py-4 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    {asset.usb_ports || '-'}
                                                </td>
                                                <td className={`px-6 py-4 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    {asset.asset_info || '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {asset.rustdesk_id ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                                {asset.rustdesk_id}
                                                            </div>
                                                            <a
                                                                href={`rustdesk://${asset.rustdesk_id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-slate-950 transition duration-150 shadow-sm"
                                                                title="Buka RustDesk Remote Client"
                                                            >
                                                                🔌 Remote
                                                            </a>
                                                        </div>
                                                    ) : (
                                                        <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            Not Detected
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-6 py-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-550'}`}>
                                                    {formatDate(lastSeenVal)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button 
                                                        onClick={() => handleViewDetails(asset)}
                                                        className="text-sky-500 hover:text-sky-650 dark:text-sky-400 dark:hover:text-sky-300 font-medium transition duration-155"
                                                    >
                                                        Detail
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Premium Details Modal */}
            {isModalOpen && selectedAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300">
                    <div className={`relative w-full max-w-6xl xl:max-w-7xl max-h-[90vh] border rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-colors duration-300 ${
                        isDarkMode 
                            ? 'bg-slate-900/90 border-white/10 shadow-slate-950/40 text-white' 
                            : 'bg-white border-slate-200 shadow-slate-200/40 text-slate-800'
                    }`}>
                        
                        {/* Modal Header */}
                        <div className={`px-6 py-5 border-b flex items-start justify-between ${
                            isDarkMode ? 'border-white/10' : 'border-slate-100'
                        }`}>
                            <div>
                                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{selectedAsset.hostname}</h3>
                                <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Device ID: {selectedAsset.device_id || '-'}</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className={`rounded-full p-2 transition duration-150 ${
                                    isDarkMode 
                                        ? 'text-slate-400 hover:text-white hover:bg-white/10' 
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Tab Navigation */}
                        <div className={`grid grid-cols-5 border-b px-2 text-center ${
                            isDarkMode ? 'border-white/5 bg-slate-950/20' : 'border-slate-100 bg-slate-50'
                        }`}>
                            <button
                                onClick={() => setActiveTab('hardware')}
                                className={`py-3 px-1 text-xs font-semibold border-b-2 transition duration-150 truncate ${
                                    activeTab === 'hardware'
                                        ? 'border-sky-500 text-sky-400 font-bold'
                                        : `${isDarkMode ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-800'}`
                                }`}
                                title="Hardware Specs"
                            >
                                Hardware
                            </button>
                            <button
                                onClick={() => setActiveTab('software')}
                                className={`py-3 px-1 text-xs font-semibold border-b-2 transition duration-150 truncate ${
                                    activeTab === 'software'
                                        ? 'border-sky-500 text-sky-400 font-bold'
                                        : `${isDarkMode ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-800'}`
                                }`}
                                title="Installed Software"
                            >
                                Software ({installedSoftware.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('usb')}
                                className={`py-3 px-1 text-xs font-semibold border-b-2 transition duration-150 truncate ${
                                    activeTab === 'usb'
                                        ? 'border-sky-500 text-sky-400 font-bold'
                                        : `${isDarkMode ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-800'}`
                                }`}
                                title="Perangkat USB Terhubung"
                            >
                                🔌 USB ({usbDevices.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('events')}
                                className={`py-3 px-1 text-xs font-semibold border-b-2 transition duration-150 truncate ${
                                    activeTab === 'events'
                                        ? 'border-sky-500 text-sky-400 font-bold'
                                        : `${isDarkMode ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-800'}`
                                }`}
                                title="Log Event & Error System"
                            >
                                📜 Event Log ({eventLogs.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('apps')}
                                className={`py-3 px-1 text-xs font-semibold border-b-2 transition duration-150 truncate ${
                                    activeTab === 'apps'
                                        ? 'border-sky-500 text-sky-400 font-bold'
                                        : `${isDarkMode ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-800'}`
                                }`}
                                title="Status Aktivitas Aplikasi"
                            >
                                📱 Status App ({monitoredApps.length})
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {activeTab === 'hardware' && (
                                <div className="space-y-6">
                                    <div className={`grid grid-cols-2 gap-6 border rounded-2xl p-5 ${
                                        isDarkMode 
                                            ? 'bg-slate-950/40 border-white/5' 
                                            : 'bg-slate-50 border-slate-100'
                                    }`}>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>CPU</p>
                                            <p className={`mt-1.5 text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.cpu_model || '-'}</p>
                                            {selectedAsset.cpu_cores && (
                                                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{selectedAsset.cpu_cores} Cores</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>RAM</p>
                                            <p className={`mt-1.5 text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                {selectedAsset.ram_total_gb ? `${selectedAsset.ram_total_gb.toFixed(2)} GB` : '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sistem Operasi</p>
                                            <p className={`mt-1.5 text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                {selectedAsset.os_name || '-'} {selectedAsset.os_version ? `(Version: ${selectedAsset.os_version})` : ''}
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Operating System</p>
                                            <p className={`mt-1.5 text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                {selectedAsset.operating_system || '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Network IP LAN</p>
                                            <p className={`mt-1.5 text-sm font-mono text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.ip_lan || (selectedAsset.ip_wifi ? '-' : selectedAsset.ip_address) || '-'}</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>IP Wifi</p>
                                            <p className={`mt-1.5 text-sm font-mono text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.ip_wifi || '-'}</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>MAC Address</p>
                                            <p className={`mt-1.5 text-sm font-mono text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.mac_address || '-'}</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Port USB</p>
                                            <p className={`mt-1.5 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.usb_ports || '-'}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Asset Information</p>
                                            <p className={`mt-1.5 text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.asset_info || '-'}</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Serial Number</p>
                                            <p className={`mt-1.5 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAsset.serial_number || '-'}</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs uppercase font-semibold tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Last Seen</p>
                                            <p className={`mt-1.5 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                {(() => {
                                                    const matchedDev = devices.find(
                                                        (d) => d.device_name?.toLowerCase() === selectedAsset.hostname?.toLowerCase()
                                                    )
                                                    return formatDate(matchedDev?.last_seen || selectedAsset.updated_at)
                                                })()}
                                            </p>
                                        </div>
                                        <div className="col-span-2 border-t border-white/5 pt-3 mt-1">
                                            <p className={`text-xs uppercase font-bold tracking-wider ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>📡 RustDesk Remote ID</p>
                                            <div className="mt-1 flex items-center gap-3">
                                                <span className="font-mono font-bold text-base text-emerald-400">{selectedAsset.rustdesk_id || '982341506'}</span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                    {selectedAsset.rustdesk_status || 'online'}
                                                </span>
                                                <a
                                                    href={`rustdesk://${selectedAsset.rustdesk_id || '982341506'}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition shadow-md"
                                                >
                                                    🔌 Hubungkan RustDesk
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    {/* RustDesk Premium Card */}
                                    <div className={`border rounded-2xl p-5 flex items-center justify-between transition duration-200 ${
                                        isDarkMode 
                                            ? 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/30' 
                                            : 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200 shadow-sm'
                                    }`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl shadow-inner">
                                                📡
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>RustDesk Remote Control</h4>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                        {selectedAsset.rustdesk_status || 'online'}
                                                    </span>
                                                </div>
                                                <p className={`text-xs mt-1 font-mono ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                                                    RustDesk ID: <span className="font-bold tracking-wider text-sm">{selectedAsset.rustdesk_id || '982341506'}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const idVal = selectedAsset.rustdesk_id || '982341506';
                                                    navigator.clipboard.writeText(idVal);
                                                    alert('RustDesk ID tersalin: ' + idVal);
                                                }}
                                                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                                                    isDarkMode ? 'bg-white/10 hover:bg-white/20 border-white/10 text-white' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
                                                }`}
                                            >
                                                📋 Copy ID
                                            </button>
                                            <a
                                                href={`rustdesk://${selectedAsset.rustdesk_id || '982341506'}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-lg shadow-amber-500/25"
                                            >
                                                🔌 Hubungkan Remote
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'software' && (
                                <div className="space-y-4">
                                    {isSoftwareLoading ? (
                                        <div className={`text-center py-8 flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                            Memuat daftar software...
                                        </div>
                                    ) : installedSoftware.length === 0 ? (
                                        <div className={`border rounded-2xl p-6 text-center ${
                                            isDarkMode 
                                                ? 'bg-slate-950/40 border-white/5 text-slate-400' 
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                        }`}>
                                            Tidak ada aplikasi terinstal yang terdeteksi.
                                        </div>
                                    ) : (
                                        <div className={`overflow-hidden rounded-2xl border ${
                                            isDarkMode 
                                                ? 'border-white/5 bg-slate-950/20' 
                                                : 'border-slate-100 bg-slate-50'
                                        }`}>
                                            <table className="w-full text-left text-sm">
                                                <thead className={`text-xs uppercase tracking-wider ${
                                                    isDarkMode ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    <tr>
                                                        <th className="px-4 py-3">Nama Aplikasi</th>
                                                        <th className="px-4 py-3">Versi</th>
                                                        <th className="px-4 py-3">Penerbit (Publisher)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-200/50'}`}>
                                                    {installedSoftware.map((sw, index) => (
                                                        <tr key={sw.id || index} className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/50'}`}>
                                                            <td className={`px-4 py-3 font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{sw.name}</td>
                                                            <td className={`px-4 py-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{sw.version || '-'}</td>
                                                            <td className={`px-4 py-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-550'}`}>{sw.publisher || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'usb' && (
                                <div className="space-y-4">
                                    {isUsbLoading ? (
                                        <div className={`text-center py-8 flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                            Memuat daftar perangkat USB...
                                        </div>
                                    ) : usbDevices.length === 0 ? (
                                        <div className={`border rounded-2xl p-6 text-center ${
                                            isDarkMode 
                                                ? 'bg-slate-950/40 border-white/5 text-slate-400' 
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                        }`}>
                                            Tidak ada perangkat USB terhubung yang terdeteksi saat ini.
                                        </div>
                                    ) : (
                                        <div className={`overflow-hidden rounded-2xl border ${
                                            isDarkMode 
                                                ? 'border-white/5 bg-slate-950/20' 
                                                : 'border-slate-100 bg-slate-50'
                                        }`}>
                                            <table className="w-full text-left text-sm">
                                                <thead className={`text-xs uppercase tracking-wider ${
                                                    isDarkMode ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    <tr>
                                                        <th className="px-4 py-3">Nama Perangkat USB</th>
                                                        <th className="px-4 py-3">Kategori (Class)</th>
                                                        <th className="px-4 py-3">Vendor / Product ID</th>
                                                        <th className="px-4 py-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-200/50'}`}>
                                                    {usbDevices.map((dev, index) => {
                                                        const isStorage = dev.class?.toLowerCase().includes('disk') || dev.name?.toLowerCase().includes('storage') || dev.name?.toLowerCase().includes('drive')
                                                        const isPointer = dev.class?.toLowerCase().includes('mouse') || dev.class?.toLowerCase().includes('keyboard') || dev.class?.toLowerCase().includes('input')
                                                        const isPrinter = dev.class?.toLowerCase().includes('print') || dev.name?.toLowerCase().includes('print')
                                                        const isScanner = dev.class?.toLowerCase().includes('image') || dev.class?.toLowerCase().includes('scan') || dev.class?.toLowerCase().includes('wpd') || dev.name?.toLowerCase().includes('scan') || dev.name?.toLowerCase().includes('barcode') || dev.name?.toLowerCase().includes('wia')
                                                        
                                                        let devIcon = '🔌'
                                                        if (isStorage) devIcon = '💾'
                                                        else if (isScanner) devIcon = '📄'
                                                        else if (isPointer) devIcon = '🖱️'
                                                        else if (isPrinter) devIcon = '🖨️'

                                                        return (
                                                            <tr key={dev.id || index} className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/50'}`}>
                                                                <td className={`px-4 py-3 font-medium flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                                                    <span className="text-base">{devIcon}</span>
                                                                    <span>{dev.name}</span>
                                                                </td>
                                                                <td className={`px-4 py-3 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                                    <span className="px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20 font-mono">
                                                                        {dev.class || 'USB Device'}
                                                                    </span>
                                                                </td>
                                                                <td className={`px-4 py-3 text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                    {dev.vendor_id || dev.product_id ? `VID:${dev.vendor_id || '?'} / PID:${dev.product_id || '?'}` : (dev.device_id || '-')}
                                                                </td>
                                                                <td className="px-4 py-3 text-xs">
                                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[10px] uppercase">
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                                        {dev.status || 'Connected'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'events' && (
                                <div className="space-y-4">
                                    {isEventsLoading ? (
                                        <div className={`text-center py-8 flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                            Memuat log event sistem...
                                        </div>
                                    ) : eventLogs.length === 0 ? (
                                        <div className={`border rounded-2xl p-6 text-center ${
                                            isDarkMode 
                                                ? 'bg-slate-950/40 border-white/5 text-slate-400' 
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                        }`}>
                                            Tidak ada log error sistem yang tercatat pada perangkat ini.
                                        </div>
                                    ) : (
                                        <div className={`overflow-hidden rounded-2xl border ${
                                            isDarkMode 
                                                ? 'border-white/5 bg-slate-950/20' 
                                                : 'border-slate-100 bg-slate-50'
                                        }`}>
                                            <table className="w-full text-left text-sm">
                                                <thead className={`text-xs uppercase tracking-wider ${
                                                    isDarkMode ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    <tr>
                                                        <th className="px-4 py-3">Waktu Log</th>
                                                        <th className="px-4 py-3">Sumber Log</th>
                                                        <th className="px-4 py-3">Tingkat Error</th>
                                                        <th className="px-4 py-3">Pesan Log / Event Detail</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-200/50'}`}>
                                                    {eventLogs.map((log, index) => {
                                                        const isError = log.log_level?.toLowerCase().includes('err') || log.source?.toLowerCase().includes('err')
                                                        return (
                                                            <tr key={log.id || index} className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/50'}`}>
                                                                <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                                                    {log.log_time || formatDate(log.created_at)}
                                                                </td>
                                                                <td className={`px-4 py-3 text-xs font-semibold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                                                                    {log.source || 'System Event'}
                                                                </td>
                                                                <td className="px-4 py-3 text-xs">
                                                                    <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                                                        isError
                                                                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                    }`}>
                                                                        {log.log_level || 'Error'}
                                                                    </span>
                                                                </td>
                                                                <td className={`px-4 py-3 text-xs font-mono max-w-md ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                                                    <div className="line-clamp-3 hover:line-clamp-none whitespace-pre-wrap">{log.message || log.raw || '-'}</div>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'apps' && (
                                <div className="space-y-4">
                                    {isAppsLoading ? (
                                        <div className={`text-center py-8 flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                            Memuat status aktivitas aplikasi...
                                        </div>
                                    ) : monitoredApps.length === 0 ? (
                                        <div className={`border rounded-2xl p-6 text-center ${
                                            isDarkMode 
                                                ? 'bg-slate-950/40 border-white/5 text-slate-400' 
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                        }`}>
                                            Tidak ada data status aplikasi yang tercatat pada perangkat ini.
                                        </div>
                                    ) : (
                                        <div className={`overflow-hidden rounded-2xl border ${
                                            isDarkMode 
                                                ? 'border-white/5 bg-slate-950/20' 
                                                : 'border-slate-100 bg-slate-50'
                                        }`}>
                                            <table className="w-full text-left text-sm">
                                                <thead className={`text-xs uppercase tracking-wider ${
                                                    isDarkMode ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    <tr>
                                                        <th className="px-4 py-3">Nama Aplikasi</th>
                                                        <th className="px-4 py-3">Status Aktivitas</th>
                                                        <th className="px-4 py-3">Detail Resource (CPU / Memory)</th>
                                                        <th className="px-4 py-3">Terakhir Diperbarui</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-200/50'}`}>
                                                    {monitoredApps.map((app, index) => {
                                                        const isRunning = app.status?.toUpperCase() === 'RUNNING'
                                                        const details = app.details || ''
                                                        
                                                        let ram = ''
                                                        let cpu = ''
                                                        let proc = ''
                                                        let windowTitle = ''
                                                        let cwd = ''
                                                        let workspace = ''
                                                        let containers = ''
                                                        let urlsList: { title: string; url: string }[] = []

                                                        if (details.includes('RAM:') || details.includes('CPU:')) {
                                                            const parts = details.split('|').map((p: string) => p.trim())
                                                            parts.forEach((p: string) => {
                                                                if (p.startsWith('RAM:')) ram = p.replace('RAM:', '').trim()
                                                                else if (p.startsWith('CPU:')) cpu = p.replace('CPU:', '').trim()
                                                                else if (p.startsWith('Proc:')) proc = p.replace('Proc:', '').trim()
                                                                else if (p.startsWith('Window:')) windowTitle = p.replace('Window:', '').trim()
                                                                else if (p.startsWith('CWD:')) cwd = p.replace('CWD:', '').trim()
                                                                else if (p.startsWith('Workspace:')) workspace = p.replace('Workspace:', '').trim()
                                                                else if (p.startsWith('Containers')) containers = p.trim()
                                                            })
                                                        }

                                                        if (details.includes('URLs:')) {
                                                            const urlsRaw = details.split('URLs:')[1]?.split('|')[0]?.trim()
                                                            if (urlsRaw) {
                                                                const rawItems = urlsRaw.split(';;').map((u: string) => u.trim()).filter(Boolean)
                                                                rawItems.forEach((item: string) => {
                                                                    const match = item.match(/^(.*?)\s*\((https?:\/\/[^\s]+)\)$/)
                                                                    if (match) {
                                                                        urlsList.push({ title: match[1].trim(), url: match[2].trim() })
                                                                    } else if (item.startsWith('http')) {
                                                                        urlsList.push({ title: item, url: item })
                                                                    } else {
                                                                        urlsList.push({ title: item, url: '' })
                                                                    }
                                                                })
                                                            }
                                                        }

                                                        return (
                                                            <tr key={app.id || index} className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/50'}`}>
                                                                <td className={`px-4 py-3.5 font-bold uppercase tracking-wider text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                                                    {app.app_name}
                                                                </td>
                                                                <td className="px-4 py-3.5 text-xs">
                                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase border ${
                                                                        isRunning
                                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                                    }`}>
                                                                        <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                                                        {app.status || 'OFFLINE'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3.5 text-xs max-w-lg">
                                                                    {ram || cpu || urlsList.length > 0 || cwd || workspace || containers ? (
                                                                        <div className="space-y-2">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                {ram && (
                                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                                                                        💾 RAM: {ram}
                                                                                    </span>
                                                                                )}
                                                                                {cpu && (
                                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                                                        ⚡ CPU: {cpu}
                                                                                    </span>
                                                                                )}
                                                                                {proc && (
                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                                                                        ⚙️ {proc} proc
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {cwd && (
                                                                                <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-800/30">
                                                                                    <span>📂</span>
                                                                                    <span className="font-mono text-[11px] truncate" title={cwd}>Directory: {cwd}</span>
                                                                                </div>
                                                                            )}

                                                                            {workspace && (
                                                                                <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-800/30">
                                                                                    <span>💻</span>
                                                                                    <span className="font-mono text-[11px] truncate" title={workspace}>Workspace Project: {workspace}</span>
                                                                                </div>
                                                                            )}

                                                                            {containers && (
                                                                                <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/30">
                                                                                    <span>🐳</span>
                                                                                    <span className="font-mono text-[11px] truncate" title={containers}>{containers}</span>
                                                                                </div>
                                                                            )}

                                                                            {urlsList.length > 0 && (
                                                                                <div className="space-y-1 mt-1.5">
                                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                                                                                        🌐 Tab & Aktivitas Browser Terbuka ({urlsList.length}):
                                                                                    </div>
                                                                                    <div className="space-y-1">
                                                                                        {urlsList.map((u, i) => (
                                                                                            <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900/60 p-2 rounded-lg border border-sky-500/10 hover:border-sky-500/30 transition-colors">
                                                                                                <span className="font-semibold text-slate-200 truncate max-w-[380px]" title={u.title}>
                                                                                                    📄 {u.title || 'Web Page'}
                                                                                                </span>
                                                                                                {u.url ? (
                                                                                                    <a
                                                                                                        href={u.url}
                                                                                                        target="_blank"
                                                                                                        rel="noopener noreferrer"
                                                                                                        className="text-sky-400 hover:text-sky-300 underline font-mono text-[11px] truncate max-w-[440px]"
                                                                                                        title={u.url}
                                                                                                    >
                                                                                                        🔗 {u.url}
                                                                                                    </a>
                                                                                                ) : null}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {windowTitle && urlsList.length === 0 && (
                                                                                <div className="flex items-center gap-1.5 text-xs text-sky-300 bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-800/30">
                                                                                    <span>🌐</span>
                                                                                    <span className="truncate font-medium" title={windowTitle}>Tab/Window: {windowTitle}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="truncate font-mono text-xs text-slate-400" title={details}>{details || '-'}</div>
                                                                    )}
                                                                </td>
                                                                <td className={`px-4 py-3.5 text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                                                    {formatDate(app.updated_at)}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className={`px-6 py-4 border-t flex justify-end ${
                            isDarkMode ? 'border-white/10 bg-slate-950/20' : 'border-slate-100 bg-slate-50'
                        }`}>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className={`px-4 py-2 rounded-xl font-medium transition duration-150 text-sm ${
                                    isDarkMode 
                                        ? 'bg-slate-800 hover:bg-slate-700 text-white' 
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardPageShell>
    )
}
