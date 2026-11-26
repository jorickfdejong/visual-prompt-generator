import { $ } from './state.js';

/* =====================================================================
   GENERATE PROMPT WIZARD: the export modal shows one page at a time
   1. check details  2. download  3. generate in your image generator
   ===================================================================== */
const LAST = 3;
let step = 1, downloaded = false, onDone = () => {};

const pageOf = (n) => document.querySelector(`#exportModal .wizPage[data-step="${n}"]`);
let sliding = null;

// the old page is pushed out sideways while the new one slides in; forward goes left, back goes right
function slide(from, to, dir) {
  sliding?.finish();
  const body = $('#exportModal .modalBody'), old = pageOf(from), cur = pageOf(to);
  const top = old.offsetTop - body.scrollTop;
  Object.assign(old.style, { position: 'absolute', left: '0', right: '0', top: `${top}px` });
  body.classList.add('sliding');
  old.hidden = false; cur.hidden = false;
  body.scrollTop = 0;
  const opts = { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1)' };
  const out = old.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dir * 100}%)`, opacity: 0 }], opts);
  cur.animate([{ transform: `translateX(${dir * 100}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], opts);
  const end = () => { old.hidden = true; old.style.cssText = ''; body.classList.remove('sliding'); sliding = null; };
  sliding = { finish: () => { out.onfinish = null; out.finish(); end(); } };
  out.onfinish = end;
}

export function setWizardStep(n, { animate = true } = {}) {
  const prev = step;
  step = Math.min(LAST, Math.max(1, n));
  const still = !animate || prev === step || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    sliding?.finish();
    document.querySelectorAll('#exportModal .wizPage').forEach((p) => { p.hidden = +p.dataset.step !== step; });
    $('#exportModal .modalBody').scrollTop = 0;
  } else slide(prev, step, step > prev ? 1 : -1);
  document.querySelectorAll('#exportModal .wizSteps li').forEach((li, i) => {
    li.classList.toggle('current', i + 1 === step);
    li.classList.toggle('done', i + 1 < step);
    li.querySelector('button').setAttribute('aria-current', i + 1 === step ? 'step' : 'false');
    li.querySelector('button').disabled = i + 1 > 2 && !downloaded;   // the last step only after the download
  });
  $('#wizPrev').style.visibility = step === 1 ? 'hidden' : '';
  $('#wizNext').textContent = step === 1 ? 'Looks good' : step === LAST ? 'Done' : 'Next';
  $('#wizNext').style.visibility = step === 2 ? 'hidden' : '';   // on the download page, downloading is the way on
  $('#wizCount').textContent = `Step ${step} of ${LAST}`;
}

// called each time the modal opens; done() closes it from the last page
export function startWizard(done) {
  onDone = done;
  downloaded = false;
  step = 1;
  setWizardStep(1, { animate: false });
}

$('#wizPrev').onclick = () => setWizardStep(step - 1);
$('#wizNext').onclick = () => { if (step === LAST) onDone(); else setWizardStep(step + 1); };
document.querySelectorAll('#exportModal .wizSteps button').forEach((b) => { b.onclick = () => setWizardStep(+b.dataset.step); });
// on download, copies of the three file icons fly to the top right, where browsers show their downloads
function flyFiles() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tx = innerWidth - 36, ty = 14;
  document.querySelectorAll('#exportModal .flowFiles .fileIcon').forEach((icon, i) => {
    const r = icon.getBoundingClientRect();
    if (!r.width) return;
    const fly = icon.cloneNode(true);
    fly.classList.add('flyingFile');
    Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(fly);
    const dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height / 2);
    fly.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(.85) rotate(-8deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.3) rotate(0deg)`, opacity: 0.2 },
    ], { duration: 750, delay: i * 110, easing: 'cubic-bezier(.45,0,.4,1)', fill: 'both' }).onfinish = () => fly.remove();
  });
}
// downloading is all page 2 asks for, so it moves on to the next page once the files are on their way
$('#btnAll').addEventListener('click', () => {
  downloaded = true;
  if (step !== 2) return;
  flyFiles();
  setTimeout(() => { if (step === 2) setWizardStep(3); }, 500);
});
