using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

static class filmFrayloLauncher {
  // Windows CommandLineToArgvW 引号规则，包括路径末尾的反斜杠。
  static string quote(string value) {
    var result = new StringBuilder("\"");
    int slashes = 0;
    foreach (char item in value) {
      if (item == '\\') { slashes++; continue; }
      result.Append('\\', item == '"' ? slashes * 2 + 1 : slashes);
      result.Append(item);
      slashes = 0;
    }
    result.Append('\\', slashes * 2);
    return result.Append('"').ToString();
  }

  [STAThread]
  static int Main(string[] args) {
    try {
      string root = AppDomain.CurrentDomain.BaseDirectory;
      string runtime = Path.Combine(root, "runtime", "bun.exe");
      string script = Path.Combine(root, "filmFraylo.js");
      if (!File.Exists(runtime) || !File.Exists(script))
        throw new Exception("请先完整解压 FilmFraylo 压缩包，再运行 FilmFraylo.exe。");
      string[] options = args.Length == 0 ? new[] { "start", "--open" } : args;
      var start = new ProcessStartInfo(runtime, quote(script) + " " + string.Join(" ", options.Select(quote))) {
        WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
        RedirectStandardOutput = true, RedirectStandardError = true
      };
      using (var process = Process.Start(start)) {
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        if (process.ExitCode != 0) throw new Exception(error.Result + "\n" + output.Result);
        return 0;
      }
    } catch (Exception error) {
      MessageBox.Show(error.Message, "FilmFraylo 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return 1;
    }
  }
}
