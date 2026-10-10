(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  // Escenario del encuentro actual: se usa para animar el lanzamiento
  let current = null;

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

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    current = null;
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

    const sprite = spriteNode(msg.pokemon);
    const stage = el('div', { className: 'stage' }, [sprite]);
    current = { stage, sprite };

    show('encounter', [stage, titleNode(msg.pokemon), messageNode, ballsNode, flee]);
  }

  function renderEnded(msg) {
    current = null;
    show(`ended ${msg.outcome}`, [
      el('div', { className: 'stage' }, [spriteNode(msg.pokemon)]),
      titleNode(msg.pokemon),
      el('p', { className: 'message', text: msg.message }),
    ]);
  }

  // Posición de la ball ya en el suelo, y su giro de reposo (dos vueltas completas)
  const GROUND = 'translate(0, 45px)';
  const UPRIGHT = 'rotate(720deg)';

  async function playThrow(msg) {
    if (!current) {
      vscode.postMessage({ type: 'throwDone' });
      return;
    }
    const { stage, sprite } = current;
    const ball = el('img', {
      className: 'ball-anim',
      attrs: { src: msg.ballSpriteUrl, alt: '' },
    });
    stage.appendChild(ball);

    try {
      // 1. La ball vuela hacia el Pokémon, girando
      await ball.animate(
        [
          { transform: 'translate(-80px, 110px) rotate(0deg)' },
          { transform: 'translate(-30px, -50px) rotate(360deg)', offset: 0.5 },
          { transform: `translate(0, -5px) ${UPRIGHT}` },
        ],
        { duration: 600, easing: 'ease-out', fill: 'forwards' }
      ).finished;

      // 2. El Pokémon se convierte en un destello y entra en la ball
      await sprite.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
          { transform: 'scale(0.7)', filter: 'brightness(4)', opacity: 0.9, offset: 0.5 },
          { transform: 'scale(0)', filter: 'brightness(8)', opacity: 0 },
        ],
        { duration: 400, easing: 'ease-in', fill: 'forwards' }
      ).finished;

      // 3. La ball cae al suelo y rebota
      await ball.animate(
        [
          { transform: `translate(0, -5px) ${UPRIGHT}` },
          { transform: `${GROUND} ${UPRIGHT}`, offset: 0.6 },
          { transform: `translate(0, 30px) ${UPRIGHT}`, offset: 0.8 },
          { transform: `${GROUND} ${UPRIGHT}` },
        ],
        { duration: 400, easing: 'ease-in', fill: 'forwards' }
      ).finished;

      // 4. Se sacude tantas veces como indique la extensión
      for (let i = 0; i < msg.shakes; i += 1) {
        await wait(250);
        await ball.animate(
          [
            { transform: `${GROUND} ${UPRIGHT}` },
            { transform: 'translate(-4px, 45px) rotate(695deg)' },
            { transform: `${GROUND} ${UPRIGHT}` },
            { transform: 'translate(4px, 45px) rotate(745deg)' },
            { transform: `${GROUND} ${UPRIGHT}` },
          ],
          { duration: 500, easing: 'ease-in-out', fill: 'forwards' }
        ).finished;
      }

      if (msg.caught) {
        // 5a. Captura: un destello en la ball
        await wait(200);
        await ball.animate(
          [
            { transform: `${GROUND} ${UPRIGHT} scale(1)`, filter: 'brightness(1)' },
            { transform: `${GROUND} ${UPRIGHT} scale(1.3)`, filter: 'brightness(2.5)' },
            { transform: `${GROUND} ${UPRIGHT} scale(1)`, filter: 'brightness(1)' },
          ],
          { duration: 500, fill: 'forwards' }
        ).finished;
      } else {
        // 5b. Se ha resistido: la ball se abre y el Pokémon reaparece
        await wait(150);
        ball.animate(
          [
            { transform: `${GROUND} ${UPRIGHT} scale(1)`, opacity: 1 },
            { transform: `${GROUND} ${UPRIGHT} scale(1.8)`, opacity: 0 },
          ],
          { duration: 250, fill: 'forwards' }
        );
        await sprite.animate(
          [
            { transform: 'scale(0)', filter: 'brightness(8)', opacity: 0 },
            { transform: 'scale(1.15)', filter: 'brightness(3)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
          ],
          { duration: 400, fill: 'forwards' }
        ).finished;
        ball.remove();
      }
    } catch (error) {
      // Si algo interrumpe la animación, el juego sigue igualmente
      console.error('Animación interrumpida', error);
    } finally {
      vscode.postMessage({ type: 'throwDone' });
    }
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'idle') {
      renderIdle();
    } else if (msg.type === 'encounter') {
      renderEncounter(msg);
    } else if (msg.type === 'ended') {
      renderEnded(msg);
    } else if (msg.type === 'playThrow') {
      void playThrow(msg);
    }
  });

  renderIdle();
  // Avisa a la extensión de que ya puede enviar el estado actual
  vscode.postMessage({ type: 'ready' });
})();
