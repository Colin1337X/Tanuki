// RFC 9580 operations are provided by OpenPGP.js, not a bespoke key exchange.
// Shared by the browser and Node tests; the caller supplies the platform build.
export function recipientCrypto(pgp) {
  const config = { v6Keys: true, aeadProtect: true,
    preferredSymmetricAlgorithm: pgp.enums.symmetric.aes256,
    preferredAEADAlgorithm: pgp.enums.aead.gcm,
    preferredCompressionAlgorithm: pgp.enums.compression.uncompressed };
  async function publicKey(armored) {
    if (typeof armored !== 'string' || armored.length > 16000) throw new Error('Invalid public key');
    const key = await pgp.readKey({ armoredKey: armored });
    if (key.isPrivate() || key.keyPacket.version !== 6) throw new Error('Version 6 public key required');
    await key.verifyPrimaryKey();
    await key.getEncryptionKey();
    await key.getSigningKey();
    return key;
  }
  async function sign(key, text) {
    return pgp.sign({ message: await pgp.createMessage({ text }), signingKeys: key, detached: true, config });
  }
  async function verify(armored, text, signature) {
    if (typeof signature !== 'string' || signature.length > 16000) throw new Error('Invalid signature');
    const result = await pgp.verify({ message: await pgp.createMessage({ text }),
      verificationKeys: await publicKey(armored), signature: await pgp.readSignature({ armoredSignature: signature }), config });
    if (result.signatures.length !== 1) throw new Error('One device signature required');
    await result.signatures[0].verified;
  }
  async function encrypt(recipients, value, signingKey) {
    if (!Array.isArray(recipients) || !recipients.length || recipients.length > 16) throw new Error('Invalid recipients');
    const keys = await Promise.all(recipients.map(publicKey));
    return pgp.encrypt({ message: await pgp.createMessage({ text: JSON.stringify(value) }), encryptionKeys: keys,
      ...(signingKey ? { signingKeys: signingKey } : {}), config });
  }
  async function decrypt(key, ciphertext, expected, signer) {
    const message = await pgp.readMessage({ armoredMessage: ciphertext });
    // Refuse legacy SEIPD/MDC or unauthenticated containers, even if the library can read them.
    const containers = message.packets.filter(packet => packet.constructor.tag === pgp.enums.packet.symEncryptedIntegrityProtectedData);
    if (containers.length !== 1 || containers[0].version !== 2) throw new Error('AEAD envelope required');
    const result = await pgp.decrypt({ message, decryptionKeys: key,
      ...(signer ? { verificationKeys: await publicKey(signer), expectSigned: true } : {}), config });
    if (signer) for (const signature of result.signatures) await signature.verified;
    const value = JSON.parse(result.data);
    for (const [name, wanted] of Object.entries(expected)) {
      if (JSON.stringify(value[name]) !== JSON.stringify(wanted)) throw new Error('Encrypted context mismatch');
    }
    return value;
  }
  return { config, publicKey, sign, verify, encrypt, decrypt,
    async generate(secret) {
      if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('A random 256-bit recovery secret is required');
      return pgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'Tanuki device' }], passphrase: secret, config });
    },
    async unlock(armored, secret) {
      const key = await pgp.readPrivateKey({ armoredKey: armored });
      if (key.keyPacket.version !== 6 || key.isDecrypted()) throw new Error('Encrypted version 6 backup required');
      return pgp.decryptKey({ privateKey: key, passphrase: secret, config });
    },
  };
}

// A consumer only advances after authenticated decryption and durable client acknowledgement.
// Duplicates are harmless only when their ciphertext is identical to the accepted delivery.
export class ChunkAssembler {
  constructor(context, decrypt, checkpoint = { next: 0, previous: '', text: '', hashes: [] }) {
    this.context = context; this.decrypt = decrypt; this.state = structuredClone(checkpoint);
  }
  async accept(chunk) {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chunk.ciphertext)))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (chunk.sequence < this.state.next) {
      if (this.state.hashes[chunk.sequence] !== hash) throw new Error('Conflicting duplicate chunk');
      return false;
    }
    if (chunk.sequence !== this.state.next) throw new Error('Missing or reordered chunk');
    const value = await this.decrypt(chunk.ciphertext, { ...this.context, sequence: chunk.sequence, previous: this.state.previous });
    if (typeof value.text !== 'string') throw new Error('Invalid chunk text');
    this.state.text += value.text; this.state.previous = hash; this.state.hashes.push(hash); this.state.next++;
    return true;
  }
}
