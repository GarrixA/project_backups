/**
 * Exports all top-level Firestore collections to a JSON file.
 *
 * Env:
 *   FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *   BACKUP_PROJECT_SLUG  — folder name under backups/ (e.g. golden-k-tech-dev)
 *   BACKUP_OUTPUT_PATH   — optional full output path override
 *   FIREBASE_SERVICE_ACCOUNT_JSON — optional full service-account JSON instead
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

function normalizePrivateKey(raw) {
  if (!raw) return raw;

  let key = raw.trim();

  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/\\n/g, "\n");

  if (!key.includes("\n") && key.includes("BEGIN PRIVATE KEY")) {
    const match = key.match(
      /(-----BEGIN PRIVATE KEY-----)(.+)(-----END PRIVATE KEY-----)/
    );
    if (match) {
      const body = match[2].replace(/\s/g, "");
      const lines = body.match(/.{1,64}/g) ?? [];
      key = `${match[1]}\n${lines.join("\n")}\n${match[3]}\n`;
    }
  }

  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is invalid. Paste the full PEM key (including BEGIN/END lines) into the GitHub secret, without surrounding quotes."
    );
  }

  return key;
}

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(String(parsed.private_key)),
    };
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY."
    );
  }

  return { projectId, clientEmail, privateKey };
}

function serializeValue(value) {
  if (value == null) return value;

  if (value instanceof Timestamp) {
    return { __type: "Timestamp", iso: value.toDate().toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return {
        __type: "GeoPoint",
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }
    if (typeof value.path === "string" && value.firestore) {
      return { __type: "DocumentReference", path: value.path };
    }

    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeValue(nested);
    }
    return out;
  }

  return value;
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const account = loadServiceAccount();
  return initializeApp({
    credential: cert({
      projectId: account.projectId,
      clientEmail: account.clientEmail,
      privateKey: account.privateKey,
    }),
  });
}

async function exportCollection(db, name) {
  const snapshot = await db.collection(name).get();
  const docs = {};

  for (const doc of snapshot.docs) {
    docs[doc.id] = serializeValue(doc.data());
  }

  return {
    count: snapshot.size,
    documents: docs,
  };
}

async function main() {
  const account = loadServiceAccount();
  const app = getAdminApp();
  const db = getFirestore(app);

  const exportedAt = new Date().toISOString();
  const stamp = exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    process.env.BACKUP_PROJECT_SLUG?.trim() ||
    account.projectId ||
    "unknown-project";

  const outPath =
    process.env.BACKUP_OUTPUT_PATH ??
    join("backups", slug, `firestore-backup-${stamp}.json`);

  const collections = {};
  let totalDocs = 0;

  const collectionRefs = await db.listCollections();
  const collectionNames = collectionRefs.map((ref) => ref.id).sort();

  if (collectionNames.length === 0) {
    process.stderr.write("No collections found.\n");
  }

  for (const name of collectionNames) {
    process.stderr.write(`Exporting ${name}…\n`);
    const result = await exportCollection(db, name);
    collections[name] = result;
    totalDocs += result.count;
    process.stderr.write(`  ${result.count} documents\n`);
  }

  const payload = {
    exportedAt,
    projectId: account.projectId,
    projectSlug: slug,
    totalDocuments: totalDocs,
    collections,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  process.stderr.write(
    `Backup complete: ${totalDocs} documents → ${outPath}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
