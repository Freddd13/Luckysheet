const esbuild = require("esbuild");
const Module = require("module");
const path = require("path");
exports.load = function (file) {
  const out = esbuild.buildSync({
    entryPoints: [file],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  const module = new Module(path.resolve(file));
  module.paths = Module._nodeModulePaths(process.cwd());
  module._compile(out.outputFiles[0].text, path.resolve(file));
  return module.exports;
};
