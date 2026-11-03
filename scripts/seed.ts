import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { db } from '../src/server/db';
type Legacy = {
  slug: string;
  name: string;
  description: string;
  detail: string;
  kind: string;
  audience: string;
  materials: string[];
  price: number;
  sizes: string[];
};
export async function importDrafts() {
  // The owner-controlled catalog module contains a build-time Astro image import.
  // Evaluate only that trusted repository module with a placeholder image shim.
  const source = (
    await readFile(new URL('../src/data/products.ts', import.meta.url), 'utf8')
  )
    .replace(/^import .*$/gm, '')
    .replace(/export /g, '');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const rows = runInNewContext(
    `const comingSoonImage={};\n${js}\nproducts`,
    {},
    { timeout: 1000 },
  ) as Legacy[];
  const categoryFor = (kind: string) => {
    if (kind === 'wearables') return 'hat';
    if (kind === 'art') return 'other';
    return 'other';
  };
  let created = 0;
  for (const p of rows) {
    const old = await db().product.findUnique({ where: { slug: p.slug } });
    if (old) continue;
    await db().product.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        detail: p.detail,
        category: categoryFor(p.kind),
        audience: p.audience,
        materials: p.materials.join(', '),
        status: 'draft',
        variants: {
          create: p.sizes.map((size) => ({
            sku: `${p.slug.toUpperCase()}-${size}`,
            label: size,
            options: { Size: size },
            combination: `Size:${size}`,
            priceCents: Math.round(p.price * 100),
            stock: { create: {} },
          })),
        },
        images: {
          create: {
            alt: 'Imported placeholder — replace before publishing',
            placeholder: true,
            verified: false,
          },
        },
      },
    });
    created++;
  }
  await db().storeSettings.upsert({
    where: { id: 'store' },
    create: {},
    update: {},
  });
  return created;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    `Imported ${await importDrafts()} private drafts; existing edits and stock preserved.`,
  );
  await db().$disconnect();
}
