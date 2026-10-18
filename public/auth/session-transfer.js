(function () {
    'use strict';
    const allowedHosts = new Set(['gamenara.co.kr', 'www.gamenara.co.kr', 'game.gamenara.co.kr', 'launcher.gamenara.co.kr', 'sword.gamenara.co.kr', 'zombie.gamenara.co.kr', 'economy.gamenara.co.kr', 'minicraft.gamenara.co.kr', 'survivar.gamenara.co.kr', 'world.gamenara.co.kr', 'minigame.gamenara.co.kr']);
    if (location.protocol === 'http:' && allowedHosts.has(location.hostname)) {
        location.replace('https:' + location.href.slice(location.protocol.length));
        return;
    }
    function trusted(origin) {
        try {
            const url = new URL(origin);
            return (url.protocol === 'https:' && allowedHosts.has(url.hostname)) ||
                (['localhost', '127.0.0.1'].includes(location.hostname) && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:');
        } catch (_) { return false; }
    }
    const children = new Map();
    const nonce = crypto.randomUUID();
    let parentOrigin = null;
    let importing = false;
    const client = GameAuth.getClient();
    function credentials(session) {
        return session ? { access_token: session.access_token, refresh_token: session.refresh_token } : null;
    }
    async function importSession(session) {
        if (!client || importing) return;
        importing = true;
        try {
            if (session?.access_token && session?.refresh_token) {
                const { error } = await client.auth.setSession(session);
                if (error) throw error;
            } else if (session === null) await client.auth.signOut({ scope: 'local' });
        } finally { importing = false; }
    }
    function sendChildren(session) {
        for (const [child, info] of children) {
            if (child.closed) { children.delete(child); continue; }
            if (info.nonce) child.postMessage({ type: 'gamenara:session', nonce: info.nonce, session: credentials(session) }, info.origin);
        }
    }
    let finish;
    const ready = new Promise(resolve => { finish = resolve; });
    GameAuth.setSessionReady(ready);
    const timer = setTimeout(finish, 4000);
    addEventListener('message', async event => {
        if (!trusted(event.origin) || !event.data || !client) return;
        const info = children.get(event.source);
        if (info && info.origin === event.origin && event.data.type === 'gamenara:request' && typeof event.data.nonce === 'string') {
            info.nonce = event.data.nonce;
            const { data, error } = await client.auth.getSession();
            if (!error && !event.source.closed) event.source.postMessage({ type: 'gamenara:session', nonce: info.nonce, session: credentials(data.session) }, info.origin);
        } else if (event.source === window.opener && event.data.nonce === nonce && event.data.type === 'gamenara:session' && (!parentOrigin || event.origin === parentOrigin)) {
            parentOrigin = event.origin;
            try { await importSession(event.data.session); }
            catch (_) { window.dispatchEvent(new Event('game-auth-transfer-error')); }
            finally { clearTimeout(timer); finish(); }
        } else if (info && info.origin === event.origin && event.data.nonce === info.nonce && event.data.type === 'gamenara:refresh') {
            try { await importSession(event.data.session); sendChildren((await client.auth.getSession()).data.session); } catch (_) { /* retain current valid session */ }
        }
    });
    client?.auth.onAuthStateChange((event, session) => {
        if (importing || !['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) return;
        setTimeout(() => {
            sendChildren(session);
            if (event === 'TOKEN_REFRESHED' && parentOrigin && window.opener) window.opener.postMessage({ type: 'gamenara:refresh', nonce, session: credentials(session) }, parentOrigin);
        }, 0);
    });
    if (window.opener) {
        const origins = new Set();
        try { if (document.referrer) origins.add(new URL(document.referrer).origin); } catch (_) {}
        ['https://gamenara.co.kr', 'https://www.gamenara.co.kr', 'https://game.gamenara.co.kr', 'https://launcher.gamenara.co.kr', location.origin].forEach(origin => origins.add(origin));
        for (const origin of origins) if (trusted(origin)) window.opener.postMessage({ type: 'gamenara:request', nonce }, origin);
    } else { clearTimeout(timer); finish(); }
    window.openGameWithLogin = function (destination) {
        const url = new URL(destination, location.href);
        if (allowedHosts.has(url.hostname)) url.protocol = 'https:';
        if (!trusted(url.origin)) throw new Error('허용되지 않은 게임 주소입니다.');
        const child = window.open('about:blank', '_blank');
        if (!child) throw new Error('팝업 차단을 해제한 뒤 다시 실행하세요.');
        children.set(child, { origin: url.origin, nonce: null });
        child.location.href = url.href;
        return child;
    };
})();
