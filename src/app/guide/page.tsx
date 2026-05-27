import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { ALL_BLOCKS } from '@/lib/schema/field-schemas';
import { AppHeader } from '@/components/AppHeader';
import { GuideMarkdown } from './GuideMarkdown';

export const dynamic = 'force-dynamic';

// Maps heading text in the markdown to BlockKey for sidebar anchor links.
// Keep in sync with the H2 titles in src/lib/annotation-guide.md.
const HEADING_TO_BLOCK: Record<string, string> = {
  'Prostate': 'prostate',
  'Urothelial / Bladder': 'urothelial',
  'Renal Cell Carcinoma (RCC)': 'rcc',
  'Testicular / Germ Cell': 'testicular',
  'Breast': 'breast',
  'Lung': 'lung',
  'Colorectal': 'colorectal',
  'Head & Neck': 'head_and_neck',
  'Ovarian / Fallopian / Primary Peritoneal': 'ovarian',
  'Uterine / Endometrial': 'uterine',
  'Cervical': 'cervical',
  'Melanoma': 'melanoma',
  'Mesothelioma': 'mesothelioma',
  'Gastroesophageal (Gastric / GEJ / Esophageal)': 'gastroesophageal',
  'Neuroendocrine Tumors': 'neuroendocrine',
  'Pancreatic': 'pancreatic',
  'CNS / Glioma': 'cns',
  'Hepatocellular Carcinoma (HCC)': 'hcc',
  'Biliary Tract (Cholangiocarcinoma / Gallbladder)': 'biliary',
  'Mature B-Cell Lymphoma': 'mature_b_cell',
  'Mature T/NK-Cell Lymphoma': 'mature_t_nk_cell',
  'Myeloid Neoplasms (AML / MDS / MPN / CML)': 'myeloid_neoplasm',
  'Precursor Lymphoid (ALL / LBL)': 'precursor_lymphoid',
  'Plasma Cell (Myeloma / Amyloidosis)': 'plasma_cell',
};

function loadGuide(): string {
  try {
    return readFileSync(join(process.cwd(), 'src/lib/annotation-guide.md'), 'utf8');
  } catch (e) {
    return `# Annotation guide\n\n_Could not load guide content (${(e as Error).message}). The file should be at src/lib/annotation-guide.md._`;
  }
}

export default async function GuidePage() {
  const session = await readSession();
  if (!session) redirect('/login');

  const guideMarkdown = loadGuide();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside className="lg:sticky lg:top-[68px] lg:self-start">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shadow-blue-100/30">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Jump to block
            </h2>
            <nav className="text-sm space-y-1.5">
              {ALL_BLOCKS.map((b) => (
                <a
                  key={b.key}
                  href={`#${b.key}`}
                  className="block text-slate-700 hover:text-blue-700 hover:underline truncate"
                >
                  {b.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="min-w-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm shadow-blue-100/30">
            <Link
              href={session.role === 'annotator' ? '/annotate' : '/review'}
              className="text-sm text-blue-600 hover:underline"
            >
              ← {session.role === 'annotator' ? 'Annotator dashboard' : 'Reviewer dashboard'}
            </Link>
            <GuideMarkdown source={guideMarkdown} headingToId={HEADING_TO_BLOCK} />
          </div>
        </article>
      </main>
    </div>
  );
}
