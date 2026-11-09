---
name: Verifica.ai Identidade
description: Console operacional de verificação facial 1:1.
colors:
  canvas: "#f6f7f9"
  surface: "#fff"
  ink: "#172b28"
  muted: "#64736d"
  brand: "#12644d"
  sidebar: "#102b25"
  mint: "#d5f3de"
  line: "#e5eae7"
  brand-hover: "#0b503b"
  focus: "#258363"
  success-bg: "#edf6ef"
  success-ink: "#35734b"
  failure-bg: "#fbedeb"
  failure-ink: "#924c43"
  pending-bg: "#fbf4e5"
  pending-ink: "#7d5c24"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-1px"
  headline:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    letterSpacing: "-0.75px"
  title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "10px"
rounded:
  field: "6px"
  control: "7px"
  panel: "12px"
  dialog: "14px"
spacing:
  compact: "8px"
  control-inline: "14px"
  mobile-gutter: "16px"
  section: "24px"
  desktop-gutter: "38px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
  navigation-active:
    backgroundColor: "{colors.mint}"
    rounded: "{rounded.control}"
    padding: "12px"
  status-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-ink}"
    rounded: "5px"
    padding: "4px 7px"
  status-failure:
    backgroundColor: "{colors.failure-bg}"
    textColor: "{colors.failure-ink}"
  status-pending:
    backgroundColor: "{colors.pending-bg}"
    textColor: "{colors.pending-ink}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Design System: Verifica.ai Identidade

## Overview

**Creative North Star: "Console de operações"**

Console operacional em português, com navegação verde escura e área de trabalho clara. A informação é compacta e organizada por painéis, tabelas e etapas; a cor de ação identifica o próximo passo e a menta marca a navegação selecionada.

Estados sintéticos e experimentais devem permanecer explícitos. A apresentação visual de um resultado não substitui a revisão exigida pelo produto.

**Key Characteristics:**
- Navegação escura, conteúdo claro.
- Densidade de console com títulos curtos e números tabulares.
- Painéis planos, bordas finas e seleção em menta.
- Demonstração, conexão e revisão identificadas em texto.

Extraído de `dist/style.css`, `dist/index.html` e `dist/app.js`. Esta documentação registra a implementação; não houve validação visual por screenshot.

## Colors

### Primary

O verde floresta (`brand`) identifica ações principais, links e etapas ativas; o verde profundo (`sidebar`) ancora a navegação. A menta (`mint`) distingue o item selecionado. O tom `brand-hover` escurece ações e `focus` desenha o foco de teclado.

### Secondary

Os pares `success-*`, `failure-*` e `pending-*` expressam resultado favorável, falha e revisão. Cada estado inclui texto; os indicadores circulares são complementares.

### Neutral

`canvas` sustenta o workspace, `surface` os painéis, `ink` o texto principal, `muted` o texto auxiliar e `line` as divisórias.

**The Estado explícito Rule.** Cor acompanha o texto do estado e nunca transforma uma demonstração ou resultado experimental em aprovação de produção.

## Typography

DM Sans é a família implementada, com fallback sans-serif. A fonte é carregada pelo Google Fonts. A hierarquia combina títulos compactos, rótulos menores e números tabulares.

- **Display:** métricas do dashboard; os números usam a maior escala e espaçamento apertado.
- **Headline:** título de página; adapta-se nos breakpoints menores.
- **Title:** cabeçalhos de painéis; as páginas de formulário também têm títulos locais maiores.
- **Body:** base do documento; texto auxiliar usa tamanhos menores (10–12px) e entrelinha ampliada quando necessário.
- **Label:** rótulos de formulário; os rótulos de tabela usam uma escala menor (9px), com leve espaçamento.
- **Mono:** identificadores, duração e trechos técnicos; código usa uma variante de 11px com entrelinha de 1,9.

## Layout

