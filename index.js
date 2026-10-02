#!/usr/bin/env node

const http = require("http");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');
const { exec: execCommand, execSync } = require('child_process');
const exec = promisify(execCommand);
const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || '';    // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开启,需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || '.tmp';    // 运行目录,sub节点文件保存目录
const FILE_PATH = process.env.FILE_PATH || '.npm';    // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // http服务订阅端口
const UUID = process.env.UUID || '17bca07c-069c-42ed-b067-86e00cdcc856'; // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆盖
@@ -356,12 +356,13 @@
// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
const filePath = fileName;
  const tempFilePath = `${filePath}.download`;

if (!fs.existsSync(FILE_PATH)) {
fs.mkdirSync(FILE_PATH, { recursive: true });
}

  const writer = fs.createWriteStream(filePath);
  const writer = fs.createWriteStream(tempFilePath);

axios({
method: 'get',
@@ -372,19 +373,37 @@
response.data.pipe(writer);

writer.on('finish', () => {
        writer.close();
        console.log(`Download ${path.basename(filePath)} successfully`);
        callback(null, filePath);
        writer.close((closeError) => {
          if (closeError) {
            const errorMessage = `Download ${path.basename(filePath)} failed: ${closeError.message}`;
            fs.unlink(tempFilePath, () => { });
            console.error(errorMessage);
            callback(errorMessage);
            return;
          }
          try {
            fs.renameSync(tempFilePath, filePath);
          } catch (renameError) {
            const errorMessage = `Download ${path.basename(filePath)} failed: ${renameError.message}`;
            fs.unlink(tempFilePath, () => { });
            console.error(errorMessage);
            callback(errorMessage);
            return;
          }
          console.log(`Download ${path.basename(filePath)} successfully`);
          callback(null, filePath);
        });
});

writer.on('error', err => {
        fs.unlink(filePath, () => { });
        fs.unlink(tempFilePath, () => { });
const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
console.error(errorMessage);
callback(errorMessage);
});
})
.catch(err => {
      fs.unlink(tempFilePath, () => { });
const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
console.error(errorMessage);
callback(errorMessage);
@@ -403,13 +422,24 @@

const downloadPromises = filesToDownload.map(fileInfo => {
return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) {
      const tryDownload = (urlIndex) => {
        downloadFile(fileInfo.fileName, fileInfo.fileUrls[urlIndex], (err, filePath) => {
          if (!err) {
            resolve(filePath);
            return;
          }

          if (urlIndex + 1 < fileInfo.fileUrls.length) {
            console.log(`Retrying ${path.basename(fileInfo.fileName)} from backup source`);
            tryDownload(urlIndex + 1);
            return;
          }

reject(err);
        } else {
          resolve(filePath);
        }
      });
        });
      };

      tryDownload(0);
});
});

@@ -424,13 +454,12 @@
const newPermissions = 0o775;
filePaths.forEach(absoluteFilePath => {
if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
        try {
          fs.chmodSync(absoluteFilePath, newPermissions);
          console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
        } catch (err) {
          console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
        }
}
});
}
@@ -510,13 +539,13 @@
if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
} else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
      args = `tunnel --edge-ip-version auto --config "${path.resolve(FILE_PATH, 'tunnel.yml')}" run`;
} else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile "${path.resolve(bootLogPath)}" --loglevel info --url http://localhost:${ARGO_PORT}`;
}

try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      await exec(`nohup "${path.resolve(botPath)}" ${args} >/dev/null 2>&1 &`);
console.log(`${botName} is running`);
await new Promise((resolve) => setTimeout(resolve, 2000));
} catch (error) {
@@ -528,35 +557,23 @@

// 根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }
  const baseUrl = architecture === 'arm' ? 'https://arm64.oooen.com' : 'https://amd64.oooen.com';
  const backupUrl = architecture === 'arm' ? 'https://arm64.ssss.nyc.mn' : 'https://amd64.ssss.nyc.mn';
  const baseFiles = [
    { fileName: webPath, fileUrls: [`${baseUrl}/web`, `${backupUrl}/web`] },
    { fileName: botPath, fileUrls: [`${baseUrl}/bot`, `${backupUrl}/bot`] }
  ];

if (NEZHA_SERVER && NEZHA_KEY) {
if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
baseFiles.unshift({
fileName: npmPath,
        fileUrl: npmUrl
        fileUrls: [`${baseUrl}/agent`, `${backupUrl}/agent`]
});
} else {
      const phpUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/v1"
        : "https://amd64.ssss.nyc.mn/v1";
baseFiles.unshift({
fileName: phpPath,
        fileUrl: phpUrl
        fileUrls: [`${baseUrl}/v1`, `${backupUrl}/v1`]
});
}
}
@@ -591,6 +608,22 @@
}
}

async function waitForQuickTunnelLog(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(bootLogPath)) {
        const content = fs.readFileSync(bootLogPath, 'utf-8');
        if (/trycloudflare\.com/.test(content)) return content;
      }
    } catch (error) {
      // 日志文件可能仍在创建中
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return '';
}

// 获取临时隧道domain
async function extractDomains() {
let argoDomain;
@@ -601,7 +634,7 @@
await generateLinks(argoDomain);
} else {
try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const fileContent = await waitForQuickTunnelLog();
const lines = fileContent.split('\n');
const argoDomains = [];
lines.forEach((line) => {
@@ -632,9 +665,9 @@
}
killBotProcess();
await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile "${path.resolve(bootLogPath)}" --loglevel info --url http://localhost:${ARGO_PORT}`;
try {
          await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          await exec(`nohup "${path.resolve(botPath)}" ${args} >/dev/null 2>&1 &`);
console.log(`${botName} is running`);
await new Promise((resolve) => setTimeout(resolve, 6000));
await extractDomains();
