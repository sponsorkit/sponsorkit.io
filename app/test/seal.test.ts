import { describe, expect, it } from "vitest";
import { z } from "zod";
import { base64urlDecode, base64urlEncode } from "../src/encoding";
import { ConfigError } from "../src/env";
import { loadSealingKeys, seal, SealError, unseal, unsealRaw } from "../src/seal";
import { KEYS_V1, KEYS_V2, keyB64 } from "./helpers";

const Schema = z.object({ hello: z.string(), x: z.number() });
const future = () => Math.floor(Date.now() / 1000) + 60;

describe("seal", () => {
  it("round-trips and uses the documented layout", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const payload = { hello: "world", x: future() };
    const token = await seal("session", payload, keys);
    expect(token.startsWith("sks_")).toBe(true);
    const bytes = base64urlDecode(token.slice(4));
    expect(bytes[0]).toBe(1); // keyId
    // keyId(1) + nonce(12) + ciphertext(len(compact JSON)) + tag(16)
    expect(bytes.length).toBe(1 + 12 + JSON.stringify(payload).length + 16);
    const out = await unseal("session", token, keys, Schema);
    expect(out.hello).toBe("world");
  });

  it("uses prefixes per kind and random nonces", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const a = await seal("code", { x: 1 }, keys);
    const b = await seal("code", { x: 1 }, keys);
    expect(a.startsWith("skc_")).toBe(true);
    expect(a).not.toBe(b);
    const s = await seal("state", { x: 1 }, keys);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects tampering anywhere in the token", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const token = await seal("session", { hello: "world", x: future() }, keys);
    const bytes = base64urlDecode(token.slice(4));
    for (const pos of [1, 5, 13, bytes.length - 1]) {
      const t = new Uint8Array(bytes);
      t[pos]! ^= 0x01;
      await expect(unsealRaw("session", "sks_" + base64urlEncode(t), keys)).rejects.toBeInstanceOf(SealError);
    }
    await expect(unsealRaw("session", token.slice(0, -2), keys)).rejects.toBeInstanceOf(SealError);
    await expect(unsealRaw("session", "sks_!!!", keys)).rejects.toBeInstanceOf(SealError);
    await expect(unsealRaw("session", "sks_", keys)).rejects.toBeInstanceOf(SealError);
  });

  it("binds the kind via AAD (a code can't be used as a session)", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const code = await seal("code", { hello: "x", x: future() }, keys);
    await expect(unsealRaw("session", "sks_" + code.slice(4), keys)).rejects.toThrow(SealError);
    await expect(unsealRaw("session", code, keys)).rejects.toThrow(/prefix/);
  });

  it("enforces expiry unless ignoreExpiry", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const now = Math.floor(Date.now() / 1000);
    const token = await seal("state", { hello: "x", x: now - 1 }, keys);
    await expect(unseal("state", token, keys, Schema)).rejects.toThrow(/expired/);
    await expect(unseal("state", token, keys, Schema, { ignoreExpiry: true })).resolves.toMatchObject({ hello: "x" });
  });

  it("rejects payloads that don't match the schema", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const token = await seal("state", { nope: true, x: future() }, keys);
    await expect(unseal("state", token, keys, Schema)).rejects.toThrow(/schema/);
  });

  it("supports key rotation: new key seals, old key still unseals; removed key fails", async () => {
    const oldKeys = await loadSealingKeys(KEYS_V1);
    const rotated = await loadSealingKeys(KEYS_V2);
    const oldToken = await seal("session", { hello: "old", x: future() }, oldKeys);
    expect((await unseal("session", oldToken, rotated, Schema)).hello).toBe("old");
    const newToken = await seal("session", { hello: "new", x: future() }, rotated);
    expect(base64urlDecode(newToken.slice(4))[0]).toBe(2);
    await expect(unseal("session", newToken, oldKeys, Schema)).rejects.toThrow(/unknown key/);
    const onlyNew = await loadSealingKeys(JSON.stringify([{ id: 2, key: keyB64(2) }]));
    await expect(unseal("session", oldToken, onlyNew, Schema)).rejects.toThrow(/unknown key/);
  });

  it("validates SEALING_KEYS configuration", async () => {
    await expect(loadSealingKeys(undefined)).rejects.toBeInstanceOf(ConfigError);
    await expect(loadSealingKeys("not json")).rejects.toBeInstanceOf(ConfigError);
    await expect(loadSealingKeys("[]")).rejects.toBeInstanceOf(ConfigError);
    await expect(loadSealingKeys(JSON.stringify([{ id: 1, key: "c2hvcnQ" }]))).rejects.toThrow(/32 bytes/);
    await expect(loadSealingKeys(JSON.stringify([{ id: 300, key: keyB64(1) }]))).rejects.toBeInstanceOf(ConfigError);
    await expect(
      loadSealingKeys(JSON.stringify([{ id: 1, key: keyB64(1) }, { id: 1, key: keyB64(2) }])),
    ).rejects.toThrow(/duplicate/);
    await expect(loadSealingKeys(JSON.stringify([{ id: "7", key: keyB64(7) }]))).resolves.toHaveLength(1);
  });
});
