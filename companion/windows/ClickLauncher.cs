using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

// This executable is only a clickable entry, not a login task or service.
internal static class ClickLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool diagnose = args.Length == 1 && args[0] == "--diagnose";
        try
        {
            if (args.Length != 0 && !diagnose) throw new ArgumentException("不支持的启动参数。");
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string script = Path.Combine(root, "windows", "launch.ps1");
            if (!File.Exists(script)) throw new IOException("启动文件已移动，请重新创建 Codex EVA 快捷方式。");
            var info = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoProfile -NonInteractive -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            using (var child = Process.Start(info))
            {
                var output = child.StandardOutput.ReadToEndAsync();
                var errors = child.StandardError.ReadToEndAsync();
                child.WaitForExit();
                if (child.ExitCode != 0)
                    Report(String.IsNullOrWhiteSpace(errors.Result) ? "启动未完成，请查看 EVA 托盘状态。" : errors.Result, diagnose);
                else if (diagnose) Console.Write(output.Result);
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            Report(error.Message, diagnose);
            return 1;
        }
    }

    private static void Report(string message, bool diagnose)
    {
        if (diagnose) Console.Error.WriteLine(message);
        else MessageBox.Show(message, "Codex EVA 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
