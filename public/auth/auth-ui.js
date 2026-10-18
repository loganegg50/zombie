(function (global) {
    'use strict';

    const modalMarkup = `
        <div class="game-auth-backdrop" data-game-auth-modal data-no-pointer-lock>
            <section class="game-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="game-auth-title">
                <header class="game-auth-header">
                    <h2 id="game-auth-title">통합 로그인</h2>
                    <button type="button" class="game-auth-close" data-auth-close aria-label="닫기">&#10005;</button>
                </header>
                <div class="game-auth-tabs" role="tablist">
                    <button type="button" class="game-auth-tab is-active" data-auth-tab="login">로그인</button>
                    <button type="button" class="game-auth-tab" data-auth-tab="signup">회원가입</button>
                    <button type="button" class="game-auth-tab" data-auth-tab="reset">비밀번호 재설정</button>
                </div>
                <form class="game-auth-panel is-active" data-auth-panel="login">
                    <label>아이디 또는 이메일<input name="username" autocomplete="username" required></label>
                    <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
                    <button class="game-auth-primary" type="submit">로그인</button>
                    <div class="game-auth-divider"><span>또는</span></div>
                    <button class="game-auth-google" type="button" data-auth-google>G&nbsp;&nbsp;Google로 로그인</button>
                    <p class="game-auth-message" data-auth-message="login" role="alert"></p>
                </form>
                <form class="game-auth-panel" data-auth-panel="signup">
                    <label>아이디<input name="username" autocomplete="username" placeholder="영문, 숫자, 밑줄 2~20자" required></label>
                    <label>비밀번호<input name="password" type="password" autocomplete="new-password" placeholder="6자 이상" required></label>
                    <label>이메일 <small>선택</small><input name="email" type="email" autocomplete="email" placeholder="비밀번호 재설정용"></label>
                    <p class="game-auth-field-hint">이메일을 등록한 계정은 로그인할 때 아이디 대신 이메일을 입력하세요.</p>
                    <button class="game-auth-primary" type="submit">회원가입</button>
                    <p class="game-auth-message" data-auth-message="signup" role="alert"></p>
                </form>
                <form class="game-auth-panel" data-auth-panel="reset">
                    <p class="game-auth-panel-description">가입할 때 실제 이메일을 등록한 계정만 사용할 수 있습니다.</p>
                    <label>가입 이메일<input name="email" type="email" autocomplete="email" required></label>
                    <button class="game-auth-primary" type="submit">재설정 이메일 발송</button>
                    <p class="game-auth-message" data-auth-message="reset" role="alert"></p>
                </form>
                <form class="game-auth-panel" data-auth-panel="recovery">
                    <h3 class="game-auth-panel-title">새 비밀번호 설정</h3>
                    <p class="game-auth-panel-description">앞으로 사용할 새 비밀번호를 입력하세요.</p>
                    <label>새 비밀번호<input name="password" type="password" autocomplete="new-password" placeholder="6자 이상" required></label>
                    <label>새 비밀번호 확인<input name="passwordConfirm" type="password" autocomplete="new-password" required></label>
                    <button class="game-auth-primary" type="submit">비밀번호 변경</button>
                    <p class="game-auth-message" data-auth-message="recovery" role="alert"></p>
                </form>
            </section>
        </div>`;

    class GameAuthUI {
        constructor(options = {}) {
            if (!global.GameAuth) throw new Error('GameAuth가 먼저 로드되어야 합니다.');
            this.options = { title: '통합 로그인', required: false, ...options };
            this.onAuthStateChange = null;
            this.onRecoveryComplete = null;
            this.recoveryMode = false;
            this.modal = document.querySelector('[data-game-auth-modal]');
            if (!this.modal) {
                document.body.insertAdjacentHTML('beforeend', modalMarkup);
                this.modal = document.querySelector('[data-game-auth-modal]');
            }
            this.modal.querySelector('#game-auth-title').textContent = this.options.title;
            this.closeButton = this.modal.querySelector('[data-auth-close]');
            this.tabs = this.modal.querySelector('.game-auth-tabs');
            this.closeButton.hidden = Boolean(this.options.required);
            this.bindEvents();
            this.unsubscribeInternal = global.GameAuth.onAuthStateChange((event) => {
                if (event === 'PASSWORD_RECOVERY') {
                    this.showRecovery();
                    return;
                }
                if (event === 'SIGNED_IN' && !this.recoveryMode) this.hide(true);
                if (event === 'SIGNED_OUT') {
                    this.recoveryMode = false;
                    this.tabs.hidden = false;
                    if (this.options.required) this.show('login');
                }
            });
        }

        bindEvents() {
            this.modal.querySelectorAll('[data-auth-tab]').forEach((button) => {
                button.addEventListener('click', () => this.switchTab(button.dataset.authTab));
            });
            this.closeButton.addEventListener('click', () => this.hide());
            this.modal.addEventListener('click', (event) => {
                if (event.target === this.modal) this.hide();
            });
            this.modal.querySelector('[data-auth-panel="login"]').addEventListener('submit', (event) => this.handleLogin(event));
            this.modal.querySelector('[data-auth-panel="signup"]').addEventListener('submit', (event) => this.handleSignup(event));
            this.modal.querySelector('[data-auth-panel="reset"]').addEventListener('submit', (event) => this.handleReset(event));
            this.modal.querySelector('[data-auth-panel="recovery"]').addEventListener('submit', (event) => this.handleRecovery(event));
            this.modal.querySelector('[data-auth-google]').addEventListener('click', () => this.handleGoogleLogin());
        }

        switchTab(tab) {
            this.clearMessages();
            this.modal.querySelectorAll('[data-auth-tab]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.authTab === tab);
            });
            this.modal.querySelectorAll('[data-auth-panel]').forEach((panel) => {
                panel.classList.toggle('is-active', panel.dataset.authPanel === tab);
            });
        }

        show(tab = 'login') {
            this.switchTab(tab);
            this.modal.classList.add('is-visible');
            const input = this.modal.querySelector(`[data-auth-panel="${tab}"] input`);
            window.setTimeout(() => input?.focus(), 0);
        }

        showRecovery() {
            this.recoveryMode = true;
            this.closeButton.hidden = true;
            this.tabs.hidden = true;
            this.show('recovery');
        }

        isRecovering() {
            return this.recoveryMode;
        }

        hide(force = false) {
            if ((this.options.required || this.recoveryMode) && !force) return;
            this.modal.classList.remove('is-visible');
            this.clearMessages();
        }

        setRequired(required) {
            this.options.required = required;
            this.closeButton.hidden = Boolean(required) || this.recoveryMode;
        }

        clearMessages() {
            this.modal.querySelectorAll('[data-auth-message]').forEach((message) => {
                message.textContent = '';
                message.classList.remove('is-success');
            });
        }

        showMessage(panel, text, success = false) {
            const message = this.modal.querySelector(`[data-auth-message="${panel}"]`);
            message.textContent = text;
            message.classList.toggle('is-success', success);
        }

        setLoading(form, loading) {
            const button = form.querySelector('button[type="submit"]');
            form.querySelectorAll('input, button').forEach((control) => { control.disabled = loading; });
            if (loading) {
                button.dataset.label = button.textContent;
                button.textContent = '처리 중...';
            } else {
                button.textContent = button.dataset.label || button.textContent;
            }
        }

        async handleLogin(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            const username = String(values.get('username') || '').trim();
            const password = String(values.get('password') || '');
            if (!username || !password) {
                this.showMessage('login', '아이디와 비밀번호를 입력하세요.');
                return;
            }
            this.setLoading(form, true);
            try {
                const { error } = await global.GameAuth.signInWithUsername(username, password);
                if (error) throw error;
                form.reset();
                this.hide(true);
            } catch (error) {
                console.error('로그인 에러:', error);
                this.showMessage('login', '아이디 또는 비밀번호가 올바르지 않습니다.');
            } finally {
                this.setLoading(form, false);
            }
        }

        async handleSignup(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            const username = String(values.get('username') || '').trim();
            const password = String(values.get('password') || '');
            const email = String(values.get('email') || '').trim();
            if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
                this.showMessage('signup', '아이디는 영문, 숫자, 밑줄 2~20자로 입력하세요.');
                return;
            }
            if (password.length < 6) {
                this.showMessage('signup', '비밀번호는 6자 이상이어야 합니다.');
                return;
            }
            this.setLoading(form, true);
            try {
                const { data, error } = await global.GameAuth.signUpWithUsername(username, password, email);
                if (error) throw error;
                if (data.session) {
                    form.reset();
                    this.hide(true);
                } else {
                    this.showMessage('signup', '가입 확인 이메일을 확인하세요.', true);
                }
            } catch (error) {
                console.error('회원가입 에러:', error);
                const duplicate = String(error?.message || '').includes('already registered');
                this.showMessage('signup', duplicate ? '이미 사용 중인 아이디 또는 이메일입니다.' : `회원가입 실패: ${error.message}`);
            } finally {
                this.setLoading(form, false);
            }
        }

        async handleGoogleLogin() {
            try {
                const { error } = await global.GameAuth.signInWithGoogle();
                if (error) throw error;
            } catch (error) {
                console.error('Google 로그인 에러:', error);
                this.showMessage('login', `Google 로그인 실패: ${error.message}`);
            }
        }

        async handleReset(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const email = String(new FormData(form).get('email') || '').trim();
            if (!email || email.endsWith(global.GameAuth.fakeEmailDomain)) {
                this.showMessage('reset', '가입할 때 등록한 이메일을 입력하세요.');
                return;
            }
            this.setLoading(form, true);
            try {
                const { error } = await global.GameAuth.resetPassword(email);
                if (error) throw error;
                this.showMessage('reset', '재설정 이메일을 발송했습니다.', true);
            } catch (error) {
                console.error('비밀번호 재설정 에러:', error);
                this.showMessage('reset', `재설정 실패: ${error.message}`);
            } finally {
                this.setLoading(form, false);
            }
        }

        async handleRecovery(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            const password = String(values.get('password') || '');
            const passwordConfirm = String(values.get('passwordConfirm') || '');

            if (password.length < 6) {
                this.showMessage('recovery', '새 비밀번호는 6자 이상이어야 합니다.');
                return;
            }
            if (password !== passwordConfirm) {
                this.showMessage('recovery', '새 비밀번호가 서로 일치하지 않습니다.');
                return;
            }

            this.setLoading(form, true);
            try {
                const { data, error } = await global.GameAuth.updatePassword(password);
                if (error) throw error;

                this.recoveryMode = false;
                this.closeButton.hidden = Boolean(this.options.required);
                this.tabs.hidden = false;
                form.reset();
                this.showMessage('recovery', '비밀번호가 변경되었습니다.', true);
                if (this.onRecoveryComplete) this.onRecoveryComplete(data.user || null);
                window.setTimeout(() => this.hide(true), 1200);
            } catch (error) {
                console.error('비밀번호 변경 에러:', error);
                this.showMessage('recovery', `비밀번호 변경 실패: ${error.message}`);
            } finally {
                this.setLoading(form, false);
            }
        }

        async logout() {
            const { error } = await global.GameAuth.signOut();
            if (error) throw error;
        }

        getCurrentUser() {
            return global.GameAuth.getCurrentUser();
        }

        getUsername(userId) {
            return global.GameAuth.getUsername(userId);
        }

        listenAuthState(callback) {
            return global.GameAuth.onAuthStateChange((event, user) => {
                if (event === 'SIGNED_IN' && user) callback('login', user);
                if (event === 'SIGNED_OUT') callback('logout', null);
            });
        }

        destroy() {
            this.unsubscribeInternal?.();
        }
    }

    global.GameAuthUI = GameAuthUI;
})(window);
