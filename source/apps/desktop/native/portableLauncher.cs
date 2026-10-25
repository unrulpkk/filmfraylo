using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class portableLauncher
{
    [STAThread]
    private static int Main()
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string launcher = Path.Combine(root, "app", "Resources", "app", "startupLauncher.exe");
            if (!File.Exists(launcher)) launcher = Path.Combine(root, "app", "bin", "launcher.exe");
            var options = new ProcessStartInfo(launcher)
            {
                WorkingDirectory = Path.Combine(root, "app", "bin"),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            options.EnvironmentVariables["TOONFLOW_DATA_DIR"] = Path.Combine(root, "data");
            using (var process = Process.Start(options))
            {
                if (process == null) throw new InvalidOperationException("无法启动 FilmFraylo。");
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("启动失败，请完整解压后运行 filmFraylo.exe，并保留旁边的 app 文件夹。\n\n" + error.Message,
                "FilmFraylo", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
