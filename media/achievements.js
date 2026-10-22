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


  // Iconos SVG en línea (trazo de 24x24, toman el color del texto); sin emojis
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    trophy: [
      ['path', { d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3' }],
    ],
    gift: [
      ['rect', { x: 3, y: 8, width: 18, height: 4, rx: 1 }],
      ['path', { d: 'M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5' }],
    ],
    check: [['path', { d: 'M20 6 9 17l-5-5' }]],
    lock: [
      ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
      ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
    ],
    target: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['circle', { cx: 12, cy: 12, r: 5 }],
      ['circle', { cx: 12, cy: 12, r: 1 }],
    ],
    book: [['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5' }]],
    flame: [['path', { d: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z' }]],
    code: [['path', { d: 'M8 7l-5 5 5 5M16 7l5 5-5 5' }]],
    coin: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['circle', { cx: 12, cy: 12, r: 5 }],
    ],
    leaf: [['path', { d: 'M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16zM4 21c3-5 6-8 11-11' }]],
    'arrow-up': [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['path', { d: 'M12 16V8M8.5 11.5 12 8l3.5 3.5' }],
    ],
    sparkle: [['path', { d: 'M12 3l2.1 6.4L21 12l-6.9 2.6L12 21l-2.1-6.4L3 12l6.9-2.6z' }]],
    map: [['path', { d: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14' }]],
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'icon',
      'aria-hidden': 'true',
    };
    for (const [key, value] of Object.entries(attrs)) {
      svg.setAttribute(key, value);
    }
    for (const [tag, shape] of ICONS[name] || []) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(shape)) {
        node.setAttribute(key, value);
      }
      svg.appendChild(node);
    }
    return svg;
  }

  // Un icono seguido de un texto
  function withIcon(name, text) {
    return [icon(name), document.createTextNode(text)];
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
      summary.appendChild(document.createTextNode(' · '));
      summary.appendChild(
        el('span', { className: 'pending' }, withIcon('gift', `${text} esperando en el próximo guardado`))
      );
    }

    return el('header', {}, [
      el('div', { className: 'banner' }, [
        el('div', { className: 'pokeball-deco', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'banner-text' }, [
          el('h1', {}, withIcon('trophy', 'Logros')),
          summary,
          progressBar(data.done, data.total, 'big'),
        ]),
      ]),
      el('div', { className: 'filters' }, buttons),
    ]);
  }

  function cardNode(a) {
    const status = a.done
      ? el(
          'span',
          { className: a.claimed ? 'badge done' : 'badge reward' },
          a.claimed ? withIcon('check', 'Conseguido') : withIcon('gift', 'Recompensa pendiente')
        )
      : el('span', { className: 'badge locked' }, withIcon('lock', 'Por conseguir'));

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
        el('span', { className: 'group-name' }, withIcon(group.icon, group.name)),
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
