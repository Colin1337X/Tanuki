import * as pgp from './vendor/openpgp.min.mjs';
import { recipientCrypto, ChunkAssembler } from './recipient-crypto.js';
const cryptoBox = recipientCrypto(pgp);
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
let vault;

export async function openWorkspace({ user, api, dialog, esc, notify }) {
  const prefix = `tanuki-vault:${user.username}:`, stored = () => JSON.parse(localStorage.getItem(prefix + 'device') || 'null');
  const pinKey = (name, fp) => `${name}:${fp}`;
  const pins = () => JSON.parse(localStorage.getItem(prefix + 'pins') || '{}');
  if (vault?.username !== user.username) vault = undefined;
  let info = await api('/protected'), stopped = false;
  async function command(action, payload = {}) {
    if (!vault) throw new Error('Unlock your device first.');
    const command = { v: 1, username: user.username, device: vault.fingerprint, nonce: random(), time: Date.now(), action, payload };
    return api('/protected', { command, signature: await cryptoBox.sign(vault.key, JSON.stringify(command)) });
  }
  const run = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { notify(error.message); } };
  function bind(id, fn) { document.getElementById(id)?.addEventListener('click', run(fn)); }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function unlock(backup, secret) {
    if (!backup || backup.username !== user.username) throw new Error('This backup belongs to another account.');
    const key = await cryptoBox.unlock(backup.privateKey, secret), publicKey = await cryptoBox.publicKey(backup.publicKey);
    if (key.getFingerprint() !== publicKey.getFingerprint()) throw new Error('Backup identity mismatch.');
    vault = { ...backup, key, fingerprint: key.getFingerprint() }; localStorage.setItem(prefix + 'device', JSON.stringify(backup));
  }
  function recipientList() {
    const selected = [{ username: user.username, fingerprint: vault.fingerprint, publicKey: vault.publicKey }];
    if (document.getElementById('vault-mode').value === 'classroom') {
      const name = document.getElementById('vault-teacher').value;
      const d = info.devices.find(d => d.fingerprint === name && d.username !== user.username);
      if (!d || !pins()[pinKey(d.username, d.fingerprint)]) throw new Error('Verify the teacher fingerprint through a separate trusted channel first.');
      selected.push(d);
    }
    return selected;
  }
  async function render() {
    info = await api('/protected');
    const backup = stored();
    dialog('Encrypted workspace · preview', `<p>Private drafts are encrypted here before upload. AI generation sends your prompt to the server and provider; its stored responses are encrypted for selected devices.</p>
      <p class="muted">Preview feature. Keep your recovery secret and encrypted backup. A password reset cannot decrypt your work. The server still supplies this page’s code.</p>
      ${!vault ? `<label for="vault-secret">Recovery secret</label><input id="vault-secret" type="password" autocomplete="off"><button id="vault-unlock" class="primary-button" ${backup ? '' : 'disabled'}>Unlock saved device</button>
        <button id="vault-create" class="soft-button" ${backup ? 'disabled' : ''}>Create device</button><label for="vault-import">Import encrypted device backup</label><input id="vault-import" type="file" accept="application/json">`
        : `<p>Device fingerprint: <code>${esc(vault.fingerprint)}</code></p><button id="vault-backup" class="soft-button">Download encrypted backup</button><button id="vault-lock" class="quiet-button">Lock device</button>
        <details><summary>Enroll or remove devices</summary><label for="vault-new-public">New device’s public key (from its trusted screen)</label><textarea id="vault-new-public" rows="3"></textarea><button id="vault-enroll" class="soft-button">Authorize new device</button><button id="vault-public" class="soft-button">Show this public key</button><button id="vault-revoke" class="quiet-button">Revoke this device</button></details>
        <details><summary>Verify a recipient identity</summary><p>Ask the recipient in person or through an independently authenticated channel. Do not copy a fingerprint from this server and treat it as verified.</p>
        <label for="vault-pin-user">Recipient account</label><input id="vault-pin-user"><label for="vault-pin-fp">Externally verified fingerprint</label><input id="vault-pin-fp" maxlength="64"><button id="vault-pin" class="soft-button">Pin verified identity</button></details>
        <label for="vault-mode">Privacy</label><select id="vault-mode"><option value="private">Private Draft · this device</option><option value="classroom">Classroom Story · this device and verified teacher</option></select>
        <label for="vault-teacher">Designated teacher device</label><select id="vault-teacher"><option value="">Choose a verified teacher</option>${info.devices.filter(d => d.username !== user.username).map(d => `<option value="${esc(d.fingerprint)}">${esc(d.username)} · ${esc(d.fingerprint.slice(0, 12))}</option>`).join('')}</select>
        <label for="vault-text">Draft or explicitly disclosed AI prompt</label><textarea id="vault-text" rows="6" maxlength="100000"></textarea>
        <button id="vault-save" class="primary-button">Save encrypted draft</button><label><input id="vault-consent" type="checkbox">I authorize sending this text to the server and AI provider.</label>
        <button id="vault-generate" class="soft-button">Generate encrypted response</button><button id="vault-resume" class="soft-button">Resume last generation</button><button id="vault-cancel" class="quiet-button">Cancel generation at provider</button>
        <p id="vault-status" role="status"></p><pre id="vault-output" class="vault-output"></pre><h3>Authorized encrypted documents</h3><div id="vault-documents"></div>`}`);
    document.getElementById('modal').classList.add('protected-workspace');
    document.getElementById('modal').addEventListener('close', () => { stopped = true; }, { once: true });
    stopped = false;
    bind('vault-create', async () => {
      const secret = random(), pair = await cryptoBox.generate(secret), backup = { v: 1, username: user.username, publicKey: pair.publicKey, privateKey: pair.privateKey };
      await unlock(backup, secret);
      // Show recovery material before any network operation can fail. Never overwrite an existing backup.
      download('tanuki-encrypted-device.json', backup);
      dialog('Save your recovery secret', `<p>Store this secret offline, separately from your encrypted backup. It is not saved by the app. Closing without saving can permanently lose access.</p><code id="vault-new-secret">${esc(secret)}</code><button id="vault-finish-enrollment" class="primary-button">I saved the recovery secret</button>`);
      bind('vault-finish-enrollment', async () => {
        if (!info.devices.some(d => d.username === user.username)) await command('enroll', { publicKey: pair.publicKey });
        await render(); notify('If another device is already enrolled, authorize this public key from that device before use.');
      });
    });
    bind('vault-unlock', async () => { await unlock(backup, document.getElementById('vault-secret').value); await render(); });
    document.getElementById('vault-import')?.addEventListener('change', run(async event => {
      const file = event.target.files[0]; if (!file || file.size > 32000) throw new Error('Invalid backup file.');
      await unlock(JSON.parse(await file.text()), document.getElementById('vault-secret').value); await render();
    }));
    bind('vault-lock', async () => { vault = undefined; stopped = true; await render(); });
    bind('vault-backup', () => download('tanuki-encrypted-device.json', stored()));
    bind('vault-public', () => { document.getElementById('vault-new-public').value = vault.publicKey; });
    bind('vault-enroll', async () => { await command('enroll', { publicKey: document.getElementById('vault-new-public').value }); notify('Device enrolled. Verify its fingerprint on the new device.'); });
    bind('vault-revoke', async () => { if (!confirm('Revoke this device? Existing downloaded copies cannot be recalled. Keep another authorized device or access will be lost.')) return; await command('revoke', { fingerprint: vault.fingerprint }); vault = undefined; stopped = true; await render(); });
    bind('vault-pin', async () => {
      const name = document.getElementById('vault-pin-user').value.trim(), fp = document.getElementById('vault-pin-fp').value.trim().toLowerCase();
      const d = info.devices.find(d => d.username === name && d.fingerprint === fp);
      if (!d || (await cryptoBox.publicKey(d.publicKey)).getFingerprint() !== fp) throw new Error('Fingerprint does not match an authorized recipient.');
      const next = pins(); next[pinKey(name, fp)] = true; localStorage.setItem(prefix + 'pins', JSON.stringify(next)); notify('Recipient fingerprint pinned. New keys require separate verification.');
    });
    bind('vault-save', async () => {
      const recipients = recipientList(), id = crypto.randomUUID(), mode = document.getElementById('vault-mode').value;
      const ciphertext = await cryptoBox.encrypt(recipients.map(r => r.publicKey), { v: 1, purpose: 'tanuki-private-document', id,
        owner: user.username, revision: 1, mode, recipients: recipients.map(r => r.fingerprint).sort(), text: document.getElementById('vault-text').value }, vault.key);
      await command('save', { id, revision: 1, mode, recipients: recipients.map(({ username, fingerprint }) => ({ username, fingerprint })), ciphertext });
      notify('Encrypted draft saved.'); await loadDocuments();
    });
    bind('vault-generate', async () => {
      if (!document.getElementById('vault-consent').checked) throw new Error('Authorize the AI plaintext disclosure first.');
      const recipients = recipientList(), result = await command('generate', { prompt: document.getElementById('vault-text').value, discloseToAI: true,
        mode: document.getElementById('vault-mode').value, recipients: recipients.map(({ username, fingerprint }) => ({ username, fingerprint })) });
      localStorage.setItem(prefix + 'generation', JSON.stringify(result)); await resume();
    });
    bind('vault-resume', resume);
    bind('vault-cancel', async () => { const job = JSON.parse(localStorage.getItem(prefix + 'generation') || 'null'); if (job) { await command('cancel', { id: job.id }); notify('Cancellation requested; partial encrypted output is retained.'); } });
    if (vault && info.devices.some(d => d.username === user.username && d.fingerprint === vault.fingerprint)) await loadDocuments();
  }
  async function loadDocuments() {
    const { documents, devices } = await command('documents'); info.devices = devices;
    const box = document.getElementById('vault-documents'); box.replaceChildren();
    for (const doc of documents) {
      const button = document.createElement('button'); button.className = 'soft-button'; button.textContent = `${doc.mode} · ${doc.owner} · ${doc.id.slice(0, 8)}`;
      button.onclick = run(async () => {
        const signer = info.devices.find(d => d.username === doc.owner && d.fingerprint === doc.signer);
        if (!signer || (signer.fingerprint !== vault.fingerprint && !pins()[pinKey(signer.username, signer.fingerprint)])) throw new Error('Verify the author device fingerprint before opening.');
        const value = await cryptoBox.decrypt(vault.key, doc.ciphertext, { v: 1, purpose: 'tanuki-private-document', id: doc.id, owner: doc.owner,
          revision: doc.revision, mode: doc.mode, recipients: doc.recipients.map(r => r.fingerprint).sort() }, signer.publicKey);
        document.getElementById('vault-output').textContent = value.text;
      }); box.append(button);
    }
    const { generations } = await command('generations');
    for (const job of generations) {
      const button = document.createElement('button'); button.className = 'soft-button'; button.textContent = `AI response · ${job.owner} · ${job.state}`;
      button.onclick = run(async () => { localStorage.setItem(prefix + 'generation', JSON.stringify(job)); await resume(); }); box.append(button);
    }
  }
  let resuming = false;
  async function resume() {
    if (resuming) return; resuming = true;
    try {
      const job = JSON.parse(localStorage.getItem(prefix + 'generation') || 'null'); if (!job) throw new Error('No saved generation on this browser.');
      const context = { v: 1, purpose: 'tanuki-ai-response', generation: job.id, owner: job.owner, recipients: job.recipients.map(r => r.fingerprint).sort() };
      const saved = localStorage.getItem(prefix + 'checkpoint:' + job.id);
      const checkpoint = saved ? (await cryptoBox.decrypt(vault.key, saved, { purpose: 'tanuki-client-checkpoint', generation: job.id }, vault.publicKey)).checkpoint : undefined;
      const assembler = new ChunkAssembler(context, async (ciphertext, expected) => {
        const value = await cryptoBox.decrypt(vault.key, ciphertext, expected);
        if (!['delta', 'complete'].includes(value.kind) || (value.kind === 'complete' && value.text !== '')) throw new Error('Invalid response chunk');
        if (assembler.state.complete) throw new Error('Chunk after completion');
        if (value.kind === 'complete') assembler.state.complete = true;
        return value;
      }, checkpoint);
      while (!stopped && vault) {
        const result = await command('resume', { id: job.id, after: assembler.state.next - 1 });
        for (const chunk of result.chunks) {
          await assembler.accept(chunk);
          // Persist an encrypted client checkpoint before advancing the server acknowledgement.
          const encrypted = await cryptoBox.encrypt([vault.publicKey], { purpose: 'tanuki-client-checkpoint', generation: job.id, checkpoint: assembler.state }, vault.key);
          localStorage.setItem(prefix + 'checkpoint:' + job.id, encrypted);
          await command('ack', { id: job.id, sequence: chunk.sequence, digest: assembler.state.previous });
        }
        document.getElementById('vault-output').textContent = assembler.state.text;
        document.getElementById('vault-status').textContent = `${result.state} · encrypted stored AI response · ${assembler.state.next} verified chunks`;
        if (!['queued', 'running'].includes(result.state) && assembler.state.next === result.count) {
          if (result.state === 'complete' && !assembler.state.complete) throw new Error('Missing authenticated completion chunk');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally { resuming = false; }
  }
  await render();
}
