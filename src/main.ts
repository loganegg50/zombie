import { Game } from './Game';

window.GameLoginReady.then(() => {
    const game = new Game();
    game.init();
    game.start();
});
