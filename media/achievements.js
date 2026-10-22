(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'done', label: 'Conseguidos' },
    { id: 'todo', label: 'Por conseguir' },
  ];

  // El filtro elegido se recuerda aunque la pestaña se oculte y vuelva
  let filter = (vscode.getState() || {}).filter || 'all';
  let data = null;
  let tierBalls = {};

  // Crea un elemento sin usar innerHTML: los textos se insertan siempre como texto
  function el(tag, options, children) {
    const node = document.createElement(tag);
    const opts = options || {};
    if (opts.className) {
      node.className = opts.className;
    }
    if (opts.text !== undefined) {
      node.textContent = opts.text;
    }
    if (opts.attrs) {
      for (const [key, value] of Object.entries(opts.attrs)) {
        node.setAttribute(key, value);
      }
    }
    for (const child of children || []) {
      node.appendChild(child);
    }
    return node;
  }

  function percent(part, total) {
    return total > 0 ? Math.floor((part / total) * 100) : 0;
  }

  function format(n) {
    return n.toLocaleString('es-ES');
  }

  function progressBar(part, total, className) {
    const fill = el('div', { className: 'progress-fill' });
    fill.style.width = `${percent(part, total)}%`;
    return el('div', { className: className ? `progress ${className}` : 'progress' }, [fill]);
  }

  function headerNode() {
    const buttons = FILTERS.map((f) => {
      const button = el('button', {
        className: f.id === filter ? 'filter active' : 'filter',
        text: f.label,
      });
      button.addEventListener('click', () => {
        filter = f.id;
        vscode.setState({ filter });
        render();
      });
      return button;
    });

    const summary = el('p', {
      className: 'stats',
      text: `${data.done} de ${data.total} logros (${percent(data.done, data.total)}%)`,
    });
    if (data.pendingRewards > 0) {
      const text = data.pendingRewards === 1 ? '1 recompensa' : `${data.pendingRewards} recompensas`;
      summary.appendChild(
        el('span', { className: 'pending', text: ` · 🎁 ${text} esperando en el próximo guardado` })
      );
    }

    return el('header', {}, [
      el('div', { className: 'banner' }, [
        el('div', { className: 'pokeball-deco', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'banner-text' }, [
          el('h1', { text: '🏆 Logros' }),
          summary,
          progressBar(data.done, data.total, 'big'),
        ]),
      ]),
      el('div', { className: 'filters' }, buttons),
    ]);
  }

  function cardNode(a) {
    const status = a.done
      ? el('span', {
          className: a.claimed ? 'badge done' : 'badge reward',
          text: a.claimed ? '✔ Conseguido' : '🎁 Recompensa pendiente',
        })
      : el('span', { className: 'badge locked', text: '🔒 Por conseguir' });

    const ball = el('img', {
      className: 'ball',
      attrs: { src: tierBalls[a.tier] || '', alt: '', loading: 'lazy' },
    });
    ball.addEventListener('error', () => ball.remove());

    const stars = '★'.repeat(a.tier) + '☆'.repeat(4 - a.tier);
    const children = [
      el('div', { className: 'card-top' }, [
        el('span', { className: 'stars', text: stars, attrs: { title: `Dificultad ${a.tier} de 4` } }),
        ball,
      ]),
      el('h3', { text: a.name }),
      el('p', { className: 'desc', text: a.description }),
      el('p', { className: 'reward', text: `Recompensa: un Pokémon ${a.tierLabel}` }),
    ];

    if (!a.done) {
      children.push(progressBar(a.current, a.target));
      children.push(
        el('p', { className: 'progress-text', text: `${format(a.current)} / ${format(a.target)}` })
      );
    }
    children.push(status);

    return el('article', { className: `card tier-${a.tier} ${a.done ? 'done' : 'todo'}` }, children);
  }

  function groupNode(group) {
    const items = group.achievements.filter((a) => {
      if (filter === 'done') {
        return a.done;
      }
      if (filter === 'todo') {
        return !a.done;
      }
      return true;
    });
    if (items.length === 0) {
      return null;
    }

    return el('section', { className: 'group' }, [
      el('h2', {}, [
        el('span', { text: `${group.icon} ${group.name}` }),
        el('span', { className: 'group-count', text: `${group.done}/${group.achievements.length}` }),
      ]),
      el('div', { className: 'grid' }, items.map(cardNode)),
    ]);
  }

  function render() {
    if (!data) {
      root.replaceChildren(el('p', { className: 'empty', text: 'Cargando…' }));
      return;
    }
    const groups = data.groups.map(groupNode).filter(Boolean);
    root.replaceChildren(
      headerNode(),
      ...(groups.length > 0
        ? groups
        : [el('p', { className: 'empty', text: 'No hay logros en este filtro.' })])
    );
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      data = msg.achievements;
      tierBalls = msg.tierBalls || {};
      render();
    }
  });

  render();
  // Avisa a la extensión de que ya puede enviar los datos
  vscode.postMessage({ type: 'ready' });
})();
