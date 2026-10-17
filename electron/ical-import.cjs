const { Worker } = require('node:worker_threads');
const path = require('node:path');

function previewCalendar(input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'ical-worker.cjs'), { workerData: input, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('캘린더 처리 시간이 길어졌습니다. 가져올 기간을 줄이거나 캘린더별로 나누어 주세요.')); }, 20000);
    worker.once('message', result => { clearTimeout(timer); if (result.error) reject(new Error(result.error)); else resolve(result); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('캘린더를 읽지 못했습니다. 파일이나 가져올 기간을 확인해 주세요.')); });
  });
}
module.exports = { previewCalendar };
