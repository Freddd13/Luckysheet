const { spawn } = require("child_process");
const server = spawn(process.execPath, ["tests/server.cjs"], {
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});
let runner;
function stop() {
  if (runner) runner.kill();
  server.kill();
}
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});
(async () => {
  try {
    for (let n = 0; n < 100; n++) {
      try {
        const response = await fetch("http://127.0.0.1:4173");
        if (response.ok) break;
      } catch {}
      if (n === 99) throw Error("测试服务启动失败");
      await new Promise(r => setTimeout(r, 100));
    }
    runner = spawn(
      process.execPath,
      [
        require.resolve("@playwright/test/cli"),
        "test",
        ...process.argv.slice(2),
      ],
      { stdio: "inherit", windowsHide: true }
    );
    runner.on("exit", code => {
      runner = null;
      server.kill();
      process.exitCode = code == null ? 1 : code;
    });
  } catch (error) {
    console.error(error);
    stop();
    process.exitCode = 1;
  }
})();
