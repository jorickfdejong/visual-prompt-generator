// Enter in a detail goes to the next one. Objects: after the last it goes to "+ Add your own detail".
const OBJECT = '#objName, #detailPosture, [data-k], [data-mk], [data-ck], [data-cv], [data-mck], [data-mcv], #btnAddDetail';
const WORLD = '[data-env]';

function enterNext(panel, DETAILS) {
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.target.matches('#btnAddDetail, #detailPosture') || !e.target.matches(DETAILS)) return;
    e.preventDefault();
    if (e.repeat) return;
    const all = [...panel.querySelectorAll(DETAILS)], next = all[all.indexOf(e.target) + 1];
    if (!next) return;   // the last one keeps the cursor
    next.focus();
    if (next.matches('input')) next.select();
  });
}
enterNext(document.querySelector('#context'), OBJECT);
enterNext(document.querySelector('#imageSection'), WORLD);
