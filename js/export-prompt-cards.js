const cardViews = new WeakMap();

export function renderPromptCards(container, cards, edits) {
  const views = cardViews.get(container) || new Map();
  cardViews.set(container, views);
  const current = new Set(cards.map((card) => card.key));
  for (const [key, view] of views) {
    if (current.has(key)) continue;
    view.element.remove();
    views.delete(key);
  }
  cards.forEach((card, index) => {
    const text = edits[card.key] ?? card.text;
    const view = views.get(card.key) || createCard();
    views.set(card.key, view);
    view.update(card, text);
    if (container.children[index] !== view.element) container.insertBefore(view.element, container.children[index] || null);
  });
}

function createCard() {
  const element = document.createElement('article');
  element.className = 'promptCard';
  const heading = document.createElement('h3');
  const preview = document.createElement('div');
  const list = document.createElement('ul');
  const empty = document.createElement('p');
  empty.className = 'hint';
  empty.textContent = 'No details yet.';
  preview.className = 'promptCardList';   // 3.5 lines high (feedback.css), the rest shows on hover
  preview.append(list, empty);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Edit';
  const head = document.createElement('div');
  head.className = 'promptCardHead';
  head.append(heading, button);
  const few = document.createElement('p');
  few.className = 'promptCardFew';
  few.textContent = 'Not very detailed yet';
  const foot = document.createElement('div');
  foot.className = 'promptCardFoot';
  foot.append(few);
  element.append(head, preview, foot);
  let card;

  function update(nextCard, text) {
    card = nextCard;
    const title = card.name && card.name.toLowerCase() !== card.title.toLowerCase()
      ? `${card.title} (${card.name})` : card.title;
    heading.textContent = heading.title = title;
    const lines = text.split('\n').filter((line) => line.trim());
    list.replaceChildren(...lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    few.hidden = !card.sparse;
    element.classList.toggle('sparse', !!card.sparse);
    list.hidden = !lines.length;
    empty.hidden = !!lines.length;
    button.setAttribute('aria-label', `Edit ${title}`);
    measure();
  }
  // more than fits: fade the line that peeks out (also once the window becomes visible or changes width)
  function measure() {
    if (element.classList.contains('peek')) return;
    const cut = list.scrollHeight > preview.clientHeight + 1;
    element.classList.toggle('cut', cut);
  }
  new ResizeObserver(measure).observe(preview);

  // hovering slides the card open on top of the cards below: the negative margin keeps the others in place
  let timer, slide;
  function peek() {
    if (slide) { if (slide.playbackRate < 0) slide.reverse(); return; }   // back before it was closed
    const before = element.offsetHeight;
    element.classList.add('peek');
    const extra = element.offsetHeight - before;
    if (extra <= 0) { element.classList.remove('peek'); return; }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    slide = element.animate([
      { height: `${before}px`, marginBottom: '0px' },
      { height: `${before + extra}px`, marginBottom: `${-extra}px` },
    ], { duration: still ? 0 : 110, easing: 'ease-out', fill: 'both' });
    slide.onfinish = () => { if (slide?.playbackRate < 0) close(); };
  }
  function unpeek() {
    clearTimeout(timer);
    if (slide && slide.playbackRate > 0) slide.reverse();
  }
  function close() {
    clearTimeout(timer);
    slide?.cancel();
    slide = null;
    element.classList.remove('peek');
    measure();
  }
  element.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') timer = setTimeout(peek, 40); });
  element.addEventListener('pointerleave', unpeek);
  element.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) peek(); });
  element.addEventListener('focusout', unpeek);

  button.onclick = () => {
    close();
    const detail = card.objectId ? { kind: 'obj', id: card.objectId, frame: true } : { kind: 'environment' };
    document.dispatchEvent(new CustomEvent('vpg:goto', { detail }));
  };
  return { element, update };
}
