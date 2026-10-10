(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  // Lado máximo, en píxeles, del recuadro donde se dibuja el Pokémon
  const BOX = 140;

  // Escenario del encuentro actual: se usa para animar el lanzamiento
  let current = null;
  // Detiene la cuenta atrás del encuentro actual, si hay una en marcha
  let stopCountdown = null;
  let throwing = false;

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
    if (stopCountdown) {
      stopCountdown();
      stopCountdown = null;
    }
    root.className = className;
    root.replaceChildren(...nodes);
  }

  function spriteNode(pokemon) {
    const animated = pokemon.animatedSpriteUrl;
    const source = animated || pokemon.spriteUrl;
    if (!source) {
      return el('div', { className: 'sprite-placeholder', text: '?' });
    }

    const img = el('img', {
      className: animated ? 'pokemon-sprite animated' : 'pokemon-sprite bob',
      attrs: { src: source, alt: pokemon.name },
    });
    if (!animated) {
      return img;
    }

    let usingAnimated = true;

    // Los sprites animados vienen a su tamaño real, muy distinto de uno a otro:
    // se amplían un número entero de veces para que sigan nítidos y conserven proporciones
    img.addEventListener('load', () => {
      if (!usingAnimated) {
        return;
      }
      const largest = Math.max(img.naturalWidth, img.naturalHeight, 1);
      const scale = Math.max(1, Math.min(4, Math.floor(BOX / largest)));
      img.style.width = `${img.naturalWidth * scale}px`;
      img.style.height = `${img.naturalHeight * scale}px`;
    });

    // Si el sprite animado no carga, se usa el estático
    img.addEventListener('error', () => {
      if (!usingAnimated || !pokemon.spriteUrl) {
        return;
      }
      usingAnimated = false;
      img.style.width = '';
      img.style.height = '';
      img.className = 'pokemon-sprite bob';
      img.src = pokemon.spriteUrl;
    });

    return img;
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

  // Barra con el tiempo que queda. Devuelve null si la extensión no mandó el plazo.
  function countdownNode(msg) {
    if (typeof msg.deadline !== 'number' || !msg.timeoutMs) {
      return null;
    }
    const fill = el('div', { className: 'timer-fill' });
    const track = el('div', { className: 'timer' }, [fill]);

    // Se arranca cuando la barra ya está en pantalla; devuelve la función que la detiene
    function start() {
      const remaining = Math.max(0, msg.deadline - Date.now());
      const startScale = Math.min(1, remaining / msg.timeoutMs);

      const animation = fill.animate(
        [{ transform: `scaleX(${startScale})` }, { transform: 'scaleX(0)' }],
        { duration: remaining, easing: 'linear', fill: 'forwards' }
      );
      // Cuando queda el 25% del tiempo, la barra cambia de color
      const lowTimer = setTimeout(
        () => fill.classList.add('low'),
        Math.max(0, remaining - msg.timeoutMs * 0.25)
      );

      return function stop() {
        animation.cancel();
        clearTimeout(lowTimer);
        track.classList.add('stopped');
      };
    }

    return { track, start };
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

    // Tras pulsar, se bloquean los botones y se para la cuenta atrás
    function lock(text) {
      buttons.forEach((button) => {
        button.disabled = true;
      });
      if (stopCountdown) {
        stopCountdown();
        stopCountdown = null;
      }
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

    const countdown = countdownNode(msg);
    const nodes = [stage, titleNode(msg.pokemon), messageNode];
    if (countdown) {
      nodes.push(countdown.track);
    }
    nodes.push(ballsNode, flee);

    show('encounter', nodes);
    stopCountdown = countdown ? countdown.start() : null;
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
    if (throwing) {
      return; // ya hay un lanzamiento en marcha: no se repite
    }
    throwing = true;

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
      throwing = false;
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
