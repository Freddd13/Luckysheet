const http = require("http");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
fs.mkdirSync("tmp", { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: `import {getMeasureText} from './src/global/getRowlen'; window.measureTextForTest=getMeasureText; import './src/index.js'; import { luckysheet } from './src/core'; import Store from './src/store'; import selection from './src/controllers/selection'; import dropCell from './src/controllers/dropCell'; import freezen from './src/controllers/freezen'; import config from './src/controllers/luckysheetConfigsetting'; import formula from './src/global/formula'; import editor from './src/global/editor'; import viewDecorations from './src/controllers/viewDecorations'; import server from './src/controllers/server'; window.luckysheet=luckysheet; window.testInternals={Store,selection,dropCell,freezen,config,formula,editor,viewDecorations,server};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  outfile: "tmp/test.js",
  target: ["es2015"],
  logLevel: "silent",
});
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/dist/plugins/css/pluginsCss.css"><link rel="stylesheet" href="/dist/plugins/plugins.css"><link rel="stylesheet" href="/test.css"><link rel="stylesheet" href="/dist/assets/iconfont/iconfont.css"><style>html,body,#luckysheet{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="luckysheet"></div><script src="/dist/plugins/js/plugin.js"></script><script src="/tmp/test.js"></script>`;
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/slow-workbook") {
      const timer = setTimeout(() => res.end("[]"), 30000);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(html);
    }
    if (url.pathname === "/distribution") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(
        html
          .replace("/test.css", "/dist/css/luckysheet.css")
          .replace("/tmp/test.js", "/dist/luckysheet.umd.js")
      );
    }
    if (url.pathname === "/baseline") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(
        html
          .replace("/test.css", "/tmp/baseline.css")
          .replace("/tmp/test.js", "/tmp/baseline.js")
      );
    }
    if (url.pathname === "/test.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(
        fs
          .readdirSync("src/css")
          .filter(n => n.endsWith(".css"))
          .map(n => fs.readFileSync("src/css/" + n))
          .join("\n")
      );
    }
    const file = path.resolve("." + decodeURIComponent(url.pathname));
    if (!file.startsWith(process.cwd() + path.sep)) {
      res.statusCode = 403;
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader(
        "Content-Type",
        /\.js$/.test(file)
          ? "application/javascript"
          : /\.css$/.test(file)
          ? "text/css"
          : "application/octet-stream"
      );
      res.end(data);
    });
  })
  .listen(4173, "127.0.0.1");
