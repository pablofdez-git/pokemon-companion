(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'caught', label: 'Capturados' },
    { id: 'missing', label: 'Me faltan' },
  ];

  // El filtro elegido se recuerda aunque la pestaña se oculte y vuelva
  let filter = (vscode.getState() || {}).filter || 'all';
  let pokedex = null;
  // Ficha abierta: la especie y lo que ha llegado de la PokéAPI (null mientras carga)
  let detail = null;
  let overlay = null;

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

  // Iconos SVG en línea (sin emojis); toman el color del texto
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    lock: [
      ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
      ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
    ],
    close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
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
    for (const [tag, shape] of ICONS[name]) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(shape)) {
        node.setAttribute(key, value);
      }
      svg.appendChild(node);
    }
    return svg;
  }

  function number(id) {
    return `#${String(id).padStart(3, '0')}`;
  }

  function percent(part, total) {
    return total > 0 ? Math.floor((part / total) * 100) : 0;
  }

  function progressBar(part, total) {
    const fill = el('div', { className: 'progress-fill' });
    fill.style.width = `${percent(part, total)}%`;
    return el('div', { className: 'progress' }, [fill]);
  }

  function findEntry(id) {
    if (!pokedex) {
      return null;
    }
    for (const gen of pokedex.generations) {
      const found = gen.entries.find((e) => e.id === id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function times(n) {
    return `${n} ${n === 1 ? 'vez' : 'veces'}`;
  }

  // --- Ficha de una especie ---

  function openDetail(entry) {
    detail = { id: entry.id, info: null };
    renderDetail();
    // La extensión pide a la PokéAPI el tipo y la descripción (aquí no hay acceso a internet)
    vscode.postMessage({ type: 'detail', id: entry.id });
  }

  function closeDetail() {
    detail = null;
    renderDetail();
  }

  function typeChips(entry) {
    // Lo que llega de la PokéAPI manda; mientras tanto, los tipos guardados al capturarlo
    const types = detail.info && detail.info.types ? detail.info.types : entry.types;
    if (types.length === 0) {
      return [el('span', { className: 'muted', text: detail.info ? 'Tipo desconocido' : 'Cargando…' })];
    }
    return types.map((t) => el('span', { className: `chip type-${t.id}`, text: t.name }));
  }

  function descriptionNode() {
    if (!detail.info) {
      return el('p', { className: 'description muted', text: 'Cargando la descripción…' });
    }
    if (!detail.info.description) {
      return el('p', {
        className: 'description muted',
        text: detail.info.offline
          ? 'No se pudo cargar la descripción: hace falta conexión con la PokéAPI.'
          : 'Esta especie no tiene descripción.',
      });
    }
    return el('p', { className: 'description', text: detail.info.description });
  }

  function factRow(label, value) {
    return [el('dt', { text: label }), el('dd', { text: value })];
  }

  function firstCaughtText(entry) {
    if (entry.firstCaughtAt === null) {
      return 'No registrada (lo capturaste antes de que se guardara la fecha)';
    }
    return new Date(entry.firstCaughtAt).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function spriteFigure(url, caption, extraClass) {
    const img = el('img', {
      className: 'detail-sprite',
      attrs: { src: url, alt: '' },
    });
    img.addEventListener('error', () => {
      img.replaceWith(el('div', { className: 'detail-sprite missing-sprite', text: '?' }));
    });
    const parts = [img];
    if (caption) {
      parts.push(el('figcaption', { text: caption }));
    }
    return el('figure', { className: extraClass || '' }, parts);
  }

  function buildOverlay(entry) {
    const normalOwned = entry.count - entry.shinyCount > 0;
    const sprites = [];
    // Los rótulos solo hacen falta cuando hay que distinguir el normal del variocolor
    if (normalOwned) {
      sprites.push(spriteFigure(entry.spriteUrl, entry.shinyCount > 0 ? 'Normal' : ''));
    }
    if (entry.shinyCount > 0) {
      sprites.push(spriteFigure(entry.shinySpriteUrl, 'Variocolor', 'shiny-figure'));
    }

    const facts = [...factRow('Capturado', times(entry.count))];
    if (entry.shinyCount > 0) {
      facts.push(...factRow('Variocolor', times(entry.shinyCount)));
    }
    facts.push(...factRow('Primera captura', firstCaughtText(entry)));

    const close = el('button', { className: 'close', attrs: { 'aria-label': 'Cerrar' } }, [icon('close')]);
    close.addEventListener('click', closeDetail);

    const info = [
      el('p', { className: 'detail-number', text: number(entry.id) }),
      el('h2', { className: 'detail-name', text: entry.name + (entry.shiny ? ' ★' : '') }),
    ];
    if (detail.info && detail.info.genus) {
      info.push(el('p', { className: 'genus', text: detail.info.genus }));
    }
    info.push(el('div', { className: 'chips' }, typeChips(entry)));

    const dialog = el(
      'div',
      { className: 'dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': entry.name } },
      [
        close,
        el('div', { className: 'detail-top' }, [
          el('div', { className: 'detail-sprites' }, sprites),
          el('div', { className: 'detail-info' }, info),
        ]),
        descriptionNode(),
        el('dl', { className: 'facts' }, facts),
      ]
    );

    const node = el('div', { className: 'overlay' }, [dialog]);
    // Pulsar fuera de la ficha la cierra
    node.addEventListener('click', (event) => {
      if (event.target === node) {
        closeDetail();
      }
    });
    return { node, close };
  }

  function renderDetail() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    const entry = detail ? findEntry(detail.id) : null;
    if (detail && (!entry || entry.name === null)) {
      detail = null; // ya no lo tienes (por ejemplo, tras una sincronización)
    }
    document.body.classList.toggle('modal-open', detail !== null);
    if (!detail) {
      return;
    }
    const built = buildOverlay(entry);
    overlay = built.node;
    document.body.appendChild(overlay);
    built.close.focus();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detail) {
      closeDetail();
    }
  });

  // --- Cuadrícula ---

  function headerNode(data) {
    const stats = el('p', {
      className: 'stats',
      text: `${data.caught} de ${data.total} especies (${percent(data.caught, data.total)}%)`,
    });
    if (data.shinies > 0) {
      stats.appendChild(el('span', { className: 'shiny-count', text: ` · ★ ${data.shinies}` }));
    }

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

    return el('header', {}, [
      el('h1', { text: 'Pokédex' }),
      stats,
      progressBar(data.caught, data.total),
      el('div', { className: 'filters' }, buttons),
    ]);
  }

  function cardNode(entry) {
    const caught = entry.name !== null;
    const img = el('img', {
      className: 'sprite',
      attrs: { src: entry.spriteUrl, alt: caught ? entry.name : '', loading: 'lazy' },
    });
    // Si el sprite no existe, queda un interrogante
    img.addEventListener('error', () => {
      img.replaceWith(el('div', { className: 'sprite missing-sprite', text: '?' }));
    });

    const badges = [];
    if (entry.shiny) {
      badges.push(el('span', { className: 'star', text: '★' }));
    }
    if (entry.count > 1) {
      badges.push(el('span', { className: 'count', text: `x${entry.count}` }));
    }

    const children = [
      el('div', { className: 'top' }, [
        el('span', { className: 'number', text: number(entry.id) }),
        el('span', { className: 'badges' }, badges),
      ]),
      img,
      el('span', { className: 'name', text: caught ? entry.name : '???' }),
    ];

    const details = caught
      ? `${number(entry.id)} ${entry.name} · capturado ${times(entry.count)}${entry.shiny ? ' · tienes su variocolor' : ''} · pulsa para ver su ficha`
      : `${number(entry.id)} · aún no lo has capturado`;

    let className = caught ? 'card caught' : 'card unknown';
    if (entry.shiny) {
      className += ' shiny';
    }
    const attrs = { title: details };
    if (caught) {
      attrs.role = 'button';
      attrs.tabindex = '0';
    }
    const card = el('div', { className, attrs }, children);
    if (caught) {
      card.addEventListener('click', () => openDetail(entry));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(entry);
        }
      });
    }
    return card;
  }

  function generationNode(gen) {
    const title = el('h2', {}, [
      el('span', { text: `Gen ${gen.number} · ${gen.name}` }),
      gen.unlocked
        ? el('span', { className: 'gen-count', text: `${gen.caught}/${gen.total}` })
        : el('span', { className: 'gen-count' }, [icon('lock'), document.createTextNode('Bloqueada')]),
    ]);

    if (!gen.unlocked) {
      return el('section', { className: 'generation locked' }, [title]);
    }

    const entries = gen.entries.filter((e) => {
      if (filter === 'caught') {
        return e.name !== null;
      }
      if (filter === 'missing') {
        return e.name === null;
      }
      return true;
    });

    const body =
      entries.length > 0
        ? el('div', { className: 'grid' }, entries.map(cardNode))
        : el('p', {
            className: 'empty',
            text: filter === 'caught' ? 'Aún no has capturado ninguno de esta generación.' : '¡Completada!',
          });

    return el('section', { className: 'generation' }, [
      title,
      progressBar(gen.caught, gen.total),
      body,
    ]);
  }

  function render() {
    if (!pokedex) {
      root.replaceChildren(el('p', { className: 'empty', text: 'Cargando…' }));
      return;
    }
    root.replaceChildren(headerNode(pokedex), ...pokedex.generations.map(generationNode));
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      pokedex = msg.pokedex;
      render();
      if (detail) {
        renderDetail(); // los contadores de la ficha abierta se actualizan solos
      }
    } else if (msg.type === 'detail' && detail && detail.id === msg.id) {
      detail.info = msg;
      renderDetail();
    }
  });

  render();
  // Avisa a la extensión de que ya puede enviar los datos
  vscode.postMessage({ type: 'ready' });
})();