A estrutura desktop usa sidebar fixa (246px), topbar (77px) e conteúdo com largura máxima de 1700px. O espaçamento lateral de conteúdo é o token `desktop-gutter`. Métricas formam quatro colunas; o dashboard combina área principal e painel auxiliar. A captura e os formulários usam duas colunas; tabelas têm rolagem horizontal.

Até 1150px a sidebar reduz para 215px e os gutters para 25px. Até 850px ela vira cabeçalho com navegação horizontal rolável; workspace e perfil lateral ficam ocultos, e verificação, configurações e API passam a uma coluna. Até 580px as métricas passam a duas colunas, o dashboard a uma coluna e as ações de título quebram linha. A partir de 1500px aumentam alguns espaçamentos e a altura do gráfico.

## Elevation & Depth

Painéis ficam planos, delimitados por preenchimento e borda de 1px. O toast é a exceção: sua sombra (`0 8px 24px #102b2526`) o separa do conteúdo. O diálogo usa backdrop translúcido (`#102b2570`). Não há sombra decorativa nos cartões.

Botões transitam fundo e cor em 0,16s; o toast usa opacidade e deslocamento em 0,2s. A preferência por movimento reduzido remove transições e animações.

## Shapes

Painéis usam o token `panel`; campos e controles têm curvas menores. Badges de resultado usam cantos de 5px e ponto circular. Avatares de perfil são circulares; avatares de tabela são quadrados suavizados. A guia de rosto é uma elipse tracejada, distinta das superfícies de interface.

## Components

### Buttons

Ações compactas, com ícones de traço e altura mínima de 38px. A principal usa `brand` com texto branco; a secundária usa branco, borda discreta e hover claro. A versão pequena tem altura mínima de 30px. Foco usa contorno de 2px com afastamento de 4px; desabilitado usa opacidade de 0,5 e cursor de indisponibilidade. Não há transformação de escala no clique.

### Inputs / Fields

Campos brancos, borda fina e altura mínima de 40px; rótulo acima e placeholder auxiliar. Checkbox usa o verde principal. O foco compartilha o contorno global. O campo de busca de tabela tem invólucro próprio com ícone. A implementação não define um estilo geral de borda de erro: mensagens de erro usam texto vermelho.

### Navigation

Itens com ícone e texto, hover verde discreto e seleção em menta com texto escuro. No desktop há rótulo de seção e badge da API; em telas menores a lista vira faixa rolável e o badge é ocultado.

### Status

Pílulas compactas, ponto na cor do texto e três pares de fundo/texto. Aprovada, falha e revisão são rótulos distintos; a demonstração é declarada separadamente nos banners e nas listas.

### Cards / Containers

Superfície branca, borda `line`, cantos `panel` e conteúdo recortado. Cabeçalhos usam espaçamento próprio, enquanto formulários têm padding de 24–25px. O painel auxiliar do dashboard usa preenchimento verde claro. Tabelas usam cabeçalho tonal e divisórias horizontais, sem linhas verticais.

### Capture / Result

A prévia de câmera tem fundo verde escuro, guia elíptica tracejada e instrução de captura. Três etapas conectadas representam identidade, captura e resultado. Resultados podem abrir detalhes técnicos; o aviso experimental e a exigência de revisão continuam visíveis.

## Do's and Don'ts

### Do:
- **Do** manter rótulos de demonstração e dados sintéticos junto aos resultados ilustrativos.
- **Do** combinar cor de estado com texto e preservar o contorno de foco.
- **Do** usar painéis brancos com bordas sutis e títulos compactos.
- **Do** permitir rolagem horizontal em tabelas e navegação móvel.

### Don't:
- **Don't** apresentar métricas sintéticas como medições do backend.
- **Don't** usar um estado verde para omitir a revisão humana do motor experimental.
- **Don't** aplicar sombras decorativas aos painéis de conteúdo.
- **Don't** substituir a tipografia implementada por Inter sem uma decisão de redesign.
