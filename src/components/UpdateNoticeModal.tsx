import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, Clock3, Sparkles, X } from 'lucide-react';
import { UpdateNoticeContent } from '../updateNotice';

interface Props {
  isOpen: boolean;
  notice: UpdateNoticeContent;
  onClose: () => void;
}

function formatPublishedDate(value: string) {
  try {
    return format(parseISO(value), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return value;
  }
}

export function UpdateNoticeModal({ isOpen, notice, onClose }: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-notice-title"
        className="relative w-full max-w-4xl overflow-hidden rounded-[32px] border border-sky-100 bg-white shadow-2xl"
      >
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-500 opacity-10" />

        <div className="relative border-b border-slate-200 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                <Sparkles size={16} />
                Novidades da atualizacao
              </span>
              <h2 id="update-notice-title" className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                {notice.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{notice.summary}</p>
            </div>

            <button
              onClick={onClose}
              className="self-end rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:self-start"
              aria-label="Fechar aviso de atualizacao"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
              <Clock3 size={15} />
              Publicado em {formatPublishedDate(notice.publishedAt)}
            </span>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 font-medium">
              ID da versao: {notice.id}
            </span>
          </div>
        </div>

        <div className="relative px-6 py-6 sm:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            {notice.sections.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5"
              >
                <h3 className="text-lg font-semibold text-slate-950">{section.title}</h3>
                <div className="mt-4 space-y-3">
                  {section.items.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                      <p className="text-sm leading-6 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {notice.footer && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
              {notice.footer}
            </div>
          )}
        </div>

        <div className="relative flex flex-col gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm text-slate-500">
            Este aviso aparece uma vez por navegador sempre que o ID da atualizacao mudar.
          </p>

          <button
            onClick={onClose}
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
