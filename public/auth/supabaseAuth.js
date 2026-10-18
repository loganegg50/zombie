(function (global) {
    'use strict';

    const config = Object.freeze({
        url: 'https://bkmgrcnrtsdfyotfkcqt.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWdyY25ydHNkZnlvdGZrY3F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NTQyNTYsImV4cCI6MjA4NTMzMDI1Nn0.ZUuOuOc3NOokPMn1tFY08Ufj5THykmo62QWUvBQSAeI',
    });

    const fakeEmailDomain = '@' + config.url.replace(/^https?:\/\//, '');
    let client = null;
    let sessionReady = Promise.resolve();

    function getClient() {
        if (client) return client;
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            console.warn('Supabase SDK가 로드되지 않았습니다.');
            return null;
        }

        // 기본 storage key를 유지해 기존 sword game 로그인 세션도 그대로 복원한다.
        client = global.supabase.createClient(config.url, config.anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
        return client;
    }

    function requireClient() {
        const current = getClient();
        if (!current) throw new Error('인증 서버에 연결할 수 없습니다.');
        return current;
    }

    function usernameToEmail(usernameOrEmail) {
        const value = String(usernameOrEmail || '').trim();
        return value.includes('@') ? value : `${value}${fakeEmailDomain}`;
    }

    function getDisplayName(user) {
        if (!user) return '';
        return user.user_metadata?.username
            || user.user_metadata?.full_name
            || user.email?.split('@')[0]
            || '플레이어';
    }

    async function getSession() {
        await sessionReady;
        const sb = getClient();
        if (!sb) return null;
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        return data.session || null;
    }

    async function getCurrentUser() {
        await sessionReady;
        const sb = getClient();
        if (!sb) return null;
        const { data, error } = await sb.auth.getUser();
        if (error) {
            if (error.name === 'AuthSessionMissingError') return null;
            throw error;
        }
        return data.user || null;
    }

    async function signInWithUsername(username, password) {
        return requireClient().auth.signInWithPassword({
            email: usernameToEmail(username),
            password,
        });
    }

    async function signUpWithUsername(username, password, email) {
        const loginEmail = String(email || '').trim() || usernameToEmail(username);
        return requireClient().auth.signUp({
            email: loginEmail,
            password,
            options: {
                data: { username: String(username || '').trim() },
            },
        });
    }

    async function signInWithGoogle() {
        const redirect = new URL(global.location.href);
        redirect.hash = '';
        return requireClient().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: redirect.toString() },
        });
    }

    async function resetPassword(email) {
        const redirect = new URL(global.location.href);
        redirect.hash = '';
        return requireClient().auth.resetPasswordForEmail(email, {
            redirectTo: redirect.toString(),
        });
    }

    async function updatePassword(password) {
        return requireClient().auth.updateUser({ password });
    }

    async function signOut() {
        return requireClient().auth.signOut();
    }

    function onAuthStateChange(callback) {
        const sb = getClient();
        if (!sb) return function () {};
        const { data } = sb.auth.onAuthStateChange((event, session) => {
            callback(event, session?.user || null, session || null);
        });
        return function unsubscribe() {
            data.subscription.unsubscribe();
        };
    }

    async function requireLogin() {
        return getCurrentUser();
    }

    async function getUsername(userId) {
        const sb = getClient();
        if (!sb) return null;
        const { data, error } = await sb
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single();
        if (error) {
            console.error('프로필 조회 에러:', error.message);
            return null;
        }
        return data?.username || null;
    }

    global.GameAuth = Object.freeze({
        setSessionReady(promise) { sessionReady = promise; },
        get ready() { return sessionReady; },
        config,
        fakeEmailDomain,
        getClient,
        getSession,
        getCurrentUser,
        getDisplayName,
        getUsername,
        signInWithUsername,
        signUpWithUsername,
        signInWithGoogle,
        resetPassword,
        updatePassword,
        signOut,
        onAuthStateChange,
        requireLogin,
    });
})(window);
