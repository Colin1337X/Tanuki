#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef BundlePath
  #define BundlePath "..\..\dist\tanuki-stories-1.0.0-windows-x64"
#endif
[Setup]
AppId={{DE26F342-795B-4A54-9EEB-1A63936DA1F7}
AppName=Tanuki Stories
AppVersion={#AppVersion}
AppPublisher=Tanuki Stories
AppPublisherURL=https://github.com/Colin1337X/Tanuki
DefaultDirName={localappdata}\Programs\Tanuki Stories
DefaultGroupName=Tanuki Stories
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
WizardSizePercent=120
WizardImageFile=wizard.bmp
WizardSmallImageFile=mark.bmp
WizardImageStretch=yes
WizardImageBackColor=$33421D
SetupIconFile=tanuki.ico
UninstallDisplayIcon={app}\installer\windows\tanuki.ico
LicenseFile=..\..\LICENSE
OutputDir=..\..\dist\artifacts
OutputBaseFilename=Tanuki-Stories-{#AppVersion}-Setup-x64
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=no
DisableWelcomePage=no
DisableProgramGroupPage=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Messages]
WelcomeLabel1=Welcome home.
WelcomeLabel2=A home for big imaginations.%n%nInstall Tanuki Stories, then make it yours with a guided setup. Your accounts, stories and encryption keys live separately from the app, so updating or uninstalling won't erase your workspace.%n%nNode.js is included. No command-line tools or npm installation needed.
FinishedHeadingLabel=Roots down. Stories ahead.
FinishedLabel=Tanuki Stories is installed.%n%nNext, create your administrator and configure your workspace in the setup window. Connect your HTTPS reverse proxy and verify a backup before inviting students.
[Files]
Source: "{#BundlePath}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Set up Tanuki Stories"; Filename: "{app}\runtime\node.exe"; Parameters: """{app}\installer\setup.mjs"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\windows\tanuki.ico"
Name: "{group}\Start Tanuki Server"; Filename: "{app}\runtime\node.exe"; Parameters: """{app}\installer\start.mjs"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\windows\tanuki.ico"
Name: "{group}\Uninstall Tanuki Stories"; Filename: "{uninstallexe}"
[Run]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\installer\setup.mjs"""; Description: "Make this workspace yours"; Flags: nowait postinstall skipifsilent runhidden
; User data is deliberately absent from UninstallDelete. Upgrades never run provisioning.
