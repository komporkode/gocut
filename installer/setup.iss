; =====================================================================
; GoCut Desktop Video Editor - Inno Setup Script
; Mendukung 1-Klik Pilih Drive (C:, D:, E: dll) & Step Download Whisper AI
; =====================================================================

#define MyAppName "GoCut"
#define MyAppVersion "0.8.0"
#define MyAppPublisher "Komporkode"
#define MyAppURL "https://github.com/komporkode/gocut"
#define MyAppExeName "gocut.exe"

[Setup]
AppId={{6E4829A1-94B8-4FE2-9C17-916A465B49D2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={code:GetSelectedDrivePath}
DisableDirPage=yes
DefaultGroupName={#MyAppName}
OutputDir=..\release
OutputBaseFilename=GoCut-Setup-x64
SetupIconFile=..\build\windows\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Biner Utama GoCut
Source: "..\build\bin\{#MyAppExeName}"; DestDir: "{app}\app"; Flags: ignoreversion

; Media Tools (FFmpeg & FFprobe)
Source: "..\media-tools\ffmpeg.exe"; DestDir: "{app}\app\media-tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\media-tools\ffprobe.exe"; DestDir: "{app}\app\media-tools"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{app}\data"
Name: "{app}\data\projects"
Name: "{app}\data\cache"
Name: "{app}\data\models\whisper"
Name: "{app}\data\templates"

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\app\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\app\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\app\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DrivePage: TWizardPage;
  DriveRadios: array of TRadioButton;
  AvailableDrives: array of String;
  SelectedDrive: String;
  WhisperCheckBox: TCheckBox;
  DownloadPage: TDownloadWizardPage;

function GetSelectedDrivePath(Param: String): String;
begin
  if SelectedDrive = '' then
    Result := 'D:\GoCut'
  else
    Result := SelectedDrive + '\GoCut';
end;

procedure OnDriveRadioClick(Sender: TObject);
var
  Radio: TRadioButton;
begin
  Radio := TRadioButton(Sender);
  if Radio.Checked then
  begin
    SelectedDrive := AvailableDrives[Radio.Tag];
    WizardForm.DirEdit.Text := SelectedDrive + '\GoCut';
  end;
end;

function OnDownloadProgress(const Url, Filename: String; const Progress, ProgressMax: Int64): Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
var
  DriveCode: Integer;
  DriveStr: String;
  FreeMB, TotalMB: Cardinal;
  RadioTop, i: Integer;
  Radio: TRadioButton;
  FreeGB: Cardinal;
  Lbl: TLabel;
begin
  // Buat halaman pemilihan drive cepat
  DrivePage := CreateCustomPage(wpWelcome, 'Pilih Drive Instalasi & Komponen AI', 'Pilih lokasi drive penyimpanan aplikasi dan seluruh data GoCut.');
  
  Lbl := TLabel.Create(DrivePage);
  Lbl.Parent := DrivePage.Surface;
  Lbl.Caption := 'GoCut akan menyimpan aplikasi dan seluruh data proyek/model AI di drive pilihan:';
  Lbl.Top := 0;
  Lbl.Left := 0;
  Lbl.Width := DrivePage.SurfaceWidth;

  // Deteksi drive yang ada di komputer
  SetArrayLength(AvailableDrives, 0);
  for DriveCode := Ord('D') to Ord('Z') do
  begin
    DriveStr := Chr(DriveCode) + ':';
    if GetSpaceOnDisk(DriveStr, True, FreeMB, TotalMB) then
    begin
      i := GetArrayLength(AvailableDrives);
      SetArrayLength(AvailableDrives, i + 1);
      AvailableDrives[i] := DriveStr;
    end;
  end;

  // Selalu tambahkan C: sebagai pilihan terakhir jika belum ada
  i := GetArrayLength(AvailableDrives);
  SetArrayLength(AvailableDrives, i + 1);
  AvailableDrives[i] := 'C:';

  // Render Radio Button untuk tiap drive
  SetArrayLength(DriveRadios, GetArrayLength(AvailableDrives));
  RadioTop := 30;

  for i := 0 to GetArrayLength(AvailableDrives) - 1 do
  begin
    GetSpaceOnDisk(AvailableDrives[i], True, FreeMB, TotalMB);
    FreeGB := FreeMB div 1024;

    Radio := TRadioButton.Create(DrivePage);
    Radio.Parent := DrivePage.Surface;
    Radio.Left := 16;
    Radio.Top := RadioTop;
    Radio.Width := DrivePage.SurfaceWidth - 32;
    Radio.Tag := i;
    Radio.OnClick := @OnDriveRadioClick;

    if AvailableDrives[i] <> 'C:' then
      Radio.Caption := AvailableDrives[i] + '\GoCut  (Direkomendasikan - Sisa Kapasitas: ' + IntToStr(FreeGB) + ' GB)'
    else
      Radio.Caption := 'C:\GoCut  (Drive Sistem - Sisa Kapasitas: ' + IntToStr(FreeGB) + ' GB)';

    // Pilih drive non-C pertama sebagai default jika tersedia
    if i = 0 then
    begin
      Radio.Checked := True;
      SelectedDrive := AvailableDrives[i];
    end;

    DriveRadios[i] := Radio;
    RadioTop := RadioTop + 28;
  end;

  // Checkbox pilihan model AI Whisper
  RadioTop := RadioTop + 14;
  WhisperCheckBox := TCheckBox.Create(DrivePage);
  WhisperCheckBox.Parent := DrivePage.Surface;
  WhisperCheckBox.Left := 16;
  WhisperCheckBox.Top := RadioTop;
  WhisperCheckBox.Width := DrivePage.SurfaceWidth - 32;
  WhisperCheckBox.Caption := 'Unduh Model AI Whisper Base (~145 MB) di latar belakang saat instalasi';
  WhisperCheckBox.Checked := True;

  // Inisialisasi Download Wizard Page bawaan Inno Setup 6
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), 'Mengunduh model AI Whisper...', @OnDownloadProgress);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = DrivePage.ID then
  begin
    WizardForm.DirEdit.Text := SelectedDrive + '\GoCut';
  end;
  Result := True;
end;

function ShouldDownloadWhisper(): Boolean;
begin
  Result := (WhisperCheckBox <> nil) and (WhisperCheckBox.Checked);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  TargetFile, DestFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    if ShouldDownloadWhisper() then
    begin
      TargetFile := ExpandConstant('{tmp}\ggml-base.bin');
      DestFile := ExpandConstant('{app}\data\models\whisper\ggml-base.bin');
      try
        DownloadPage.Clear;
        DownloadPage.Add('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', 'ggml-base.bin', '');
        DownloadPage.Show;
        try
          DownloadPage.Download;
          FileCopy(TargetFile, DestFile, False);
        except
          // Jika internet offline atau gagal unduh, jangan gagalkan instalasi GoCut
          Log('Download whisper model dilewati atau gagal: ' + GetExceptionMessage);
        end;
      finally
        DownloadPage.Hide;
      end;
    end;
  end;
end;
