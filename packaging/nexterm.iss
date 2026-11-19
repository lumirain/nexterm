; NexTerm 安装包脚本（Inno Setup 6）
;
; 与 tauri.conf.json 里的 bundle 配置等价：单文件安装、当前用户/全局可选、
; 创建开始菜单项与卸载项。之所以另备一份，是因为 tauri 的 NSIS 打包需要
; 联网下载 NSIS 工具链，离线或网络受限时可以直接用这个脚本出包。
;
; 用法：ISCC.exe packaging\nexterm.iss

#define AppName "NexTerm"
#define AppVersion "1.0.0"
#define AppPublisher "NexTerm"
#define AppExe "nexterm.exe"
#define SourceExe "..\target\release\nexterm.exe"

[Setup]
AppId={{7C4B1E77-2F1A-4C6E-9A3D-5B8E2D1F0A31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
OutputDir=..\installer
OutputBaseFilename={#AppName}-{#AppVersion}-setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupIconFile=..\src-tauri\icons\icon.ico

[Languages]
; Inno Setup 官方发行版不含简体中文语言包，需要中文向导时把
; ChineseSimplified.isl 放入 Inno 的 Languages 目录后取消下一行注释。
; Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"

[Files]
Source: {#SourceExe}; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "启动 {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
// WebView2 是 Tauri 的运行时依赖（Win10/11 通常已自带）。
// 缺失时给出明确提示，而不是让用户看到一个打不开的程序。
function WebView2Installed(): Boolean;
var
  key: String;
begin
  key := 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result :=
    RegValueExists(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv') or
    RegValueExists(HKLM, key, 'pv') or
    RegValueExists(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv');
end;

procedure InitializeWizard();
begin
  if not WebView2Installed() then
    MsgBox('未检测到 Microsoft Edge WebView2 运行时。' + #13#10 +
           'NexTerm 依赖它渲染界面，请先从微软官网安装后重试。',
           mbInformation, MB_OK);
end;
