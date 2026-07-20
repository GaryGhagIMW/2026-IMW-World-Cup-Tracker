import { GAME_CONFIG } from './data/config.js';

function renderArchivedPage() {
  return `
    <main class="archived-main">
      <section class="archived-card">
        <p class="archived-kicker">2026 IMW World Cup Pool</p>
        <h1>Pool closed</h1>
        <p class="archived-lead">
          This tracker is archived. The tournament is over — Mali Lombard won the pool,
          Abner Chinchilla won the group stage, and Spain won the World Cup 1–0.
        </p>
        <p class="archived-muted">
          Thank you to everyone who played. This repository and site are no longer maintained.
        </p>
        <p class="archived-footer-note">
          <a href="${GAME_CONFIG.website}" target="_blank" rel="noopener">${GAME_CONFIG.organization}</a>
        </p>
      </section>
    </main>`;
}

function render() {
  document.body.classList.add('archived-page');
  document.getElementById('app').innerHTML = renderArchivedPage();
}

render();
