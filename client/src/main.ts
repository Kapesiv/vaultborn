import { Game } from './Game.js';
import type { Gender } from './entities/LocalPlayer.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiOverlay = document.getElementById('ui-overlay')!;

function showLogin() {
  const loginDiv = document.createElement('div');
  loginDiv.id = 'login-screen';
  loginDiv.innerHTML = `
    <h1 style="font-size: 56px; color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.5);">SAAB</h1>
    <p style="color: #aaa; margin-bottom: 24px; font-size: 14px;">3D Multiplayer Dungeon Crawler</p>

    <input type="text" id="player-name" placeholder="Enter your name..." maxlength="20" />

    <div style="margin: 16px 0;">
      <p style="color: #ccc; font-size: 13px; margin-bottom: 8px;">Choose your character:</p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button class="gender-btn selected" data-gender="male" style="
          flex: 1; padding: 14px; font-size: 16px; cursor: pointer;
          background: #2a2a4a; border: 2px solid #ffd700; color: #fff;
          border-radius: 8px; transition: all 0.2s;
        ">
          <div style="font-size: 32px;">&#9794;</div>
          <div style="font-size: 13px; color: #aaa;">Caveman</div>
        </button>
        <button class="gender-btn" data-gender="female" style="
          flex: 1; padding: 14px; font-size: 16px; cursor: pointer;
          background: #1a1a2a; border: 2px solid #555; color: #fff;
          border-radius: 8px; transition: all 0.2s;
        ">
          <div style="font-size: 32px;">&#9792;</div>
          <div style="font-size: 13px; color: #aaa;">Cavewoman</div>
        </button>
      </div>
    </div>

    <button id="play-btn" style="
      width: 100%; padding: 14px; font-size: 22px; font-weight: bold;
      background: #ffd700; color: #000; border: none; border-radius: 8px;
      cursor: pointer; margin-top: 8px;
    ">PLAY</button>

    <p style="color: #555; font-size: 11px; margin-top: 16px; line-height: 1.6;">
      WASD = Move &nbsp;|&nbsp; Mouse = Look &nbsp;|&nbsp; Space = Jump<br/>
      Left Click = Attack &nbsp;|&nbsp; E = Interact &nbsp;|&nbsp; F = Pickup &nbsp;|&nbsp; Q = Leave Dungeon
    </p>
  `;
  uiOverlay.appendChild(loginDiv);

  let selectedGender: Gender = 'male';

  // Gender selection
  const genderBtns = loginDiv.querySelectorAll('.gender-btn');
  genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      genderBtns.forEach(b => {
        (b as HTMLElement).style.borderColor = '#555';
        (b as HTMLElement).style.background = '#1a1a2a';
      });
      (btn as HTMLElement).style.borderColor = '#ffd700';
      (btn as HTMLElement).style.background = '#2a2a4a';
      selectedGender = (btn as HTMLElement).dataset.gender as Gender;
    });
  });

  const nameInput = document.getElementById('player-name') as HTMLInputElement;
  const playBtn = document.getElementById('play-btn') as HTMLButtonElement;

  const startGame = async () => {
    const name = nameInput.value.trim() || 'Adventurer';
    playBtn.disabled = true;
    playBtn.textContent = 'Connecting...';

    try {
      const game = new Game(canvas);
      await game.connect(name, selectedGender);
      loginDiv.remove();
    } catch (err) {
      console.error('Failed to connect:', err);
      playBtn.disabled = false;
      playBtn.textContent = 'RETRY';
      const existing = loginDiv.querySelector('.error-msg');
      if (!existing) {
        const errMsg = document.createElement('p');
        errMsg.className = 'error-msg';
        errMsg.style.color = '#ff4444';
        errMsg.style.fontSize = '13px';
        errMsg.style.marginTop = '8px';
        errMsg.textContent = 'Connection failed. Is the server running?';
        loginDiv.appendChild(errMsg);
      }
    }
  };

  playBtn.addEventListener('click', startGame);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });

  nameInput.focus();
}

showLogin();
