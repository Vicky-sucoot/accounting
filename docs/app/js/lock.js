/* 多幣記帳 網頁版：App 鎖定（密碼、Face ID） */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= App 鎖定 =======================
function lockConfig() { return lsGet('pl.lock', { mode: 'off' }); }
function setLockConfig(c) { lsSet('pl.lock', c); }
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyPasscode(code) { const c = lockConfig(); return !!c.hash && (await sha256(c.salt + code)) === c.hash; }
async function biometricAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
}
/** 以 WebAuthn 平台驗證器（Face ID／Touch ID）建立本機憑證，只用來確認是本人 */
async function registerBiometric() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: '多幣記帳', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: '多幣記帳', displayName: '多幣記帳 App 鎖定' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000
    }
  });
  return b64url(cred.rawId);
}
async function verifyBiometric() {
  const c = lockConfig(); if (!c.credId) return false;
  try {
    const r = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: fromB64url(c.credId) }], userVerification: 'required', timeout: 60000 } });
    return !!r;
  } catch (e) { return false; }
}
function showLock() {
  const c = lockConfig();
  if (c.mode === 'off') return;
  const host = $('#lock');
  passcodePad(host, '輸入 App 密碼', async code => {
    if (await verifyPasscode(code)) { host.hidden = true; host.replaceChildren(); return true; }
    return false;
  }, c.mode === 'faceid' ? { label: '使用 Face ID 解鎖', run: async () => { if (await verifyBiometric()) { host.hidden = true; host.replaceChildren(); } } } : null, '🔒', '多幣記帳已鎖定');
  host.hidden = false;
}
/** 6 位數密碼鍵盤；onDone 回傳 true 表示通過 */
function passcodePad(host, title, onDone, bio, logo, heading, errText) {
  let code = '';
  host.innerHTML = '<div class="lockbox">' + (logo ? '<div class="logo">' + logo + '</div>' : '') + (heading ? '<b style="font-size:19px">' + esc(heading) + '</b>' : '') +
    '<div>' + esc(title) + '</div><div class="dots">' + '<i></i>'.repeat(6) + '</div><div class="lockerr"></div>' +
    '<div class="pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? '<button data-p="' + k + '" class="' + (k === '⌫' ? 'ghost' : '') + '" aria-label="' + (k === '⌫' ? '刪除' : k) + '">' + k + '</button>' : '<span></span>').join('') + '</div>' +
    (bio ? '<button class="btn" data-k="bio">' + esc(bio.label) + '</button>' : '') + '</div>';
  const dots = $$('.dots i', host), err = $('.lockerr', host);
  const draw = () => dots.forEach((d, i) => d.classList.toggle('f', i < code.length));
  $$('[data-p]', host).forEach(b => {
    b.onclick = async () => {
      const k = b.dataset.p;
      if (k === '⌫') { code = code.slice(0, -1); draw(); return; }
      if (code.length >= 6) return;
      err.textContent = ''; code += k; draw();
      if (code.length === 6) {
        const ok = await onDone(code);
        if (!ok) { err.textContent = errText || '密碼錯誤，請再試一次'; if (navigator.vibrate) navigator.vibrate(80); }
        code = ''; draw();
      }
    };
  });
  if (bio) { $('[data-k=bio]', host).onclick = bio.run; }
}
function openLockSettings() {
  pushPage({
    title: 'App 鎖定',
    async render(body) {
      const c = lockConfig();
      const bioOK = await biometricAvailable();
      const opt = (m, label, disabled) => '<button class="row" data-m="' + m + '"' + (disabled ? ' disabled style="opacity:.45"' : '') + '><span class="k">' + label + '</span>' + (c.mode === m ? '<span class="accent">✓</span>' : '') + '</button>';
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>鎖定方式</span></div><div class="group">' +
        opt('off', '不鎖定') + opt('passcode', 'App 密碼（6 位數）') + opt('faceid', 'Face ID／Touch ID（以 App 密碼備援）', !bioOK) + '</div>' +
        '<div class="sec-f">' + (bioOK ? '啟用 Face ID 時需同時設定 6 位數 App 密碼，作為辨識失敗時的備援。App 切到背景後會自動上鎖。Face ID 透過瀏覽器的通行金鑰（passkey）功能驗證，系統可能會把它存到 iCloud 鑰匙圈；這把金鑰只用來確認是本人，不含任何記帳資料。' :
          '此裝置或瀏覽器目前無法使用 Face ID（未支援或未設定），請改用 App 密碼。') + '</div></div>' +
        (c.mode !== 'off' ? '<div class="sec"><div class="group"><button class="row accent" data-k="change">變更 App 密碼</button></div><div class="sec-f">密碼只存在這台裝置，不包含在備份檔。忘記密碼又無法使用 Face ID 時，只能清除網站資料（記帳資料會一併刪除），請定期備份。</div></div>' : '');
      $$('[data-m]', body).forEach(b => { b.onclick = () => selectMode(b.dataset.m); });
      const ch = $('[data-k=change]', body);
      if (ch) ch.onclick = () => verifyThen(() => setupPasscode(code => { const cc = lockConfig(); cc.salt = randHex(16); sha256(cc.salt + code).then(h => { cc.hash = h; setLockConfig(cc); toast('已變更 App 密碼'); }); }));
    }
  });
  function selectMode(m) {
    const c = lockConfig();
    if (m === c.mode) return;
    if (m === 'off') return verifyThen(() => { setLockConfig({ mode: 'off' }); rerenderTop(); toast('已關閉 App 鎖定'); });
    const enable = async code => {
      const cc = code ? { mode: m, salt: randHex(16) } : Object.assign(lockConfig(), { mode: m });
      if (code) cc.hash = await sha256(cc.salt + code);
      if (m === 'faceid') {
        try { cc.credId = await registerBiometric(); } catch (e) { toast('無法啟用 Face ID：' + (e.message || '已取消')); setLockConfig(Object.assign(cc, { mode: 'passcode' })); rerenderTop(); return; }
      }
      setLockConfig(cc); rerenderTop(); toast('已啟用 App 鎖定');
    };
    if (c.mode === 'off' || !c.hash) setupPasscode(enable);
    else verifyThen(() => enable(null));
  }
}
function verifyThen(fn) {
  const c = lockConfig();
  pushPage({
    title: '驗證身分', leftLabel: '取消',
    render(body) {
      passcodePad(body, '輸入目前的 App 密碼', async code => {
        if (await verifyPasscode(code)) { popPage(); fn(); return true; }
        return false;
      }, c.mode === 'faceid' ? { label: '使用 Face ID 驗證', run: async () => { if (await verifyBiometric()) { popPage(); fn(); } } } : null);
    }
  });
}
function setupPasscode(onDone) {
  let first = null;
  pushPage({
    title: '設定 App 密碼', leftLabel: '取消',
    render(body) {
      passcodePad(body, first ? '再次輸入以確認' : '設定 6 位數 App 密碼', async code => {
        if (!first) { first = code; rerenderTop(); return true; }
        if (code !== first) { first = null; setTimeout(rerenderTop, 900); return false; }
        popPage(); await onDone(code); return true;
      }, null, null, null, '兩次輸入不一致，請重新設定');
    }
  });
}
