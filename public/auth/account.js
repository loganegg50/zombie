(function () {
    const script = document.currentScript;
    const optional = script?.dataset.optional === 'true';
    window.addEventListener('keydown', event => {
        if (document.querySelector('[data-game-auth-modal].is-visible') || (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"], [data-game-auth-modal]'))) event.stopImmediatePropagation();
    }, true);
    const modal = new GameAuthUI({ title: '게임나라 통합 로그인', required: !optional });
    const bar = document.createElement('div');
    bar.className = 'game-account-bar';
    bar.setAttribute('data-no-pointer-lock', '');
    const name = document.createElement('span');
    const login = document.createElement('button'); login.textContent = '로그인';
    const logout = document.createElement('button'); logout.textContent = '로그아웃'; logout.hidden = true;
    login.onclick = () => { document.exitPointerLock?.(); modal.show('login'); };
    logout.onclick = async () => { await GameAuth.signOut(); location.reload(); };
    bar.append(name, login, logout); document.body.appendChild(bar);
    let firstUser = null;
    let resolveLogin;
    window.GameLoginReady = new Promise(resolve => { resolveLogin = resolve; });
    window.GameAccount = { user: null, modal, key: key => `${key}:${window.GameAccount.user?.id || 'guest'}` };
    async function update() {
        let user = null;
        try { user = await GameAuth.getCurrentUser(); } catch (_) {
            name.textContent = '로그인 연결을 확인해 주세요';
            if (!firstUser && !optional) modal.show('login');
            return;
        }
        if (firstUser && user?.id !== firstUser) { location.reload(); return; }
        GameAccount.user = user;
        name.textContent = user ? GameAuth.getDisplayName(user) : '로그인이 필요합니다';
        login.hidden = !!user; logout.hidden = !user;
        if (user) {
            firstUser = user.id;
            if (!modal.isRecovering()) modal.hide(true);
            resolveLogin(user);
            document.dispatchEvent(new CustomEvent('game-account-ready', { detail: { user } }));
        } else if (!optional) { document.exitPointerLock?.(); modal.show('login'); }
    }
    GameAuth.ready.then(update);
    GameAuth.onAuthStateChange(() => { setTimeout(update, 0); });
})();
