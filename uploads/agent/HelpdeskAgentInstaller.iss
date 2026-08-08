; =====================================================================
; INNO SETUP SCRIPT: Helpdesk AI Client Agent Windows Installer (v3.7.0)
; Automatic Background Windows Service Deployment with RustDesk Remote & Auto-Restart
; =====================================================================

[Setup]
AppId={{8F9A3B12-4C5D-6E7F-8A9B-0C1D2E3F4A5B}
AppName=Helpdesk AI Client Agent
AppVersion=3.7.0
AppPublisher=Helpdesk AI Team
DefaultDirName={autopf}\HelpdeskAgent
DefaultGroupName=Helpdesk AI
OutputBaseFilename=HelpdeskAgent_Setup_v3.7.0
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
UninstallDisplayIcon={app}\agent-client.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Salin executable agent-client.exe dan file konfigurasi .env (opsional)
Source: "agent-client.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Run]
; 1. Hapus service lama jika ada (agar instalasi bersih)
Filename: "{app}\agent-client.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; StatusMsg: "Menyiapkan instalasi service..."

; 2. Pasang Windows Service baru dengan Hak Akses Admin
Filename: "{app}\agent-client.exe"; Parameters: "--install"; Flags: runhidden waituntilterminated; StatusMsg: "Mendaftarkan Windows Service..."

; 3. Konfigurasi Service agar Otomatis Aktif saat Windows Booting (Automatic Startup Type)
Filename: "{sys}\sc.exe"; Parameters: "config HelpdeskAgent start= auto"; Flags: runhidden waituntilterminated; StatusMsg: "Mengonfigurasi Auto-Start Service..."

; 4. Konfigurasi Auto-Recovery (Jika Service crash, Windows akan otomatis restart service dalam 5 detik)
Filename: "{sys}\sc.exe"; Parameters: "failure HelpdeskAgent reset= 86400 actions= restart/5000/restart/5000/restart/5000"; Flags: runhidden waituntilterminated

; 5. Jalankan Service sekarang di latar belakang
Filename: "{sys}\sc.exe"; Parameters: "start HelpdeskAgent"; Flags: runhidden waituntilterminated; StatusMsg: "Menjalankan Helpdesk Agent Service..."

[UninstallRun]
; Hentikan dan hapus service saat uninstall
Filename: "{sys}\sc.exe"; Parameters: "stop HelpdeskAgent"; Flags: runhidden waituntilterminated
Filename: "{app}\agent-client.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated

[Code]
// Prosedur otomatis untuk menghentikan service lama SEBELUM menyalin file baru
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('net.exe', 'stop HelpdeskAgent', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im agent-client.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1000);
  Result := True;
end;
