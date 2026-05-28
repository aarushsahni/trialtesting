import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { ALL_BLOCKS } from '@/lib/schema/field-schemas';
import { AppHeader } from '@/components/AppHeader';
import { GuideMarkdown } from './GuideMarkdown';
import { GuideEditor } from './GuideEditor';
import { getCurrentGuide } from '@/lib/guide-store';

export const dynamic = 'force-dynamic';

// Map heading text in the markdown to BlockKey for sidebar anchor links.
// Kept in sync with src/lib/guide-parser.ts.
const HEADING_TO_BLOCK: Record<string, string> = {
  'General annotation rules': 'general-rules',
  'Field-type quick reference': 'field-type-quick-reference',
  'Adjudication note template': 'adjudication-note-template',
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

export default async function GuidePage() {
  const session = await readSession();
  if (!session) redirect('/login');

  const guide = await getCurrentGuide();
  const guideMarkdown = guide?.markdown ?? '# Annotation guide\n\n_No guide content yet — run npm run init-db to seed it._';

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside className="lg:sticky lg:top-[68px] lg:self-start">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shadow-blue-100/30">
            <nav className="text-sm space-y-1.5 pb-3 border-b border-slate-200 mb-3">
              <a href="#general-rules" className="block font-semibold text-blue-700 hover:underline">
                ↑ General annotation rules
              </a>
              <a href="#field-type-quick-reference" className="block text-slate-700 hover:text-blue-700 hover:underline">
                Field-type quick reference
              </a>
              <a href="#adjudication-note-template" className="block text-slate-700 hover:text-blue-700 hover:underline">
                Adjudication note template
              </a>
            </nav>
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
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <Link
                href={session.role === 'expert' ? '/review' : '/expert'}
                className="text-sm text-blue-600 hover:underline"
              >
                ← {session.role === 'expert' ? 'Expert dashboard' : 'Expert dashboard'}
              </Link>
              {guide?.edited_at && (
                <span className="text-xs text-slate-400">
                  Last edited
                  {guide.edited_by_name ? ` by ${guide.edited_by_name}` : ''}{' '}
                  {new Date(guide.edited_at).toLocaleString()}
                </span>
              )}
            </div>

            {session.role === 'expert' ? (
              <GuideEditor
                initial={guideMarkdown}
                headingToId={HEADING_TO_BLOCK}
              />
            ) : (
              <GuideMarkdown source={guideMarkdown} headingToId={HEADING_TO_BLOCK} />
            )}
          </div>
        </article>
      </main>
    </div>
  );
}
