const { parentPort, workerData } = require('node:worker_threads');
const { readCalendarFile, parseCalendars } = require('./ical.cjs');
(async () => {
  try {
    const sources = workerData.sources || await readCalendarFile(workerData.filename);
    const parsed = parseCalendars(sources, workerData.range, workerData.timeZone);
    parentPort.postMessage({ sources, parsed });
  } catch (error) { parentPort.postMessage({ error: error.message }); }
})();
