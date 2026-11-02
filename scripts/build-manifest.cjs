const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
function buildManifest() {
  const root = path.resolve("dist");
  const files = {};
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else {
        const relative = path.relative(root, file).split(path.sep).join("/");
        if (relative !== "build-manifest.json")
          files[relative] = crypto
            .createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex");
      }
    }
  }
  collect(root);
  const version = require("../package.json").version;
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  fs.writeFileSync(
    path.join(root, "build-manifest.json"),
    JSON.stringify(
      { version, batch: "2026-11-02-business", contentHash, files },
      null,
      2
    )
  );
}
function verifyManifest() {
  const root = path.resolve("dist"),
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, "build-manifest.json"), "utf8")
    );
  for (const [file, expected] of Object.entries(manifest.files)) {
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
    if (actual !== expected) throw Error("构建资源校验失败：" + file);
  }
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(manifest.files))
    .digest("hex");
  if (contentHash !== manifest.contentHash) throw Error("构建清单校验失败");
  console.log(
    JSON.stringify({
      version: manifest.version,
      batch: manifest.batch,
      contentHash,
      files: Object.keys(manifest.files).length,
    })
  );
}
module.exports = { buildManifest, verifyManifest };
if (require.main === module)
  process.argv.includes("--verify") ? verifyManifest() : buildManifest();
