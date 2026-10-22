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
      ? `${number(entry.id)} ${entry.name} · capturado ${entry.count} ${entry.count === 1 ? 'vez' : 'veces'}${entry.shiny ? ' · tienes su variocolor' : ''}`
      : `${number(entry.id)} · aún no lo has capturado`;

    let className = caught ? 'card caught' : 'card unknown';
    if (entry.shiny) {
      className += ' shiny';
    }
    return el('div', { className, attrs: { title: details } }, children);
  }

  function generationNode(gen) {
    const title = el('h2', {}, [
      el('span', { text: `Gen ${gen.number} · ${gen.name}` }),
      el('span', {
        className: 'gen-count',
        text: gen.unlocked ? `${gen.caught}/${gen.total}` : '🔒 Bloqueada',
      }),
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
    }
  });

  render();
  // Avisa a la extensión de que ya puede enviar los datos
  vscode.postMessage({ type: 'ready' });
})();
