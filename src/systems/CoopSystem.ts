import type { Game } from '../Game';

// Presence is only lobby discovery. Combat and snapshots are owned by the room host.
export class CoopSystem {
  readonly roomId = crypto.randomUUID();
  readonly peerId = crypto.randomUUID();
  isGuest = false;
  private client = window.GameAuth.getClient();
  private lobby: any;
  private room: any;
  private hostId: string | null = null;
  private panel = document.createElement('section');
  private peers = new Map<string, { name: string; seen: number }>();
  private lastSnapshot = 0;
  private lastSend = 0;
  private connected = false;
  private joining = false;
  private lastPresence = '';
  private hostSnapshot: any = null;
  private user = window.GameAccount.user!;

  constructor(private game: Game) {
    this.panel.id = 'coop-panel';
    this.panel.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);width:min(520px,94vw);max-height:30vh;overflow:auto;z-index:60;background:#102033ed;color:white;border:1px solid #65d1af;border-radius:12px;padding:12px;font:14px sans-serif;display:none;pointer-events:auto';
    document.body.appendChild(this.panel);
    this.lobby = this.client.channel('zombie-lobby-v1', { config: { presence: { key: this.peerId } } });
    this.lobby.on('presence', { event: 'sync' }, () => this.renderLobby()).subscribe((status: string) => {
      this.connected = status === 'SUBSCRIBED';
      if (this.connected) { this.lastPresence = ''; this.publishPresence(); }
      else this.panel.style.display = 'none';
    });
    this.openHostRoom();
    setInterval(() => { this.publishPresence(); this.expirePeers(); }, 1000);
    addEventListener('beforeunload', () => { this.client.removeAllChannels(); });
  }

  private openHostRoom(): void {
    this.hostId = this.peerId;
    this.room = this.client.channel(`zombie-coop:${this.roomId}`);
    this.room.on('broadcast', { event: 'peer' }, ({ payload }: any) => {
      if (this.isGuest || !this.game.coopStatus().playing || !payload || payload.host !== this.peerId || typeof payload.id !== 'string' || payload.id === this.peerId) return;
      if (!this.peers.has(payload.id) && this.peers.size >= 3) return;
      if (!this.game.receiveCoopPeer(payload)) return;
      this.peers.set(payload.id, { name: String(payload.name || '플레이어').slice(0, 24), seen: Date.now() });
    }).subscribe();
  }

  private publishPresence(): void {
    if (!this.connected) return;
    const status = this.game.coopStatus();
    const presence = { id: this.peerId, user: this.user.id, room: this.roomId, name: window.GameAuth.getDisplayName(this.user), playing: status.playing && !this.isGuest, wave: status.wave, count: this.peers.size + 1 };
    const serialized = JSON.stringify(presence);
    if (serialized !== this.lastPresence) { this.lastPresence = serialized; void this.lobby.track(presence); }
    this.renderLobby();
  }

  private renderLobby(): void {
    if (this.isGuest || this.joining) return;
    this.panel.replaceChildren();
    if (this.game.coopStatus().playing) { this.panel.style.display = 'none'; return; }
    const rooms = Object.values(this.lobby.presenceState()).flat() as any[];
    const available = rooms.filter(r => r.playing === true && r.user !== this.user.id && r.count < 4 && /^[\w-]{1,64}$/.test(r.room) && typeof r.id === 'string');
    this.panel.style.display = available.length ? 'block' : 'none';
    if (!available.length) return;
    const title = document.createElement('strong'); title.textContent = '다른 사람과 같이 플레이'; this.panel.appendChild(title);
    for (const room of available) {
      const button = document.createElement('button');
      button.textContent = `${String(room.name).slice(0, 24)} · 웨이브 ${Number(room.wave) || 1} · 함께 플레이`;
      button.style.cssText = 'display:block;width:100%;padding:10px;margin-top:8px;border:0;border-radius:6px;background:#65d1af;color:#102033;cursor:pointer';
      button.onclick = () => void this.join(room);
      this.panel.appendChild(button);
    }
  }

  private async join(host: any): Promise<void> {
    if (this.joining || this.isGuest || this.game.coopStatus().playing) return;
    this.joining = true;
    this.panel.textContent = '진행 중인 게임에 연결하고 있습니다…';
    await this.client.removeChannel(this.room);
    this.hostId = host.id;
    this.room = this.client.channel(`zombie-coop:${host.room}`);
    this.room.on('broadcast', { event: 'state' }, ({ payload }: any) => {
      if (!payload || payload.host !== this.hostId || !Array.isArray(payload.zombies) || payload.zombies.length > 500 || !Array.isArray(payload.players)) return;
      if (!payload.players.some((p: any) => p.id === this.peerId)) return;
      if (!this.game.validCoopSnapshot(payload)) return;
      this.lastSnapshot = Date.now();
      this.hostSnapshot = payload;
      if (!this.isGuest) {
        this.joining = false;
        this.isGuest = true;
        this.game.enterCoopGuest();
        this.publishPresence();
      }
      this.game.applyCoopSnapshot(payload, this.peerId);
      this.panel.replaceChildren();
      const ownPlayer = payload.players.find((p: any) => p.id === this.peerId);
      const status = ownPlayer?.hp <= 0 ? '전투 불능 · 관전 중' : payload.phase === 'PAUSED' ? '방장 일시정지' : '함께 플레이 중';
      const label = document.createElement('span'); label.textContent = `${status} · 웨이브 ${payload.wave} · ${payload.players.length}명 `;
      const leave = document.createElement('button'); leave.textContent = '나가기'; leave.onclick = () => location.reload();
      this.panel.append(label, leave);
    }).subscribe((status: string) => {
      if (status === 'SUBSCRIBED') this.sendPeer(false);
    });
    setTimeout(() => {
      if (this.joining) {
        this.joining = false;
        this.panel.textContent = '참가할 수 없습니다. 방이 종료되었거나 인원이 가득 찼습니다.';
        void this.client.removeChannel(this.room).then(() => this.openHostRoom());
      }
    }, 7000);
  }

  tick(attack: boolean): void {
    const now = performance.now();
    if (this.isGuest && this.lastSnapshot && Date.now() - this.lastSnapshot > 10000) {
      this.panel.textContent = '방장과 연결이 끊겼습니다. 잠시 후 시작 화면으로 돌아갑니다.';
      setTimeout(() => location.reload(), 1500); this.lastSnapshot = 0;
    }
    if (now - this.lastSend < 100 && !attack) return;
    this.lastSend = now;
    if (this.isGuest || this.joining) this.sendPeer(attack && this.isGuest);
    else if (this.peers.size) {
      void this.room.send({ type: 'broadcast', event: 'state', payload: this.game.coopSnapshot(this.peerId) });
    }
  }

  private sendPeer(attack: boolean): void {
    if (!this.hostId || !this.room) return;
    void this.room.send({ type: 'broadcast', event: 'peer', payload: { ...this.game.coopLocalPlayer(), id: this.peerId, host: this.hostId, name: window.GameAuth.getDisplayName(this.user), attack } });
  }

  private expirePeers(): void {
    for (const [id, peer] of this.peers) if (Date.now() - peer.seen > 10000) { this.peers.delete(id); this.game.removeCoopPeer(id); }
    if (this.isGuest && ['GAMEOVER', 'PREGAME'].includes(this.hostSnapshot?.phase)) { this.panel.textContent = '협동 게임이 종료되었습니다.'; setTimeout(() => location.reload(), 2000); this.hostSnapshot = null; }
  }
}
