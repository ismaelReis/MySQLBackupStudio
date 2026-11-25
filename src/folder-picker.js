import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
let pickerOpen = false;

const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if (-not [Environment]::UserInteractive) { throw 'Sessao do Windows sem desktop interativo.' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class BackupFolderDialog {
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr filters);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName(out IntPtr name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }

  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
  private static extern int SHCreateItemFromParsingName(string name, IntPtr context, ref Guid iid, out IShellItem item);

  public static string Pick(IntPtr owner, string initial) {
    var clsid = new Guid("dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7");
    var dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
    try {
      uint options;
      dialog.GetOptions(out options);
      // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
      dialog.SetOptions(options | 0x20u | 0x40u);
      dialog.SetTitle("Selecione a pasta de backup");
      IShellItem start;
      Guid iid = typeof(IShellItem).GUID;
      if (!String.IsNullOrEmpty(initial) && SHCreateItemFromParsingName(initial, IntPtr.Zero, ref iid, out start) == 0) {
        try { dialog.SetFolder(start); } finally { Marshal.ReleaseComObject(start); }
      }
      int result = dialog.Show(owner);
      if (result == unchecked((int)0x800704C7)) return null;
      Marshal.ThrowExceptionForHR(result);
      IShellItem selected;
      dialog.GetResult(out selected);
      try {
        IntPtr name;
        selected.GetDisplayName(0x80058000u, out name); // SIGDN_FILESYSPATH
        try { return Marshal.PtrToStringUni(name); } finally { Marshal.FreeCoTaskMem(name); }
      } finally { Marshal.ReleaseComObject(selected); }
    } finally { Marshal.ReleaseComObject(dialog); }
  }
}
'@
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
try {
  $owner.ShowInTaskbar = $false
  $owner.Opacity = 0
  $owner.TopMost = $true
  $owner.Show()
  $owner.Activate()
  $selected = [BackupFolderDialog]::Pick($owner.Handle, $env:MBS_PICKER_INITIAL)
  if ($selected) { [Console]::WriteLine($selected) }
} finally {
  $owner.Dispose()
}
`;
const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

export function canPickBackupFolder(req) {
  return process.platform === 'win32' && loopback.has(req.socket.remoteAddress);
}

export async function pickBackupFolder(initial) {
  if (pickerOpen) {
    throw Object.assign(new Error('Já existe uma janela de seleção aberta.'), { status: 409 });
  }
  pickerOpen = true;
  try {
    const { stdout } = await run(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encodedScript],
      {
        env: { ...process.env, MBS_PICKER_INITIAL: initial },
        windowsHide: true,
        encoding: 'utf8',
        timeout: 180_000,
      }
    );
    return stdout.trim() || null;
  } catch (err) {
    console.error('[folder-picker]', err.stderr || err.code || err.message);
    throw new Error('Não foi possível abrir ou concluir a seleção. Rode o app na sua sessão do Windows e tente novamente.');
  } finally {
    pickerOpen = false;
  }
}
