export interface UpdateNoticeSection {
  title: string;
  items: string[];
}

export interface UpdateNoticeContent {
  id: string;
  title: string;
  publishedAt: string;
  summary: string;
  sections: UpdateNoticeSection[];
  footer?: string;
}

export const UPDATE_NOTICE_STORAGE_KEY = 'expedicao-madeiramar-last-seen-update-id';

// Sempre que quiser anunciar uma nova entrega:
// 1. troque o `id`
// 2. ajuste titulo, data e textos abaixo
// O aviso aparece uma vez por navegador para cada novo `id`.
export const currentUpdateNotice: UpdateNoticeContent = {
  id: '2026-04-06-aviso-de-atualizacao',
  title: 'Atualizacao de abril',
  publishedAt: '2026-04-06',
  summary: 'Agora o sistema consegue avisar automaticamente o que mudou na primeira entrada apos cada nova atualizacao.',
  sections: [
    {
      title: 'Operacao mais rapida',
      items: [
        'O campo Cliente agora sugere nomes usados nos ultimos 7 dias enquanto voce digita.',
        'As sugestoes continuam opcionais, entao voce pode aceitar uma delas ou preencher manualmente.',
      ],
    },
    {
      title: 'Novidades por versao',
      items: [
        'Esta tela aparece so na primeira visita de cada navegador apos uma nova atualizacao.',
        'Nas proximas entregas, basta trocar o id e editar este arquivo com o resumo do que mudou.',
      ],
    },
  ],
  footer: 'Se varias pessoas usam o mesmo computador, cada navegador guarda localmente quando essa atualizacao ja foi lida.',
};
