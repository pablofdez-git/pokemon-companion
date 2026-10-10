(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

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

  function show(className, nodes) {
    root.className = className;
    root.replaceChildren(...nodes);
  }

  function spriteNode(pokemon) {
    if (pokemon.spriteUrl) {
      return el('img', {
        className: 'pokemon-sprite',
        attrs: { src: pokemon.spriteUrl, alt: pokemon.name },
      });
    }
    return el('div', { className: 'sprite-placeholder', text: '?' });
  }

  function titleNode(pokemon) {
    const number = String(pokemon.id).padStart(3, '0');
    return el('p', { className: 'pokemon-name', text: `#${number} ${pokemon.name}` });
  }

  function ballButton(ball, onPick) {
    const icon = el('img', {
      className: 'ball-icon',
      attrs: { src: ball.spriteUrl, alt: '' },
    });
    const info = el('div', {}, [
      el('div', { className: 'ball-name', text: ball.name }),
      el('div', {
        className: 'ball-detail',
        text: `${ball.multiplier} · ${ball.probability}%`,
      }),
    ]);
    const count = el('div', { className: 'ball-count', text: `x${ball.count}` });

    const button = el('button', { className: 'ball-button' }, [icon, info, count]);
    button.addEventListener('click', onPick);
    return button;
  }

  function renderIdle() {
    show('idle', [
      el('p', { className: 'idle-text', text: 'Todo tranquilo por aquí…' }),
      el('p', {
        className: 'hint',
        text: 'Sigue programando: de vez en cuando aparecerá un Pokémon salvaje.',
      }),
    ]);
  }

  function renderEncounter(msg) {
    const messageNode = el('p', { className: 'message', text: msg.message });
    const buttons = [];

    // Tras pulsar, se bloquean todos los botones hasta que llegue el siguiente estado
    function lock(text) {
      buttons.forEach((button) => {
        button.disabled = true;
      });
      messageNode.textContent = text;
    }

    const ballsNode = el('div', { className: 'balls' });
    for (const ball of msg.balls) {
      const button = ballButton(ball, () => {
        lock('Lanzando…');
        vscode.postMessage({ type: 'throw', ballId: ball.id });
      });
      buttons.push(button);
      ballsNode.appendChild(button);
    }

    const flee = el('button', { className: 'flee-button', text: 'Huir' });
    flee.addEventListener('click', () => {
      lock('Huyendo…');
      vscode.postMessage({ type: 'flee' });
    });
    buttons.push(flee);

    show('encounter', [
      spriteNode(msg.pokemon),
      titleNode(msg.pokemon),
      messageNode,
      ballsNode,
      flee,
    ]);
  }

  function renderEnded(msg) {
    show(`ended ${msg.outcome}`, [
      spriteNode(msg.pokemon),
      titleNode(msg.pokemon),
      el('p', { className: 'message', text: msg.message }),
    ]);
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'idle') {
      renderIdle();
    } else if (msg.type === 'encounter') {
      renderEncounter(msg);
    } else if (msg.type === 'ended') {
      renderEnded(msg);
    }
  });

  renderIdle();
  // Avisa a la extensión de que ya puede enviar el estado actual
  vscode.postMessage({ type: 'ready' });
})();
