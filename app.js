const $ = id => document.getElementById(id);
const kinds = ['All', 'Notes', 'Ideas', 'Checklists', 'Links'];
let cards = [];
let filter = 'All';
let revision = 0;
let busy = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function buttonFilter(label, type, parent) {
  const button = element('button', label, type.toLowerCase());
  button.type = 'button';
  button.setAttribute('aria-pressed', String(filter === type));
  button.onclick = () => {
    filter = filter === type ? 'All' : type;
    render();
    [...$('filters').children].find(item => item.getAttribute('aria-pressed') === 'true')?.focus();
  };
  parent.append(button);
}

function render() {
  const query = $('search').value.trim().toLowerCase();
  const tags = [...new Set(cards.flatMap(card => card.tags))].sort();
  $('filters').replaceChildren();
  for (const type of [...kinds, ...tags.map(tag => '#' + tag)]) buttonFilter(type, type, $('filters'));
  const visible = cards.filter(card => {
    const matchesFilter = filter === 'All' || card.type === filter || card.tags.some(tag => '#' + tag === filter);
    const text = [card.title, card.body, card.type, ...card.tags.map(tag => '#' + tag)].join(' ').toLowerCase();
    return matchesFilter && query.split(/\s+/).every(word => text.includes(word));
  });
  $('cards').replaceChildren(...visible.map(renderCard));
  if (!busy) $('status').textContent = visible.length ? '' : cards.length ? 'No captures match this view.' : 'Your board is empty. Save your first thought above.';
}

function renderCard(card) {
  const article = element('article', '', card.type.toLowerCase());
  const meta = element('div', '', 'meta');
  const done = card.items.filter(item => item.done).length;
  meta.append(element('span', card.type, 'kind'), element('span', card.items.length ? done + ' / ' + card.items.length + ' done' : new Date(card.created).toLocaleDateString(undefined, {month:'short', day:'numeric'})));
  article.append(meta, element('h3', card.title));
  if (card.items.length) {
    card.items.forEach((item, index) => {
      const label = element('label', '', 'item');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.done;
      label.append(checkbox, element('span', item.text));
      checkbox.onchange = async () => {
        checkbox.disabled = true;
        busy++;
        revision++;
        try {
          await request('/api/cards/' + card.id + '/items/' + index, { done: checkbox.checked });
          item.done = checkbox.checked;
          const progress = article.querySelector('.meta span:last-child');
          progress.textContent = card.items.filter(entry => entry.done).length + ' / ' + card.items.length + ' done';
          $('status').textContent = '';
        } catch (error) {
          checkbox.checked = item.done;
          $('status').textContent = error.message;
        } finally {
          busy--;
          checkbox.disabled = false;
        }
      };
      article.append(label);
    });
  } else if (card.body !== card.title && card.body !== card.link) {
    article.append(element('p', card.body, 'card-body'));
  }
  if (card.link) {
    const url = new URL(card.link);
    const anchor = element('a', url.hostname + ' ↗');
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    article.append(anchor);
  }
  if (card.tags.length) {
    const group = element('div', '', 'tags');
    for (const tag of card.tags) buttonFilter('#' + tag, '#' + tag, group);
    article.append(group);
  }
  return article;
}

async function request(path, payload) {
  const response = await fetch(path, payload && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not reach your board.');
  return body;
}

async function refresh() {
  if (busy || document.hidden) return;
  const snapshot = revision;
  try {
    const latest = await request('/api/cards');
    if (snapshot !== revision || busy) return;
    if (JSON.stringify(latest) !== JSON.stringify(cards) || !$('filters').children.length) {
      cards = latest;
      render();
    }
  } catch (error) {
    $('status').textContent = error.message;
  }
}

$('quick').onclick = () => $('message').focus();
$('search').oninput = render;
$('capture').onsubmit = async event => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  busy++;
  revision++;
  try {
    const card = await request('/api/cards', {text: $('message').value, title: $('title').value, type: $('type').value});
    cards.unshift(card);
    $('capture').reset();
    filter = 'All';
    $('search').value = '';
    $('status').textContent = 'Saved.';
  } catch (error) {
    $('status').textContent = error.message;
    return;
  } finally {
    busy--;
    submit.disabled = false;
  }
  render();
  $('status').textContent = 'Saved.';
  $('message').focus();
};
refresh();
setInterval(refresh, 5000);
document.addEventListener('visibilitychange', refresh);
