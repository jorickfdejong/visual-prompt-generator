const cardViews = new WeakMap();

export function renderPromptCards(container, cards, edits, apply) {
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
    const view = views.get(card.key) || createCard(apply);
    views.set(card.key, view);
    view.update(card, text);
    if (container.children[index] !== view.element) container.insertBefore(view.element, container.children[index] || null);
  });
}

function createCard(apply) {
  const element = document.createElement('article');
  element.className = 'promptCard';
  const heading = document.createElement('h3');
  const preview = document.createElement('p');
  const editor = document.createElement('textarea');
  editor.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Edit';
  element.append(heading, preview, editor, button);
  let card, text;

  function update(nextCard, nextText) {
    card = nextCard;
    text = nextText;
    const title = card.name && card.name.toLowerCase() !== card.title.toLowerCase()
      ? `${card.title} (${card.name})` : card.title;
    heading.textContent = title;
    preview.textContent = text || 'No prompt text yet.';
    preview.classList.toggle('hint', !text);
    editor.setAttribute('aria-label', `${title} prompt`);
    button.setAttribute('aria-label', `${button.textContent} ${title} prompt`);
  }

  button.onclick = () => {
    const editing = editor.hidden;
    if (editing) editor.value = text;
    preview.hidden = editing;
    editor.hidden = !editing;
    button.textContent = editing ? 'Apply' : 'Edit';
    if (!editing) {
      const next = editor.value.trim();
      apply(card, next);
      text = next;
    }
    update(card, text);
    if (editing) editor.focus();
  };
  return { element, update };
}
