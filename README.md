# WinBakery web (Delphi → Node + React)

Fase 1: `u_diaria` (Programação diária). Fase 2: menu do sistema (Programação ▾ com abas de telas abertas) e `u_mercadorias` (Venda de mercadorias).

## Como rodar

Requisitos: Node 20+ e o MySQL do sistema Delphi acessível.

```bash
# banco: o mesmo MySQL do sistema Delphi
cd server && cp .env.example .env   # preencha DB_*
npm install && npm run dev          # API em :5071
cd ../client && npm install && npm run dev   # tela em :5173 (proxy /api → :5071)
cd ../server && npm test            # regras de negócio + validações HTTP
```

Preview sem banco (dados de exemplo): `cd client && VITE_MOCK=1 npm run build`.
Produção: `cd client && npm run build` gera `client/dist` (sirva com Nginx ou similar apontando `/api` para a porta 5071).

## Se aparecer erro ao acessar

1. Backend (`server`): ao iniciar, o terminal mostra `✓ MySQL ... banco "levpao_new"` ou `✗ Sem conexão com o banco: <motivo>`.
2. Abra `http://localhost:5071/api/health` no navegador: `ok:true` = banco conectado; senão mostra o motivo.
3. Rode `npm run check-db` em `server`: testa a conexão e confere se todas as tabelas/colunas usadas pela API existem. Se aparecer `✗`, mande a saída para ajustarmos.
4. O rodapé da tela mostra `Host: <ip>/<banco>` quando conectado.
5. Se o erro for de acesso negado, o MySQL pode não permitir o usuário a partir da máquina que roda a API (precisa de `GRANT ... TO 'sadmin'@'IP-da-máquina'`).
6. Acentos errados: troque `DB_CHARSET` para `latin1` no `.env`.

## O que foi convertido

| Delphi | Node/React |
|---|---|
| Lista de clientes + filtro "Apresentação" (`tbprs`, `rbStatus`) | `GET /api/status` + barra lateral |
| Botões Nada/Normal/Alterado/Cancelado (`btnStatus0Click`) | `PATCH /api/status/:id` |
| Programação diária: incluir/alterar/excluir/cancelar (`tbprd*`, `dsprdDataChange`) | `routes/diaria.js` + `DiariaTab.jsx` |
| Programação fixa: CRUD, Ajustar seg–sex / todos os dias, Incluir no dia seguinte | `routes/fixa.js` + `FixaTab.jsx` |
| Ativar / Desativar fixa (`btnAtivaClick`) e "para todas as empresas" | `fixa/ativar`, `fixa/desativar`, `status/fixa-todas` |
| Ativar movimento do dia, Verificar integridade de status | `status/movimento-dia`, `status/recalcular` |
| `AtualizaStatus`, `btnAjustaCobranca`, `btnAjustaPreco` / "Ajusta tudo" | `services/status.js`, `services/diaria.js` |
| Logs de operação (`tb_diaria_log`, `tb_fixa_log`) | gravados na mesma transação de cada alteração |
| Atalhos F2/F3/F4 | mantidos |

## Fase 2 – Mercadorias

| Delphi | Node/React |
|---|---|
| `d2Click` / `tbprm` (itens do dia, não produzidos, não cancelados) | `GET /api/mercadorias?data=` |
| `tbLog` (log de etiquetas do item focado) | `GET /api/mercadorias/:id/etiquetas` |
| `btnAdesivaClick` (select das etiquetas, insert em `tb_etiquetas_log`, `etiqueta_adesiva+1`) | `POST /api/mercadorias/etiquetas/dados` e `POST /api/mercadorias/etiquetas` (transação, `IN (?)` parametrizado, máx. 500) |
| Grade multisseleção, Selecionar tudo / Desfazer seleção | clique, Ctrl, Shift + botão |
| `ppListaMercadorias` (A4) e `ppAdesivas` (62×45 mm) | impressão do navegador (HTML/CSS); o layout é aproximado, o designer `.rtm` não foi migrado |
| Menu Programação: Fixa/Diária, Mercadorias | `App.jsx` (abas de telas abertas); Etinerário, Cargas e demais menus ficam desabilitados |

**Revisão (janela "Conversão de mercadorias", `u_converte_mercadoria`)**: duplo clique ou Enter na grade abre a janela (`GET/PUT /api/mercadorias/:id`). Código/descrição da mercadoria, bloco "Cobrar como:" (produto, descrição, qtde, preço unitário, total), Observações (`conversao_observacoes`), Salvar (só habilita após alterar), Cancelar e "Valor já cobrado". Regras do `dsprmDataChange`: produto não achado/vazio abre a busca; qtde cobrada = valor do item ÷ preço; total = qtde × preço (recalculado também no servidor, com log em `tb_diaria_log`). Também: navegador ✔/✘, porta de fechar, ordenação por data/hora, cores do original, menu "Alterar lay-out" (desabilitado, designer não migrado), texto "<Não há mercadorias>".
**Suposição a confirmar:** o fonte da janela não foi enviado; deduzi pela imagem que "Valor já cobrado" grava em `tb_diaria.quitado_manualmente` ('True'/'False') e que os quadros azuis mostram `id_produto` e `id_produto_conversao`. Se for outra coluna (ex.: `cobrado`), é só trocar em `server/src/routes/mercadorias.js` (`CAMPOS_CONVERSAO`).

Diferenças: o navegador não avisa se a impressão terminou, então o log é gravado ao enviar para impressão. O menu "Ações do dia" da Programação diária passou para dentro da própria tela.
Rode `npm run check-db` de novo: agora também confere `tb_etiquetas_log`, `tb_diaria.etiqueta_adesiva` e `tb_usuarios.nome`.

## Revisão da tela Programação diária (fiel ao `u_diaria.dfm`)

- Barra de botões na ordem do original: Log (ícone do usuário), Imprimir conferência, Recados, F2 Incluir, F3 Alterar, F4 Excluir, Atualizar, Salvar, Desfazer, Imprimir alterações, "Imprimir programação completa", Mostrar/Esconder item. Salvar/Desfazer só habilitam em edição; os demais, só fora dela (`dsprdDataChange`).
- Painel do item inline (`pnlDiaria`): Data, Hora, Produto (999.999 = mercadoria), descrições, Qtde/Extra/Preço/Cada/Valor total, "Anotações p/ faturamento", "Informe p/ produção"; opções de produção e painel de produção só para produto de produção; barra vermelha "Cobrar como:" só para mercadoria. Linha "*" de novo item na grade. Enter avança de campo (JvEnterTab).
- Menu do botão direito (`OpcoesDiariaF`), atalhos F2/F3/F4, Alt+F2, Alt+Shift+F2, Ctrl+Shift+F2; porta de fechar ao lado do relógio.
- Programação fixa também inline (`pnlFixa`): Log, F2/F3/F4, Salvar, Desfazer, Ativar/Desativar, Pasta (impressão), Dom–Sab; menu direito com Log, Ajustar seg–sex, Ajustar todos os dias, Incluir no dia seguinte.
- Abas Reclamações (navegador, grade, Reclamante/Reclamação/Contestação, Imprimir reclamação) e Configurações (endereço, bairro, CEP, cidade, UF, telefone, contato, 2 opções de impressão).
- Novas tabelas/colunas conferidas pelo `npm run check-db`: `tb_reclamacoes`, `tb_produtos_precos`, `tb_etiquetas_log`, endereço da `tb_unidades`.

Não convertido por falta dos fontes: `u_recados` (botão do corredor), `u_informacoes` (F12), `u_diaria_cobranca` (o item "Configurar produto a ser cobrado" foca a barra "Cobrar como"), `u_diaria_log`/`u_fixa_log` (viraram janelas de log simples), `u_localiza_produto` (busca simples), `u_conflitos`; designer de layout das etiquetas (`.rtm`).

## Fase 3 – Produção (`u_producao`)

Menu Programação ▸ Produção. Abas "Produção salgados" e "Produção especial", cada uma com a lista por horário × referência (grade grande) e o painel "Detalhamento de destino" ao lado (master/detail: a linha selecionada define os destinos).

| Delphi | Node/React |
|---|---|
| `ps` / `pe` (lista por horário e referência) | `GET /api/producao/resumo?tipo=salgados\|especiais&data=` |
| `psa` / `pea` (detalhamento, parâmetros vindos da linha mestre) | `GET /api/producao/destinos?tipo&data&turno&referencia` |
| `ents` / `ente` (entrega por destino, impressão) | `GET /api/producao/entrega?tipo&data` |
| Menus de contexto "1º/2º/3º horário" (`MenuItem1Click`, `Enviarpara1horrio1Click`) | `PUT /api/producao/turno` (transação + log em `tb_diaria_log`) |
| `btnSalgadosDia` / `btnEspeciaisDia` (recarrega e troca de aba) | botões "Salgados" / "Especiais" |
| `btnRes1` / `btnResEspec` (impressora simples) → `ppRpsr` / `ppRper` | resumo da produção (A4 retrato, um bloco por horário) |
| `btnPrg1` / `btnAEsp1` (impressora azul) → `ppEnt_sal` / `ppEnt_esp` | "Entrega para" (A4 paisagem, 2 colunas, uma página por horário, total por referência, observações em fundo preto) |
| `cxButton1` (porta) | fecha a aba |
| `grdSg/grdEspCustomDrawCell` | horário 1 amarelo, 2 verde, 3 azul, texto azul; linha selecionada vermelha com texto amarelo em negrito |
| `dProducaoSelectionChanged` | mudar a data recarrega as duas listas |

Detalhes fiéis ao original: ícones dos botões extraídos do próprio `.dfm`; coluna `id_produto` visível só no detalhamento de salgados; rodapé com a soma de Qtde (`,0.###`); detalhamento multisseleção (clique, Ctrl, Shift); ordenação padrão Hora → Destino; imprimir com data de hoje ou anterior pede confirmação ("Você pode estar cometendo erro!!!"); especiais mostra o destino como "nome  id".

**Diferenças deliberadas (bugs do Delphi corrigidos):**

| Onde | Problema no Delphi | Na versão nova |
|---|---|---|
| `pe` (lista de especiais) | `cancelado<>'True'` descarta `cancelado NULL`; o detalhe e a impressão mostravam essas linhas e o resumo não. | todas as consultas aceitam `'False'` ou `NULL` |
| `ps` × `psa/ents` | lista exige `produto_especial='False'`, detalhe usa `<>'True'`. | mesma regra nas duas (`coalesce(...)<>'True'`) |
| `psa/pea/ents/ente` | `GROUP BY` sem `data`: entregas de dias diferentes viravam uma linha com data arbitrária. | `data` entra no agrupamento |
| `ents/ente` | `obs_producao` fora do `GROUP BY` (valor arbitrário). | entra no agrupamento |
| `MenuItem1Click` / `Enviarpara1horrio1Click` | atualiza só o `id_produto` mostrado na linha, mas a linha soma todos os produtos da referência: os outros ficavam no horário antigo. Também não filtrava `producao_data`. | move todos os produtos da referência (mesma unidade, data, hora, horário atual e `producao_data`) e registra no log de cada item |
| `dProducaoSelectionChanged` | clica Salgados e depois Especiais: a aba sempre terminava em "Especial". | recarrega as duas listas e mantém a aba atual |
| `ps` | `if(:dp is null or :dp='0', producao_data='2010-09-13', …)`: data fixa de teste esquecida. | data obrigatória (422 se inválida) |
| `ppEnt_sal` | cabeçalho de grupo usa o campo `descricao`, que a consulta `ents` não tem (só `referencia_descricao`). | usa `referencia_descricao` |
| `btnRes1Click` | `c:=copy(c,1,length(c)-1)` sobre variável nunca usada. | removido |
| `ppRpsa`/`ppRpea` | relatórios detalhados existem no `.dfm`, mas nenhum botão os chama. | não migrados |

**Limites:** o layout dos 4 relatórios é aproximado (HTML/CSS, impressão do navegador; o cabeçalho "Entrega para" não se repete a cada página nem mostra "Página x de y"). O `PUT /producao/turno` é novo em comportamento (log), então vale testar com um dia de teste antes de usar com dados reais. Nada foi testado contra o MySQL real: o SQL vem do `.dfm`.

## Fase 6 – Controle de comandas (u_comandas, u_comanda_desconto, u_comanda_impressa/pronta)

Menu Faturamento → Controle de comandas. Layout do DFM: barra (Emitidas em, Pendentes/Faturadas/Todas, Atualizar, Imprimir, Selecionar tudo, Excluir Comanda, Saída, NFe, Sair), comandas da unidade + lista de unidades, itens da comanda (duplo clique = Edita/Desconto), detalhes do item e mercadorias da comanda. Rotas em `server/src/routes/comandas.js`.

- **Atualizar** lista as comandas da unidade (`tb_comandas` + itens). Pendentes = status diferente de FATURADO. "Emitidas em" filtra por `data_emissao`. Duplo clique na unidade atualiza.
- **Multisseleção** (Ctrl/Shift). Imprimir, Excluir e NFe valem para as selecionadas (sem seleção, a comanda em foco). Duplo clique na comanda abre a pré-visualização (Imprimir/Cancelar).
- **Edita/Desconto**: Aplicar faz update (qtde gravada = qtde × cada, como no Delphi), insert (após Incluir + código válido) ou delete (Excluir marcado). Correções: `cada` 0 vira 1 (antes zerava a quantidade) e `preco_total` também é atualizado no update. Comanda já faturada não pode ser alterada.
- **NFe**: uma única NF PENDENTE com as comandas selecionadas (mesmo `geraFatura` do Faturamento); exige mesma unidade/cliente, itens e nenhuma comanda já faturada.
- **Excluir Comanda** usa `DELETE /api/faturamento/comandas/:id` (devolve as quantidades à programação).
- Não migrado: `u_comandas.pas` não foi enviado, então não há `cmdITAfterPost`/`cmdITBeforeDelete`, `grMercadoriasDblClick`, pintura de células dos itens nem o botão `bSelect`/permissões (Tag=1) além do que o DFM mostra. O texto impresso reaproveita o `comandaTexto` do Faturamento.

## Fase 7 – Tributos (uTributo: "Códigos de Tributação de produtos")

Menu Faturamento → Tributos. Rotas em `server/src/routes/tributos.js`.

- **Esquerda**: produtos (código, descrição, tributo), filtro por palavras na descrição/código, "Esconder os tributados"; marque vários com Ctrl/Shift + clique. Abre listando todos os produtos (limite de 5000).
- **Direita**: tributos (`tb_tributos`, 26 colunas do DFM) com filtro ao digitar; "<=== indicar o tributo a todos os produtos marcados" grava `tb_produtos.id_tributos` do tributo em foco nos produtos marcados (após confirmação).
- **Editar** (ou duplo clique): painel "Definição de tributação" com os 23 campos do DFM e o navegador (primeiro/anterior/próximo/último, incluir, excluir, gravar, cancelar, atualizar).
- **Gerar XLS**: o Delphi abria o Excel por OLE; aqui baixa `Tributos.csv` (separador `;`, UTF-8 com BOM), que o Excel abre direto.
- Diferenças: filtros parametrizados (o Delphi montava SQL por concatenação); vírgula decimal aceita nas alíquotas; descrição obrigatória; excluir é bloqueado se o tributo estiver em uso por produtos ou itens de NF.

## Fase 8 – Cadastros (menu Cadastros: Clientes, Produtos, Funcionários)

Rotas em `/api/cadastros/*` (não conflitam com `/api/produtos` da Programação). Todas validam antes de tocar no banco e usam lista de campos permitidos.

- **Funcionários** (`u_funcionarios`): navegador, foto (botão *Imagem*: envia o arquivo ao servidor; só grava o **nome** do arquivo em `foto`, como o sistema antigo; pasta em `FUNC_IMG_DIR`, padrão `server/imagens`), *Mostrar/Esconder Inativos*. Exclusão bloqueada se o funcionário está em roteiro.
- **Clientes** (`u_clientes`): cliente no alto + abas *Lista de Clientes*, *Unidades* (etiquetas 62×45 mm, listagem) e *Produtos* (com a montagem automática da descrição da expedição ao marcar as opções, como `cbCortadoClick`). *Conectar unidades* / *Esconder unidades inativas* funcionam como no Delphi. Exclusão bloqueada se há unidades, produtos, comandas ou NFe.
- **Produtos** (`u_produtos`): lista, referências da produção e clientes; formulário completo (NCM, ingredientes, validade, tributação), *Tabela de preços* e *Exportar* (CSV).
- Código do produto novo = `<id do cliente>.<próximo número>` (`/cadastros/produtos/proximo-codigo`). Código duplicado, peso/IPI/ICMS nulos e "Cada" ≤ 0 são recusados.
- Impressões (navegador): tabela de preços, listagem de unidades, etiquetas do nutricionista / Boas Festas (logo extraída do DFM em `client/public`).

### Impressão local
Todas as impressões abrem o diálogo de impressão do navegador do PC onde o usuário está, então usam as impressoras **desse** PC. Para imprimir sem diálogo, abra o Chrome com `--kiosk-printing`. Para impressoras térmicas/etiquetas em modo bruto (ESC/POS, ZPL) é preciso um pequeno agente local em cada estação (ver conversa).

## Fase 9 – Login (u_acesso)

- Tela igual à do Delphi (abas Login/Servidor, Acessar/Sair, histórico de acesso) sobre o fundo de pães do `u_main`. Menu **Usuário**: *Login* (troca de usuário) e *Alterar senha*; *Fechar* encerra a sessão.
- `POST /api/auth/login` confere `tb_usuarios.usuario` e `senha`. A senha é comparada como o `PASSWORD()` do MySQL (`*` + SHA1(SHA1(senha))), calculado no Node, então funciona também em MySQL 8 e MariaDB. **Requisito:** a coluna `senha` guarda esse formato (como o Delphi usava).
- Sessão em cookie `HttpOnly` assinado (12 h), sem tabela nova. Defina `SESSION_SECRET` no `server/.env` (frase longa) para as sessões sobreviverem a reinícios.
- Toda rota `/api` exige sessão (exceto login e `/api/health`). O `x-user-id` deixou de valer; o usuário da sessão é quem aparece nos logs de diária/fixa.
- 5 erros seguidos (mesmo IP + usuário) bloqueiam por 60 s.
- Não convertido: a aba *Servidor* é só leitura (a conexão com o banco fica no `.env`, a senha do banco não passa pelo navegador) e o botão *Correções* (que executava `downloads\correcoes.sql` no banco) foi omitido de propósito.
- *Alterar senha*: `u_altera_senha` não foi enviado; regra mínima (senha atual + nova + confirmação).

## Fase 10 – Pesquisa, menu e toastr

- **Pesquisa ao digitar** (sem acento, várias palavras): Clientes (clientes, unidades e produtos), Funcionários, Produtos (servidor, até 5000) e a aba Clientes dele, Tributos (produtos e tributos), unidades da Diária, do Faturamento e do Controle de comandas.
- **Menu**: ícones, um menu aberto por vez (passar o mouse troca de menu), Esc/clique fora fecha, ponto verde nas telas abertas, itens futuros esmaecidos "em breve", nome do usuário na barra.
- **Mensagens e perguntas** usam **toastr** (`components/toast.jsx`): `mensagem(tipo, texto)`, `<Toast aviso>` e `<Confirma>` / `<Pergunta>` (ficam na tela até responder; Esc cancela). Com uma janela modal aberta, o toast aparece dentro dela.

## Ainda não convertido (próximas fases)

- Relatórios ReportBuilder: conferência, alterações, lista de entregas/itinerários, pasta, reclamações, etiquetas (adesiva, validade) e o designer de layout.
- "Imprimir na expedição" (escreve direto em `\\producao\producao` com códigos de impressora): precisa de um serviço de impressão no servidor.
- "Verificar possíveis problemas de programação" (`u_conflitos`).
- Utilitários de manutenção (`LMDButton1`, `LMDButton4`, `LMDButton6`, `LMDButton7`: ajuste em lote de motorista/descrição).
- Telas auxiliares que não foram enviadas: `u_localiza_produto` (substituída por uma busca simples), `u_diaria_cobranca`, `u_recados`, `u_monitor`.
- Login: hoje o usuário vem do header `x-user-id` (ponto marcado com `TODO(auth)`).

## Premissas a confirmar

O esquema do banco foi deduzido dos SQLs do `.dfm`/`.pas`. **Nada foi testado contra um MySQL real.** Confira nomes de colunas e se `tb_diaria`/`tb_fixa` têm outras colunas obrigatórias.

## Avaliação do código Delphi

### Bugs encontrados (o que o sistema antigo fazia de errado)

| Onde | Problema | Na versão nova |
|---|---|---|
| `btnAjustaPrecoClick` | O SELECT traz `preco_preco_cada` e o código lê `produto_preco` (que não existe no resultado): o botão falha. | `UPDATE … JOIN tb_produtos` único |
| `btnAtivaClick` (desativar) | `length(trim(comandas)=0)` com parêntese errado: a condição "sem comanda" não funciona e pode apagar item já cobrado. | `comandas is null or trim(comandas) = ''` |
| `Gerarparaodiaseguinte1Click` | `insert into tb_fixa 'id_cliente=…'` sem `SET` e com `)` sobrando: SQL inválido. | `INSERT … SELECT` |
| `Ajustartodososdias1Click` | `insert into tb_diaria_log` sem `SET`, e grava o id da *diária* num log da *fixa*. | log da fixa correto |
| `tbprdAfterDelete` | `'data,hora=…'` e tabela `prg_diaria_log` (a tabela é `tb_diaria_log`): SQL inválido. | log antes do delete |
| `AtualizaStatus` | Qualquer gravação sobrescreve o status 3 (Cancelada), que é manual. | status 3 preservado (decisão comentada no código) |
| Consultas `tbprd`/`tblst` | `DATE_FORMAT(producao_data,'%X')` usa ano da semana: errado perto de 31/12. | `%Y` |
| Preço total | Divisão por `divisor_basico` zerado. | divisor 0 vira 1 |
| `select max(id)` após insert | Pode pegar o id de outro usuário. | `insertId` |
| `edtHoraf`/`dsprfDataChange` | Limites de turno/carga diferem entre diária (`<=`) e fixa (`<`). | uma função só (`turnoPorHora`, `cargaPorHora`) |
| `dsprfDataChange` | `hora := hora + 1` soma 1 *dia* a um campo de hora (efeito nulo/estranho). | não replicado |

### Estrutura

- **Injeção de SQL em todo lugar**: tudo é concatenação de texto. Na API, tudo é parametrizado e o filtro "Apresentação" usa lista fechada.
- **Regra de negócio dentro de eventos de tela** (`OnDataChange`, `BeforePost`): impossível testar. Agora ficam em `rules.js` e `services/`, com testes.
- **Sem transação**: um erro no meio deixava diária, log e status inconsistentes. Agora cada operação é uma transação.
- **Estado global** (`f_main.tbusr`, `acao`): substituído por `req.userId` e por rotas sem estado.
- **Código morto** (blocos `{ }` e `//` enormes) não foi migrado.
- **Booleanos como texto** `'True'/'False'`: mantidos no banco por compatibilidade, convertidos em `rules.js`.

## Fase 4 – Faturamento (u_faturamento)

Tela `client/src/screens/Faturamento.jsx`, rotas `server/src/routes/faturamento.js`, regras de cliente em `client/src/lib/faturamento.js`, impressão em `lib/print.js` (`comandaTexto`, `demonstrativoTexto`).

Reproduzido: abas Edição/Parâmetros, dois calendários (Conectar período), grade de unidades, "Informações do cliente" (tipo de faturamento, comanda diária, quitar automaticamente), filtros Produtos/Programação/Status, Atualizar, Saída, Gerar comanda, Demonstrativo, Auditoria (baixa), caixa de valor (somente SANCHES/EDUARDO), legenda e cores de linha, rodapé com somas, painel da comanda (Imprimir, Excluir, detalhes, mercadorias).

Diferenças deliberadas em relação ao Delphi:
- Radios filtram imediatamente (Delphi só filtrava no Atualizar).
- Campos qtde cobrada/pendente/quitada são somente leitura (a baixa os sobrescreve).
- Comanda exige itens de uma única unidade; comanda sem detalhe cobrável sofre rollback.
- Exclusão de comanda bloqueada se já faturada (NF ou fechamento).
- "Gerar NFe" (porta de `geraFatura` de u_nfe_fatura, `server/src/services/geraFatura.js`): cria tb_nfe PENDENTE + tb_nfe_detalhes + tb_nfe_itens (agrupados por descrição+preço, impostos por tb_tributos), tb_receita (vencimento = saída + dias_vencto do cliente) e marca a comanda FATURADO, tudo em uma transação. Usa a data de *Saída* da tela. CFOP 5102 (SP) / 6102. Correções de bugs legados: SQL por concatenação → parâmetros; `id_pedido` (variável não inicializada) → 0; parser de alíquota que apagava ".0" ("10.05"→105); colunas duplicadas no UPDATE (volume_especie); bloqueia nova NF para comanda que já tem NF. Mantido: hora de saída = agora + 3h; peso líquido = valor/10 e bruto = valor/10 + valor/100; texto_corpo sem truncar (o comentário do Delphi falava em 148 caracteres, mas não havia código). Código do município (IBGE, 7 dígitos) vem de tabela embutida (`server/src/data/municipios-ibge.json`, 5.571 municípios) porque `nf_municipio_ibge` não existe no banco novo; cidade não encontrada recusa a NF com mensagem clara (o Delphi gravava "0"). A tela de notas (u_nfe_faturamento / u_faturamento_nfe) e a transmissão (EDS Monitor Plus/ACBr) ainda não foram migradas;
- Não testado contra MySQL real: colunas tb_comandas* inferidas — rode `npm run check-db`.

- Edição direta na grade: duplo clique numa célula (Fixa, Extra, Produto, Descrição, Preço, Cobrar como: Descrição/Qtde/Preço) edita no lugar; Enter grava, Tab grava e vai para a próxima, Esc cancela. Duplo clique nas demais células segue abrindo a aba Edição (como no Delphi). Menu Faturamento: Faturamento, Controle de comandas, NFe, Tributos, Quitação (só Faturamento implementado).


## Fase 5 – NFe (u_nfe_faturamento) com a API de NF-e

Tela `client/src/screens/NFe.jsx` ("Nota Fiscal - Eletrônica"), rotas `server/src/routes/nfe.js`, cliente da API `services/nfeApi.js`, montagem do JSON `services/nfeJson.js` (substitui o `ModeloIniNFe`/INI do ACBrMonitor). Menu Faturamento → NFe.

**Como emite.** O servidor Node monta o JSON da nota a partir de `tb_nfe` + `tb_nfe_itens` + `tb_nfe_config` (emitente) e faz `POST /api/empresas/{id}/nfe` na API (ver COMECE_AQUI.md / EMISSAO_NFE.md). A API assina com o A1 e transmite. Configure em `server/.env`: `NFE_API_URL`, `NFE_API_TOKEN` (obrigatório), e opcionalmente `NFE_EMPRESA_ID`, `NFE_XML_DIR` (veja `.env.example`; o `.env` real não vai no zip).

| Botão (Delphi) | Agora |
|---|---|
| Autorizar | valida (as mesmas regras do Delphi + exigências da API), usa `nfe_numero + 1` de `tb_nfe_config`, confere o número em `/nfe/por-numero`, envia, grava chave/protocolo/XML/PDF, status AUTORIZADA e incrementa o contador. Rejeição (422) mantém PENDENTE e mostra cStat/motivo. Lote: uma falha interrompe. Uma autorização por vez (fila). |
| Danfe | abre o PDF gravado em disco ou o da API (`/api/nfe/{id}/danfe`). |
| Cancelar | `POST /api/nfe/{docId}/cancelar` (justificativa 15–255); marca CANCELADA, devolve comandas a PROCESSADO e apaga `tb_receita`, registra evento. |
| Carta de Correção | `POST /api/nfe/{docId}/carta-correcao` (15–1000); registra evento e `nfe_carta_correcao_seq`. A sequência (1..20) é da API. |
| Inutilizar | `POST /api/empresas/{id}/inutilizacoes`; cria linhas INUTILIZADA (uma por número, até 50) com evento. |
| Duplicar | copia nota e itens como PENDENTE, entrada, sem chave/protocolo/XML (o Delphi copiava também chave/protocolo). |
| Criar / Apagar NF | igual ao Delphi (Apagar só PENDENTE). |
| Status Rec.Federal | `POST /api/status/empresa/{id}/consultar`. |
| Enviar Email, Devolução, Enviar à Contabilidade, Devolver ao estoque, Pré Danfe, Procura XML, Danfe Simples | ficam na barra (mesma ordem/posição do Delphi) e avisam "ainda não migrado". |

O id do documento na API (necessário para cancelar/carta/baixar) é obtido por `por-numero` (não foi criada coluna nova). Ambiente (`configuracao.ambiente`) vem de "Condição de emissão" (1 produção / 2 homologação) em Configurações. **Teste primeiro em homologação.** Notas autorizadas pelo ACBrMonitor antes da migração não existem na API: cancelar/baixar essas continua no sistema antigo.

Mapeamentos assumidos (confirme em homologação): CRT por texto (SIMPLES NACIONAL→1, SIMPLES EXCESSO RECEITA→2, REGIME NORMAL→3); CST do ICMS do item (`cfop_cst_icms`/`situacao_tributaria`) ou CSOSN (`tb_nfe.csosn`/`tb_nfe_config.csosn`) no Simples; CST PIS/COFINS do item ou de `tb_nfe_config.cst_pis_cofins`; `indicadorPresenca` 1; `consumidorFinal` false; pagamento único com o total; duplicatas (`tb_receita`) não vão no JSON (a API não tem grupo de cobrança). Código IBGE do município: tabela embutida. Não migrado: e-mail da NFe, devolução, Enviar à Contabilidade, Devolver ao estoque, Pré Danfe, Procura XML, Danfe Simples.

**Fidelidade da tela (revisão).** Reconstruída a partir do DFM, com as mesmas posições: filtro (FILTRAR, Emissão/Autorização/Saída, Período + botão do calendário que alterna hoje ↔ mês, status, Destinatário, NFE de/Á, Referência) e painel de log com "Ok"; painel esquerdo (navegador, placa/UF, saída/hora, Impressão direta e Confirma Email marcados, Duplicata editável — Documento/Vencto/Valor —, barra de progresso, Ativar IBSCBS); grade com as 12 colunas visíveis, cores por status (e variante selecionada) e rodapé (contagem e soma); itens com as 10 colunas e rodapé, e painel de detalhe com abas Produto/ICMS/IPI/PIS-COFINS/IBSCBS e navegador (＋ − ✔ ✖ ⟳); abas Dados do corpo (grade vertical completa, com os botões Destinatário/Salvar/Cancelar), NFe Referência (`tb_nfe_referencia`, com Novo/Salvar/Cancelar) e Eventos; aba Comanda (comandas por `id_nota_fiscal` + itens da comanda).
- Gravar item = `tbnfiBeforePost` + `CalculaProduto`: tributos recalculados de `tb_tributos` (`id_tributo`), `preco_total = preco*qtde`, e `valor_produtos`/`nf_valor_total` da nota = soma dos itens. Incluir item pelo código do produto (preenche descrição/NCM/UN/preço/tributo); excluir item recalcula a nota.
- Aba IBSCBS lê/grava **`tb_tributos`** (cst, cClassTrib, pIBS, pCBS, red_aliq, cBenef), como o DFM (`qryTrib`). Na autorização esses valores vão no JSON quando "Ativar IBSCBS" está marcado. Alterar `tb_tributos` vale para todos os itens que usam aquele tributo (igual ao legado).
- Botão Destinatário: copia endereço/entrega/frete/volume do último `tb_nfe` cuja razão social contém o texto (igual `btnDestinatarioClick`).
- Correção de bug do legado: na aba PIS/COFINS o campo à direita de COFINS estava ligado a `cst_ipi`; agora mostra `cofins_valor`.
- Filtro Destinatário lista `tb_clientes` ativos (`GET /api/nfe/clientes`).

- **Habilitar a API para emitir (aba Certificado).** Configurações → Certificado mostra o estado (`GET /api/nfe/certificado`: token, `/health`, empresa por CNPJ, `temCertificadoAtivo`) e envia o A1 (`POST /api/nfe/certificado` → `POST /api/empresas/onboarding` da API, multipart com cnpj, razaoSocial, uf, regimeTributario, ambientePadrao, senha e o .pfx). Usa CNPJ/razão/UF/CRT/ambiente de `tb_nfe_config` (grave as configurações antes). É transacional na API (senha errada, CNPJ divergente ou vencido não cria nada) e upsert por CNPJ (reenviar atualiza). A senha e o .pfx não são gravados no sistema. Sequência: 1) `.env` com NFE_API_URL e NFE_API_TOKEN; 2) preencher Dados fiscais/Endereço; 3) enviar o A1; 4) status "Pronto para emitir"; 5) testar em homologação.
- **Certificado A3 (docs/INTEGRACAO_A3.md), na mesma aba.** Cadastrar A3 envia só o `.cer` público + descrição + nome do agente (`POST /api/certificados/empresa/{id}/a3`; se a empresa não existir na API ela é cadastrada por JSON antes). O `tokenAgente` é mostrado **uma única vez** numa janela e **não é gravado** (nem PIN). O sistema guarda localmente apenas o `certificadoId` em `server/nfe-a3.json` (`NFE_A3_FILE` muda o caminho; fora do zip). Indicador online/offline do agente (`GET /api/certificados/{id}/agente`, atualiza a cada 15 s), botão Revogar agente (`DELETE .../agente/{agenteId}`) e vínculo manual pelo id do certificado (para quem cadastrou pelo painel). Ao autorizar, se o agente estiver offline a nota nem é enviada (continua PENDENTE, número não consumido, mensagem "tentar de novo"); o 503 `AgenteCertificadoException` da API recebe o mesmo tratamento. Os nomes dos campos da resposta (`certificadoId`/`id`, `agenteId`, `online`, `tokenAgente`) foram lidos de forma tolerante porque o guia não traz exemplos de resposta — confirme no primeiro cadastro real.
- Certificado A3: a emissão não muda (mesmo JSON). Se o agente da máquina do token estiver offline a API responde 503 `AgenteCertificadoException`; o sistema trata como falha temporária (nota continua PENDENTE, número não consumido, mensagem "tentar de novo"). Cadastro do A3, pareamento e revogação do agente continuam sendo feitos pelo painel/API (não há tela no sistema).


## Produção (Cloudflare Tunnel → 192.168.15.8)

- `paes.x-star.com.br` → `http://192.168.15.8:5072` (front: `client/serve.mjs` serve `client/dist` e encaminha `/api` para a API) e `paes-api.x-star.com.br` → `http://192.168.15.8:5071` (API). O front usa `/api` relativo: com o proxy do `serve.mjs`, o navegador só fala com `paes.x-star.com.br` (sem CORS). O hostname `paes-api` fica opcional — remova-o do túnel se não for usar a API diretamente.
- Unidades systemd em `deploy/` (`paes-api.service`, `paes-app.service`).
- O sistema tem login próprio (Fase 9; defina `SESSION_SECRET`). Mesmo assim, antes de expor na internet, considere proteger `paes.x-star.com.br` (e `paes-api`, se mantido) com Cloudflare Access (Zero Trust → Access → Applications). Sem isso qualquer pessoa com a URL altera o banco e emite NFe.


## Fase 11 – Impressão direta, por impressora e térmica

- `agente-impressao/` (Node, sem dependências) roda em cada estação em `127.0.0.1:9101`; ver `agente-impressao/README.md` (instalação com `instalar-windows.bat`).
- No sistema: **Ferramentas > Configurar impressoras** liga cada documento (etiqueta do ítem, de validade, de nutricionista, de mercadorias, cupom da expedição) a um destino do agente, por computador (guardado no navegador). Sem destino, ou com o agente fora do ar, imprime pelo navegador (com aviso).
- Etiquetas: o layout HTML/CSS já existente (62×45 mm) é desenhado em imagem (`lib/impressora.js`) e enviado como PNG (driver do Windows, inclusive Brother) ou convertido em 1-bit para ESC/POS (`GS v 0`), ZPL (`^GFA`) ou TSPL (`BITMAP`) — `lib/rasterizar.js`, com testes. O cupom da expedição sai em texto nativo ESC/POS.
- **Não testado em hardware**: parte Windows (PowerShell/winspool), serial, polaridade TSPL (opção "inverter bits"), posições em impressora real. Faça o *Teste* em cada destino.
- Após atualizar: `cd client && npm install` (toastr/jquery) e `npm run build`.
- **Instalação pelo próprio sistema:** Ferramentas > Instalar agente de impressão baixa `instalar-agente-impressao.bat` (servido por `GET /api/agente/instalador.bat`; o pacote vem de `GET /api/agente/pacote`, público e sem segredos, de `agente-impressao/`). O .bat (leva o agente embutido, sem baixar nada do sistema; força TLS 1.2 para o Node) se eleva a administrador, instala Node.js (winget, ou MSI de nodejs.org), grava o agente em `C:\PaesAgenteImpressao`, adiciona o endereço do sistema às origens, cria a tarefa agendada (logon, oculta) e abre a página de cadastro. `remover.bat` desfaz. **Não testado em Windows real.** `AGENTE_DIR` altera a pasta do agente no servidor.

## Fase 12 – JSON da NFe alinhado e ambiente visível

- `montaJsonNfe` agora envia também `configuracao.orientacaoDanfe: "retrato"`, `dataEmissao` (Brasília, ISO com -03:00), `tipoEmissao: 1`, `finalidade: 1`, `emitente.codigoPais/nomePais` (1058/BRASIL), `gtin: "SEM GTIN"` quando o EAN não é válido (8/12/13/14 dígitos), `aliquotaIcms: 0` no Simples e `destinatario.email` (se houver `cliente_email`). `consumidorFinal` vem `true`, como no JSON da outra aplicação; defina `NFE_CONSUMIDOR_FINAL=false` no `server/.env` para revenda/B2B. **Confirme com a contabilidade qual vale para os clientes.**
- **Ambiente (Homologação/Produção):** Faturamento > NFe > Configurações > NF-e tem dois cartões de escolha. Passar para Produção exige digitar `PRODUCAO` (também validado no servidor). O ambiente aparece sempre no menu (selo âmbar HOMOLOGAÇÃO ou vermelho pulsante PRODUÇÃO, que também pinta a barra de título) e **Autorizar** em produção pede confirmação.

## Fase 13 – Desempenho da tela de NFe

- **Causa do travamento** ("a página não responde / deseja sair?"): a lista devolvia `select n.*` de até 4000 notas (todas as colunas de `tb_nfe`) e o React redesenhava todas as linhas a cada tecla/clique.
- **Correção:** `GET /api/nfe` devolve só as colunas da grade e as **1500 notas mais recentes** do filtro (aviso na tela se o limite for atingido: refine o período); a nota completa é buscada ao selecionar (`GET /api/nfe/:id`, com espera de 150 ms e descarte de respostas atrasadas); as linhas da grade são memoizadas. No teste com 1500 notas: clique ≈ 0,2 s e filtrar ≈ 0,1 s.
- **Opcional (banco):** se o filtro por período/status ainda estiver lento no MySQL real, crie índices (uma vez; ignore o erro se já existirem):
  `create index idx_nfe_emissao on tb_nfe (data_emissao, status_e);` · `create index idx_nfe_saida on tb_nfe (data_saida, status_e);` · `create index idx_nfe_numero on tb_nfe (nfe_numero);`

## Fase 14 – Tributos com rolagem virtual

- A grade de produtos/tributos desenha só as linhas visíveis (~30), então abre, rola, marca e aplica rápido mesmo com milhares de produtos (teste: 20.000 produtos, cada ação ≈ 0,1 s). Linhas têm altura fixa (texto longo é cortado com "…"). Sem dependências novas.

## Fase 15 – Cadastros remodelados (Clientes, Produtos, Funcionários)

- Formulários em cartões por seção (grade de 12 colunas, sem posições absolutas), interruptores no lugar das caixas, navegador (⏮ ◀ ▶ ⏭ ＋ － ✎ ✔ ✖ ⟳) em grupo arredondado e grades com cabeçalho fixo e rolagem virtual (`components/GradeCad.jsx`, `components/janela.js`).
- Nenhum campo de edição foi removido (exceto o caminho da imagem do funcionário, só informativo). As **grades** mostram só as colunas úteis (clientes 11, unidades 11, produtos 7 em vez de 30+); a lógica de gravação, código automático, descrição de expedição por opção, etiquetas e tabela de preços não mudou.
- Clientes: "Dados do cliente" abre na lista e recolhe sozinho nas abas Unidades/Produtos para dar espaço (clique para reabrir). "Conectar unidades"/"Esconder inativas" ficaram na aba Unidades.

## Fase 16 — Tela de NFe redesenhada
- Barra de 16 botões → 5 ações principais (Criar, Autorizar, Danfe, Duplicar, Cancelar) + menu **Mais ações** (Carta de Correção, Inutilizar, Status Receita Federal, envios, Pré Danfe/Danfe Simples/Procura XML, devoluções, Emitente/ambiente/certificado, Envio/Resposta).
- Filtro em fluxo (segmentado/chips), log recolhível (botão **Log** com contador), lateral em cartões (Transporte e saída, Duplicata, Opções, progresso).
- Cabeçalho mostra o ambiente (Homologação/Produção) e a situação da nota em foco. Todas as funções e a confirmação de produção foram mantidas.

## Fase 17 — Programação diária redesenhada
Cabeçalho com data/relógio/resumo por status e menu ⚡ Ações do dia; lateral com calendário, apresentação (chips) e lista de clientes com marcador de status; cabeçalho da empresa com status em botões segmentados e itinerário; abas em pílulas. Funções e abas (diária, fixa, reclamações, configurações) inalteradas.

## Fase 18 — Etinerário e Cargas
**Etinerário** (`u_etinerario`): horários de roteiros por motorista (incluir/alterar/excluir; exclusão bloqueada se houver empresas ou programações), empresas dentro do roteiro (ordem de entrega com Subir/Descer, tirar do roteiro) e empresas fora (colocar no roteiro; opção de incluir as que já estão em outros). Imprime o relatório "Etinerário de entregas" (uma página por motorista). API: `/api/itinerario/*`.
**Cargas** (`u_cargas`): *Carga diária* (filtros Tipo/Embalagem/Programação/Carga/Extra/Região/Expedição/Itens, cores especial/cancelado/separado, seleção múltipla, embalagem em lote, combos Embalagem/Etinerário do item, etiquetas adesivas com log `origem=CARGA`, Enter imprime, "Separar" pelo nº da etiqueta) e *Carga fixa* (dia da semana + chips de filtro, embalagem/etinerário). API: `/api/cargas/*`; filtros montados com parâmetros em `services/cargas.js` (testados).
Correções em relação ao Delphi: filtro "Carga" (1ª/2ª/3ª) agora funciona na diária; `p.extra_cortado` (alias inexistente) na carga fixa; JOIN com `tb_fixa` que duplicava linhas removido; `<>` com NULL tratado; motorista da fixa usa o roteiro do próprio item (com a distribuição como reserva).
Pontos a validar no banco real: colunas de `tb_roteiro` (só `horario`, `descricao`, `id_funcionario` são gravadas) e `tb_roteiro_distribuicao` (grava `id_cliente`, `id_unidade`, `roteiro_ordem` e `cliente_unidade` = "nome id_cliente/codigo").

## Fase 19 — Eventos fiscais da NF-e modernizados (conforme EMISSAO_NFE.md)

Menu **Mais ações** da NFe agora abre o painel `components/NfeFiscal.jsx` (abas: Cancelar, Carta de correção, Devolução, Inutilizar, Consultas, Numeração, Arquivos).

- **Cancelar**: justificativa 15–255 com contador, confirmação extra em produção, idempotente (API).
- **Carta de correção**: texto 15–1000 pré-preenchido com a carta anterior (a SEFAZ mantém só a última), sequência automática n/20, histórico.
- **Devolução** (`POST /api/nfe/:id/devolucao`): nota de entrada PENDENTE (CFOP 1202, CSOSN 900, pagto 90, CST IPI 03/PIS/COFINS 98) com a chave original em NFe Referência; a original vira DEVOLVIDO. Em transação; bloqueia dupla devolução (bug do Delphi, que copiava chave/protocolo e permitia repetir).
- **Devolver ao estoque** (`POST /api/nfe/:id/devolve-estoque`): só administrador (substitui a senha fixa `lev2020` do Delphi).
- **Inutilizar** + histórico (`GET /api/nfe/inutilizacoes`).
- **Consultas**: status do serviço, situação por número (`por-numero`) e protocolo por chave (`/nfe/consultar`).
- **Reenviar** (`POST /api/nfe/:id/reenviar`): reenvio idempotente do mesmo XML para nota PENDENTE com erro de transmissão; aplica a autorização localmente (mesma rotina da emissão, sem incrementar o contador).
- **Numeração** (`GET/PUT /api/nfe/series`): lista as séries da API, compara com o número local e inicializa o próximo número.
- **Arquivos**: DANFE, XML, PDF/XML do cancelamento, DANFE cancelada, XML de cada CC-e e retorno bruto da SEFAZ (`GET /api/nfe/:id/arquivo/:nome`).

Ainda não migrados (menu mostra "em breve"): Enviar e-mail, Enviar à Contabilidade, Pré Danfe, Danfe Simples, Procura XML.

## Fase 20 — Mercadorias rápida, etiquetas fiéis ao Delphi, impressoras editáveis

- **Mercadorias**: a grade usa linhas memoizadas e rolagem virtual (testado com 4.000 itens: cada clique responde em um quadro) e o log de etiquetas do item vem do cache na hora, com a consulta ao servidor em segundo plano (200 ms depois de parar de navegar).
- **Etiqueta de mercadorias** (`etiquetaMercadoria` em `lib/print.js`): posições e fontes do `ppAdesivas` de `u_mercadorias.dfm` (nome 24pt negrito em uma linha cortada no limite, traço, "dia - dd / mm / aaaa", hora e quantidade 16pt, descrição 12pt em até 2 linhas, "FAVOR CONFERIR A MERCADORIA" 8pt). O nome antes quebrava em duas linhas e perdia a 2ª.
- **Espaço entre etiquetas**: o envio ao agente era um trabalho de impressão por etiqueta (cada um avançava/cortava papel). Agora é um trabalho só: imagem empilhada (driver do Windows, lotes de até 580 mm), bytes concatenados (ZPL/TSPL/ESC-POS, corte só no fim). Se ainda sobrar espaço, reduza a **Altura (mm)** do destino na página do agente (o Delphi usava 45 mm).
- **Agente — editar**: botão **Editar** em cada destino (nome fixo, para não desligar o mapeamento dos documentos).
- **Agente — não perder impressoras**: (1) o config lido com BOM (gravado pelo instalador no PowerShell 5) era tratado como vazio e o próximo salvar apagava tudo — agora o BOM é aceito e o instalador grava sem BOM; (2) arquivo ilegível usa o `config.json.bak` e é guardado como `.corrompido-…`; (3) todo salvar faz backup `.bak`; (4) destino que não passa na validação fica guardado e visível ("Corrigir/Excluir") em vez de ser descartado.

### Brother QL-800 (etiqueta adesiva 62 mm)

A QL-800 não fala ZPL/ESC-POS: use o destino **Impressora do Windows + Imagem pelo driver** (na página do agente, escolha o *Modelo pronto* "Brother QL-800": 300 dpi, 62 × 45 mm). O sistema manda **um trabalho com uma página por etiqueta**, e o driver corta a cada página. No driver da Brother (Preferências de impressão): papel **62 mm contínuo** (DK-22205) ou o tamanho 62 × 45 mm, **Corte automático: a cada 1 etiqueta**, **Margem de avanço: pequena (ex.: 1 mm)**, qualidade **Dar prioridade à velocidade** desligada. Se sobrar espaço entre as etiquetas, o ajuste é a margem de avanço do driver e a *Altura (mm)* do destino.

## Fase 21 — Mercadorias imediata e agente que avisa quando não grava

- **Cache da tela** (`lib/mercCache.js`): Mercadorias abre mostrando na hora os dados da data já conhecidos (memória + sessionStorage) e confere com o servidor em segundo plano ("atualizando…"), sem piscar nem perder a seleção. Ao entrar no sistema já busca hoje, ontem e amanhã; trocar de dia vizinho é instantâneo. Depois de converter/imprimir etiquetas, recarrega direto do servidor.
- **Servidor**: conexões do MySQL com keep-alive (sem reconectar depois de ociosas), proxy do front reaproveitando conexão com a API, consulta sem ORDER BY desnecessário e com cabeçalho `Server-Timing: db;dur=…` (aba Rede do navegador) e aviso no log se passar de 1,5 s.
- **Diagnóstico do banco**: `cd server && npm run indices` mede a consulta, mostra o EXPLAIN e aponta índices que faltam (`tb_diaria(data)`, `tb_etiquetas_log(id_diaria)`); `npm run indices -- --aplicar` cria só os que faltam. É a causa mais provável de demora quando a tabela tem muitos anos de dados.
- **Agente**: ao salvar um destino, o resultado aparece colado nos botões ("✔ Salvo." / "NÃO SALVO: motivo") — antes o erro ia para o topo da página, fora da vista. Mensagem do "Imagem pelo driver" em destino de rede explica o que escolher (Brother QL-800 = Impressora do Windows).

## Fase 22 — Passo da etiqueta e Mercadorias com cache no servidor

- **Etiqueta de mercadorias mais "abaixo" a cada etiqueta**: a página era de 45 mm, mas o original (banda do `ppAdesivas`) tem **41,01 mm**; com 45 mm o passo ficava ~10% maior e o conteúdo ia descendo a cada etiqueta em relação ao original. Agora o documento usa 41 mm (`DOCS['etiqueta-mercadorias'].mm`). Em **Ferramentas > Configurar impressoras** cada etiqueta ganhou o campo **Altura mm** (por estação): diminua se ainda descer, aumente se cortar. Vale: ajuste do documento > padrão do documento > altura do destino.
- **Mercadorias**: cache no servidor (`services/mercCache.js`): fresco 8 s, velho até 2 min com atualização por trás, consultas simultâneas dividem uma só, gravações pela API esvaziam, e hoje/ontem/amanhã são reaquecidos a cada minuto. Ao subir, a API verifica com EXPLAIN se `tb_diaria` é varrida inteira e, só nesse caso, cria o índice `idx_diaria_data` (desligue com `AUTO_INDICES=0`). A tela mostra "N itens em X ms" ao lado de "Opções" (passe o mouse: tempo do banco e se veio do cache).

## Fase 23 — Formulários modernizados

- **Programação diária e fixa (inclusão/alteração):** cartão único com o **horário em destaque** (campo grande, foco inicial automático, sugestões de horários do dia em chips), campos agrupados, "pílulas" para opções e Enter como Tab. Componentes em `client/src/components/ItemForm.jsx`.
- **Edição de item de mercadoria (Conversão):** cartão "Mercadoria vendida" (somente leitura nos valores), seta "cobrar como", cartão "Produto cobrado" com foco inicial no código, selo com a diferença de valor (a mais / a menos / igual), observações, "Valor já cobrado" e Salvar/Cancelar. Regras e gravação inalteradas.

## Fase 24 — Editor de impressão, Faturamento e pesquisas

- **Editor de impressão (etiquetas):** em *Ferramentas › Configurar impressoras* (botão **📐 Editor** em cada etiqueta) e em *Venda de mercadorias* (**Ajustar etiqueta**). Pré-visualização em escala com quadriculado de 5 mm; deslocamento da página (→ / ↓), **altura da página (passo entre etiquetas)** e, para cada elemento, deslocamento X/Y em mm (passo 0,1; Shift = 0,5) e tamanho da fonte. "Imprimir amostra" envia a etiqueta de teste. Os ajustes ficam no navegador da estação (`paes_etq_ajustes`) e são aplicados como CSS por cima do layout padrão (`lib/ajustes.js`), tanto no diálogo do navegador quanto no agente/QL-800. "Restaurar padrão" volta ao original.
- **Faturamento:** Parâmetros em cartões (Período, Unidades, Cliente, filtros em pílulas, Atualizar/Saída/Gerar comanda/Demonstrativo/Auditoria, valor total); botão **Recolher filtros** (e recolhe sozinho com a comanda aberta) para a grade ganhar espaço; cores das linhas em tons suaves com barra lateral; aba **Edição** em cartões (Produto, Cobrar como, quantidades, comandas do item); painel da comanda restilizado.
- **Pesquisas:** campo de pesquisa único em todas as telas (ícone, × para limpar, Esc limpa, contador "N de M"); janela **Localizar produto** com busca ao digitar, destaque das palavras, ↑ ↓ Enter, estado "pesquisando/nenhum encontrado"; diálogos em geral com cantos arredondados e fundo claro.

## Fase 25 — NFe: Dados do corpo
Aba "Dados do corpo da NFE" em cartões por seção (Identificação, Destinatário, Valores/Pagamento, Tributos, Frete, Entrega, NF-e…) com navegação rápida por seção, campos com largura proporcional ao conteúdo, interruptores nos campos sim/não, campos somente leitura tracejados e totais em verde; barra com Destinatário/Salvar/Desfazer e aviso de alterações não salvas. A grade de notas encolhe enquanto a aba está aberta para dar espaço ao formulário. Campos repetidos no legado (IBGE duplicado, complemento de entrega no destinatário) deixaram de aparecer em duplicidade.

Atualização automática: ao gerar NFe/faturar (Faturamento, Comandas) ou qualquer alteração em /faturamento, /nfe, /comandas, a tela Nota Fiscal Eletrônica aberta recarrega a lista (evento `nfe-alterada` em `api.js`), mantendo a nota em foco e sem descartar edição em andamento.

## Fase 26 — NFe: desempenho, eventos, e-mail e ajustes de tela

- **Desempenho (travamento com muitas notas):** a nota em foco carrega com **uma única chamada** `GET /api/nfe/:id/detalhe` (nota, itens, eventos, duplicatas, referências, comandas, tributo, em paralelo), com cache e pré-carga das notas vizinhas; a grade é virtualizada (`useJanela`) e as linhas são `memo`. Índices da NFe são criados automaticamente ao subir a API (`AUTO_INDICES=0` desliga; `npm run indices` manual).
- **Campos repetidos removidos** do corpo da NFe; corrigido "IBGE do município" (estava ligado ao IBGE da UF → agora `cliente_cidade_ibge`).
- **NFe referenciada** passou a ser uma seção do corpo (poucas por nota, uso raro), não uma aba.
- **Eventos:** retornos da API agora são gravados/mostrados com homologado, código de status, protocolo, sequência e arquivo; autorização, rejeição, denegação, erro de transmissão, cancelamento, CC-e, inutilização, devolução de estoque e e-mail geram evento. CC-e usa a sequência real; inutilização guarda protocolo/data.
- **Envio por e-mail (novo):** menu *Mais ações › Enviar e-mail ao cliente / Enviar à Contabilidade*, uma ou várias notas (usa as marcadas). Anexa XML autorizado + DANFE PDF (do disco ou baixados da API). Destinatários: cliente → `cliente_email` + `tb_clientes.email_nfe` + `tb_unidades.email_nfe`, cópia para a contabilidade (se `nfe_envia_danfe_contabilidade`) e `email_cc`, Cco `email_cco`; contabilidade → `nfe_email_contabilidade`. SMTP em *Emitente e configurações › Envio de email* (porta 465 = SSL; senão STARTTLS se oferecido; Reply-To = `email_confirmacao`). Uma nota: edita Para/Cc/Cco/assunto/mensagem; várias: conferência em tabela, ou envio direto se "Confirma e-mail" estiver desmarcado. Só notas AUTORIZADAS. Marca `nfe_email_enviado`. Rotas: `POST /nfe/email/previa`, `POST /nfe/email`, `POST /nfe/config/email-teste`.
- **Tela:** *Dados do corpo* e *Eventos* viraram ícones (📋 🗓) na linha da nota, abrindo modal; botão Cancelar saiu da barra (fica em *Mais ações*); *Procura XML* removido; botão **Marcar todas / Desmarcar**.

## Fase 27 — Login e Mercadorias

- **Atualizar a página (F5):** a sessão é um cookie assinado; sem `SESSION_SECRET` o segredo era aleatório a cada reinício da API, derrubando todas as sessões. Agora, sem a variável, o segredo é gerado uma vez e guardado em `server/.session-secret` (não vai no zip; defina `SESSION_SECRET` no `.env` para fixar). No cliente, ao abrir/atualizar, só vai ao login se o servidor responder "sem sessão"; se a API ainda está subindo (rede/5xx) tenta de novo por ~18 s. Falha de rede no login mostra mensagem clara em vez de "Verifique usuário e senha".
- **Login:** botão 👁 para mostrar/ocultar a senha.
- **Mercadorias modernizada:** cabeçalho com data por extenso, calendário em cartão, resumo (itens, unidades, com etiqueta, selecionados), botões claros (Etiqueta adesiva em destaque), histórico de etiquetas do item em foco, filtro por texto, grade com caixas de seleção, etiqueta como "pílula", hora sem segundos, anotações unidas. Mantém seleção Ctrl/Shift, duplo clique para converter, impressão e editor de etiqueta.

## Fase 28 — NFe enxuta e layout de etiqueta compartilhado

- **NFe:** removida a faixa de abas "NFE / Comanda / Resposta da receita federal" (a resposta da API continua em *Envio/Resposta*). **Comandas** virou botão na barra (abre modal). **Apagar NF** virou ícone 🗑 na linha "Ítens da NFe", visível quando a nota não está autorizada/cancelada (o servidor continua recusando esses casos).
- **Ajuste de etiqueta entre estações (sem mexer no banco):** os ajustes do editor (deslocamentos, fontes, altura) agora são gravados no servidor em `server/etiquetas-layout.json` (`ETQ_LAYOUT_FILE` muda o caminho) via `GET /api/layout-etiquetas` e `PUT /api/layout-etiquetas/:tipo`. Cada estação sincroniza ao entrar, ao abrir o editor e antes de cada impressão; o localStorage vira só cache. Na primeira sincronização, se o servidor está vazio, a estação que já tinha ajustes os publica. A impressora de destino continua por estação (de propósito). Faça backup do arquivo junto com `nfe-a3.json`.

## Fase 29 — NFe: ações na linha
- **Apagar (🗑)** e **Clonar (⧉)** ficam na linha de cada nota (apagar só se não autorizada/cancelada). *Duplicar* virou *Clonar*: a cópia nasce PENDENTE, sem XML, PDF, chave, protocolo, recibo, e-mail/impressão marcados. **Danfe** vem logo após **Autorizar** na barra.

## Fase 30
- NFe: removido o seletor "Ativar IBS/CBS" (a emissão segue o padrão do servidor).
- Funcionários: botão **📷 Tirar foto** (câmera do computador/celular, exige HTTPS ou localhost): captura, pré-visualiza, "Usar esta foto" envia como JPEG (≤ 900 px) pela mesma rota da imagem.

## Fase 31 — Agente acessível pelo Linux e Controle de comandas
- **IP/token do agente agora são gravados pela tela** (antes só existiam em `server/.env` / script PowerShell): *Ferramentas › Configurar impressoras › Servidor → agente* grava IP:porta e token em `server/agente-ponte.json` (token nunca volta à tela; vazio = mantém; `AGENTE_URL/AGENTE_TOKEN` do `.env` seguem como padrão). "Salvar e testar" já conecta ao agente. Rotas `GET/PUT /api/impressao/config`.
- **Página do agente (127.0.0.1:9101) ganhou "Acesso pela rede":** liga/desliga a escuta em 0.0.0.0, mostra o IP da máquina, gera/edita/copia o token e aplica na hora (sem reiniciar). Se o servidor não conectar, rode `liberar-rede.ps1` (firewall).
- **Controle de comandas modernizado** (visual, chips de totais, status em pílula) e **filtros nas colunas da própria grade** de unidades/clientes (Unidade, Cliente, Tipo; Enter escolhe a primeira). Um clique na unidade já lista as comandas; trocar Pendentes/Faturadas/Todas atualiza sozinho.

## Fase 32 — Agente: IP/host e COM gravados em qualquer tipo
- Na página do agente, **IP/host, Porta, COM e Baud sempre aparecem e são gravados**, mesmo para destino "Impressora do Windows" (antes o agente descartava esses campos para o tipo Windows, e ao clicar em *Editar* voltavam em branco). Reinstale/atualize o agente (rodar o instalador de novo mantém as impressoras) e salve o destino uma vez.

## Fase 33
- Página do agente: comando de firewall pronto para copiar (porta 9101, só rede local). Tela "Servidor → agente": valida URL/token antes de salvar e avisa se a porta digitada for 9100 (a do agente é 9101).

## Fase 34 — Eliminar comanda sem travar e telas sincronizadas
- **Travamento ao eliminar comanda:** o DELETE/UPDATE filtrava `tb_comandas_detalhes`, `tb_comandas_mercadorias`, `tb_diaria_comandas`, `tb_diaria(id_comanda)` e `tb_diaria_log(id_diaria)` sem índice (varredura completa de tabelas grandes dentro da transação). A API cria esses índices ao subir (só se faltarem; `AUTO_INDICES=0` desliga) e o log passou a ser um único INSERT. Reinicie a API uma vez e aguarde as mensagens `✚ índice criado` no console.
- **Controle de comandas** mostra "Eliminando comanda x (n de m)…" e **recarrega sozinho** quando uma NFe é apagada/gerada/emitida (as comandas voltam a PENDENTE).
- **Faturamento** recarrega sozinho quando uma comanda é eliminada no Controle de comandas ou a NFe muda.

## Fase 35 — Botões de gravar/cancelar
- Varredura nos navegadores de registro: **Gravar** (verde) e **Cancelar** (vermelho claro) agora têm texto, cor e tamanho de botão — cadastros (Navegador de `cad.jsx`: clientes, funcionários, produtos…), reclamações, e na NFe (Transporte e saída, Duplicata, Item e Tributo). Desabilitados continuam esmaecidos. Navegação e atualizar seguem só com ícone.

## Fase 36 — Comanda e demonstrativo pelo agente de impressão
- Novo documento **"Comanda e demonstrativo (faturamento)"** em *Ferramentas › Configurar impressoras*. Faturamento (Demonstrativo e Imprimir comanda) e Controle de comandas (Imprimir, uma comanda por vez com corte, e a pré-visualização) agora imprimem pelo agente quando há destino escolhido; sem destino, continuam no navegador.
- O destino deve ser **ESC/POS** (térmica de cupom): títulos em negrito/altura dupla, itens em fonte condensada (64 colunas). Se o destino for outro tipo, avisa e abre o navegador.

## Fase 37 — Comanda/demonstrativo direto no agente
- **Qualquer tipo de destino** serve para "Comanda e demonstrativo": ESC/POS imprime texto nativo; os demais (ex.: driver do Windows) recebem o cupom desenhado como UMA imagem contínua (largura do destino, padrão 80 mm).
- Comanda/demonstrativo **não abrem mais a pré-visualização do navegador** quando o agente falha: mostram o erro. O Imprimir do Controle de comandas **pergunta e envia direto** ao agente.
- Corrigido o texto dos avisos que aparecia com `&quot;` (escape duplicado no toast).

## Fase 38 — Impressão de comanda/demonstrativo pelo agente
- Causa do erro "This page contains the following errors": `&nbsp;` não existe em XML e o parser da rasterização falhava. Agora é convertido para `&#160;`.
- `cupomComoImagem` aceita estilos desconhecidos (tratados como normais) e nunca gera altura inválida.

## Fase 39 — Faturamento: imprimir demonstrativo/comanda pergunta antes
- Demonstrativo e comanda (painel) pedem confirmação ("Imprimir ... na impressora?") e então enviam direto ao agente.

## Fase 40 — Calendário bonito em Faturamento, Produção e Mercadorias
- O calendário passa a usar o visual da Diária (laranja, cantos arredondados) em todas as telas.

## Fase 41 — Produção modernizada
- Cabeçalho, cartões, botões de impressão por tipo (Resumo / Entrega por destino), abas em pílulas, horários em selos coloridos e detalhamento em cartão. Lógica inalterada.

## Fase 42 — NFe: emitente e configurações modernizados
- Abas: Empresa (razão/fantasia + endereço + inscrições), Tributação, NF-e (numeração, veículo, ambiente, API), E-mail, Certificado. Barra fixa Gravar/Desfazer com estado.
- Redundâncias removidas: razão/fantasia fora do topo, URL/CNPJ repetidos no status do certificado, texto sobre EDSMonitor, ajuda do A3 recolhível.

## Fase 43 — NFe: itens ocupam toda a área disponível
- A grade de itens e o painel de edição do item crescem até o fim da tela (antes tinham 261 px fixos).

## Fase 44 — Menu Outros
- **Relatório de NFEs** (u_relatorio_nfes): calendários De/Até, lista de clientes com pesquisa, grade ordenável (verde = já confirmada), totais, Imprimir e Gerar planilha Excel (`GET /api/nfs/relatorio/xlsx`).
- **Leitura de NFs confirmadas** (u_nf_confirmadas_gr): envia o arquivo do cliente pelo navegador (planilha 1/2, txt 1/2), mostra a pré-visualização com avisos e só então grava; inclusão manual com sugestão de 12%. Usa a API `/api/nfs/*` já existente (grava sempre id_cliente = 10, como o sistema antigo).

## Fase 45 — Relatório de NFEs: todos os clientes
- Abre em "Todos os clientes" (coluna Cliente); clicar num cliente filtra. O "a receber" usa o desconto de cada cliente. A planilha Excel segue o mesmo filtro.

## Fase 46 — Relatório de NFEs: marcar confirmada na linha
- Ícone ✔/✖ em cada NFe: ✖ pede o valor recebido (sugestão com desconto padrão) e grava em tb_nfs_confirmadas; ✔ remove a confirmação (`DELETE /api/nfs/confirmadas/:nf`).

## Fase 47 — Programação diária: cliente permanece ao trocar a data; pesquisa sem deslocar a tela
- Ao escolher outra data a mesma unidade/cliente continua selecionada (se tiver movimento no dia); antes ia para o primeiro da lista.
- O contador "n de m" da pesquisa agora fica dentro do campo, sem empurrar o layout.

## Fase 48 — Agente: "NÃO SALVO: Failed to fetch"
- "Failed to fetch" = a página não conseguiu falar com o agente (processo parado/reiniciando). Reforços: a re-escuta ao ativar o acesso pela rede tenta de novo se a porta demorar a liberar e nunca derruba o agente; erros não tratados são registrados e o agente continua; a página tenta de novo uma vez e mostra uma mensagem clara.

## Fase 49 — Brother QL: "o rolo não corresponde ao selecionado" (29mm x 90mm)
- O trabalho caía no papel padrão do driver (29x90 mm). Agora, sem papel de tamanho exato, usa o papel contínuo da largura (ex.: "62mm") com o comprimento da etiqueta.
- Diagnóstico: `http://127.0.0.1:9101/api/papeis?impressora=Brother%20QL-800` lista os papéis do driver.

## Fase 50 — Cargas: ordenação pelos títulos
- Carga diária e fixa: clique no título (Hora, Saída, Cliente, Qtde…) ordena; 2º clique inverte; 3º volta à ordem original. A seleção por Shift acompanha a ordem exibida.

## Fase 51 — Diária: excluir lançamento; Brother: falha visível e fila limpa
- Diária: ícone 🗑 em cada linha (e botão F4 Excluir). Item fixo não é eliminado: oferece cancelar o item.
- Agente (Impressora do Windows/PNG): acompanha o trabalho na fila; se a Brother recusar (rolo diferente, sem papel, tampa aberta) ou não concluir, remove o trabalho travado e devolve a mensagem de erro ao sistema; trabalhos antigos travados do próprio agente são limpos antes de imprimir.

## Fase 52 — Etiquetas: falha mostra só o erro
- Cargas, Mercadorias, Clientes (nutricionista) e Diária (etiqueta do item, validade, cupom): com impressora configurada para o documento, se o agente falhar aparece só a mensagem de erro, sem abrir a pré-visualização do navegador. Sem impressora configurada continua usando o navegador.

## Fase 53 — Diária: ícone de excluir mais visível

## Fase 54 — Etiqueta impressa com "error on line 3 at column 13"
- A etiqueta tem `<hr>` (tag sem fechamento) e o parser XML da rasterização rejeitava o `outerHTML`. Agora usa XMLSerializer, que gera XHTML válido para qualquer etiqueta/cupom. Testado com a etiqueta de carga (2 etiquetas, texto com & e <).

## Fase 55 — Emissão: retorno da API de NF-e
- PIS/COFINS: envia baseCalculo/aliquota/valor (Pis e Cofins) para CST 01/02 (PISAliq) e para "outras operações" 49, 50–56, 60–67, 70–75, 98, 99 (PISOutr; sem valores = 0). 04–09 seguem NT; CST 03 dá erro explícito antes de enviar.
- CST do ICMS normalizado ("20.0" → "20", "0" → "00"); CST 20 envia o percentual de redução (campo `percentualReducaoBaseIcms` — alinhar o nome com o ICMS20 da API) e exige pRedBC.
- Devolução (CFOPs x20x etc.): finalidade 4 + `documentosReferenciados: [{ chaveNfe }]` com a chave de "NFe referência"; sem chave a nota não é autorizada.
- Pagamento com meio 90 (sem pagamento) vai com valor 0,00.
- Validação antes de autorizar: base de ICMS maior que o item e ICMS diferente de base × alíquota.

## Fase 56 — XSD: IE sem máscara; dhSaiEnt logo após dhEmi
- inscricaoEstadual (emitente, destinatário, transportadora) só com dígitos ("ISENTO" mantido). `dataSaidaEntrada` agora vem logo após `dataEmissao` no JSON (a ordem do XSD é dhEmi, dhSaiEnt, tpNF); se o gerador da API ordenar por conta própria, o ajuste é do lado dela. O CST "20.0" já era corrigido na fase 55.

## Fase 57 — ICMS20 (CST 20) com percentualReducaoBcIcms
- A API passou a aceitar CST 20: enviamos `percentualReducaoBcIcms` (do cadastro do tributo; sem ele, derivado da base gravada se for menor que o item). Base e valor do ICMS do item são recalculados a partir do percentual, o que corrige itens com base/ICMS copiados de outro item (caso GOMES & ANTUNES, 493.03). Se não houver percentual nem base menor que o item, a nota não é autorizada e a mensagem diz o que preencher.

## Fase 58 — Copiar mensagem de erro; devolução acha a chave sozinha
- Toasts de erro têm botão "📋 Copiar" (ficam 20 s na tela).
- Devolução sem chave referenciada: ao autorizar, o sistema procura a NF-e original pelo número citado no texto ("devolução total da NFe 69848"), grava a referência e segue; só barra se não achar a chave de 44 dígitos.

## Fase 59 — IBS/CBS obrigatório (SEFAZ 1115)
- O grupo ibsCbs agora é sempre enviado (CST de 3 dígitos e cClassTrib de 6: "1" → "000001") a partir do código de tributação do item. Item sem CST/cClassTrib no tributo é barrado antes do envio com mensagem explicando.

## Fase 60 — XML/DANFE da API, logo e orientação
- Consultar nota (por número ou chave) e imprimir/abrir DANFE ou XML agora buscam o arquivo na API de NF-e, guardam em disco e atualizam `nfe_xml_file`/`nfe_pdf_file`; sem API, usa a cópia local.
- Configuração NF-e › aba NF-e: orientação do DANFE (retrato/paisagem, enviada em `configuracao.orientacaoDanfe` e em `danfe.pdf?orientacao=`) e logo da empresa (PNG/JPG ≤ 1 MB). Guardados em `server/nfe-danfe.json` e `nfe-logo.bin` (sem mexer no banco).
- O endereço do logo na API é suposição (`PUT /api/empresas/{id}/logo`, campo `arquivo`); ajuste com `NFE_API_LOGO_PATH` / `NFE_API_LOGO_METHOD` no `server/.env` conforme a documentação.

## Fase 61
- Autorizar NFe: o nome do usuário gravado em `usuario_autorizacao_nfe` é cortado no tamanho da coluna (lido do banco), corrigindo "Data too long".

## Fase 62
- Consulta por chave/número: se a API já tem a nota AUTORIZADA e o app ainda a vê PENDENTE (retorno perdido), o app é ajustado (status, chave, protocolo, data, XML e DANFE) e a tela informa.

## Fase 63
- Após autorizar/reenviar/ajustar pela consulta, a lista é recarregada (cor e dados novos) mantendo a nota em foco visível mesmo fora do filtro (`GET /nfe?fixa=id`), para imprimir o DANFE.

## Fase 64
- ICMS CST 20 com redução de base de 100% (a API exige percentual entre 0 e 100, exclusivo) é enviado como CST 40 (isento), sem base/alíquota/valor de ICMS, mantendo o cBenef.

## Fase 65
- Logo: o envio descobre o endereço/formato no swagger da API (fallback PUT/POST /api/empresas/{id}/logo); o erro mostra a tentativa feita.
- Consulta/ajuste: corrigido "onAjustou is not defined".
- Danfe sem XML guardado abre a tela de Consultas.
- ICMS CST 20 com redução 100% volta a ir como CST 20 (percentual 99,99, cBenef mantido), pois cBenef SP020030 é incompatível com CST 40.

## Fase 66
- SEFAZ 1033 (grupo de redução de alíquota IBS/CBS): CST 200 + classificação 200003 envia redução 100% e alíquota efetiva 0, com os nomes de campo lidos do swagger da API (`GET /api/nfe/api-schema-ibs` mostra o schema). Outras classificações reduzidas precisam do percentual em `RED_IBS` (nfeJson.js).

## Fase 67
- IBS/CBS reduzido usa os nomes documentados pela API (reducaoAliquotaIbsUf, aliquotaEfetivaIbsUf, reducaoAliquotaCbs, aliquotaEfetivaCbs), sem depender do swagger.
- Logo: tenta POST /api/empresas/{id}/logo (campos arquivo, logo, file, arquivoLogo) quando não há swagger.

## Fase 68
- Logo conforme a documentação da API: `POST /api/empresas/{id}/logo` (multipart, campo `arquivo`), conferindo depois com `GET` e `temLogo`; a tela mostra se a API confirma o logo.

## Fase 69
- Após autorizar/reenviar/consultar/abrir Danfe, o detalhe da nota em foco é relido (cache descartado), atualizando XML, PDF, chave e protocolo na tela. O botão Danfe pede o arquivo ao servidor (que busca na API se faltar) e só abre Consultas se falhar.

## Fase 70
- Itens da NFe: a ficha à direita deixou as 5 abas (Produto/ICMS/IPI/PIS-COFINS/IBSCBS) e passou a mostrar tudo agrupado: Produto, ICMS, IPI·PIS·COFINS e Código de tributação (cBenef, redução de base ICMS, CST/cClassTrib/pIBS/pCBS, id e total de tributos). CST ou CSOSN conforme o regime. Removidos os campos repetidos (pRedBC do item: a redução usada na emissão vem do código de tributação).
- Corrigido: `recarregaDetalhe` sem declaração (fase 69).

## Fase 71
- Ficha do item em pastas (Produto, ICMS, IPI/PIS/COFINS, Tributação), sem rolagem. cClassTrib com mais de 6 dígitos gera aviso específico; campos CST/cClassTrib limitados a 3/6 dígitos.

## Fase 72
- CFOP por item: usa o CFOP do item, senão o do código de tributação do produto (1º dígito ajustado ao destino), senão o da nota. A edição do CFOP/impostos na ficha do item agora grava (antes era sobrescrita pelo recálculo do código de tributação).
- CST de ICMS fora de 00/20/40/41/50 (ex.: 60) é avisado antes do envio: a API ainda não aceita.

## Fase 73
- CFOP do item: usa o do item, se houver; senão o da nota. Salvar o item não sobrescreve mais o CFOP com o do código de tributação.

## Fase 74
- Removida a trava local de CST de ICMS (a API passou a aceitar o CST 60); a API valida.

## Fase 75
- NCM: conferido na tabela oficial do Siscomex (baixada e guardada em `server/ncm-tabela.json` por 30 dias; sem ela, consulta a BrasilAPI; sem rede, não bloqueia). Cadastro de produto mostra ✔/✖ ao digitar e recusa NCM inexistente; a autorização da NFe confere os NCM dos itens antes de enviar. Rota `GET /api/cadastros/produtos/ncm/:codigo`.
- Grade de itens da NFe: setas ↑/↓/Home/End mudam de item. Aba Envio/Resposta: botão Copiar tudo.

## Fase 76
- NCM: componente `NcmCampo` (conferência ✔/✖ + pesquisa 🔍 por código ou descrição) no cadastro de produtos e na ficha do item da NFe. Rotas `GET /api/nfe/ncm?q=` e `/api/nfe/ncm/:codigo` (e `/api/cadastros/produtos/ncm`).

## Fase 77
- Lista de NFes: coluna de caixas de seleção para marcar notas em qualquer ordem (e marcar todas no cabeçalho); o botão Autorizar mostra a quantidade marcada. Ctrl+clique e Shift+clique continuam valendo.

## Fase 78
- Danfe com notas marcadas: gera um único PDF com as DANFEs das notas AUTORIZADAS marcadas (`POST /api/nfe/danfe-lote`, usa `pdf-lib`: rode `npm install` no server). Notas não autorizadas ou sem arquivo são listadas no aviso.

## Fase 79
- Logo: botão "Diagnóstico do logo" (aba NF-e da configuração) mostra o logo guardado, o que a API tem (temLogo, GET /logo) e os endpoints de logo do swagger; com botão Copiar.

## Fase 80
- Logo: envio pelo CNPJ (`/api/empresas/por-cnpj/{cnpj}/logo`, depois `/{cnpj}/logo` e `/{id}/logo`), em multipart, imagem bruta e JSON base64; o erro lista todas as tentativas. A API precisa estar com o build que tem essas rotas.

## Fase 81
- Logo: o envio não depende mais de achar o Id da empresa (a busca do Id falhava antes de qualquer envio, ex.: sem A1 ativo); usa só o CNPJ.

## Fase 82
- Consulta por número/chave: a nota do app é localizada também por chave com máscara e por número com série vazia/0, em qualquer status exceto inutilizada; nota já AUTORIZADA sem chave/protocolo (emitida em outro sistema) é completada; mensagem clara quando não há nota no app.

### Fase 83 — XML/DANFE também da pasta da API
Quando a API não devolve o XML/DANFE (ou a consulta/ajuste não consegue baixar), o app procura o arquivo na pasta onde a própria API guarda: `NFE_ARQUIVOS_DIR/<cnpj>/NFe/<data da autorização>/<NFe ou Evento>/<chave>…` (padrão `/mnt/hdbackup/API/levpao/arquivos/nfe/EDSMonitorPLUS/Arqs`). Tenta os formatos comuns de pasta de data e, se não achar, varre a pasta do CNPJ pela chave (ignorando eventos). Diagnóstico: `GET /api/nfe/:id/arquivos-diagnostico`. A pasta precisa estar montada no servidor do app e legível pelo usuário do serviço.

### Fase 84 — Logo do DANFE
Removido o botão "Diagnóstico do logo" (a rota continua no servidor). Ao abrir Configuração › NF-e, o logo mostrado é o atual da API (GET do logo da empresa pelo CNPJ), com cópia local de reserva.

### Fase 85 — Telefone no XML
Rejeição 225 (Falha no Schema XML) causada por telefone do destinatário com 16 dígitos (dois números juntos no cadastro). O telefone do emitente/destinatário só vai ao XML se tiver 6 a 14 dígitos; senão é omitido.

### Fase 86 — Cadastro de clientes › Unidades: pesquisa e paginação
Na aba Unidades há campo de pesquisa (nome, código, endereço, bairro, cidade, contato, nutricionista, região). Com "Só unidades deste cliente" marcado mostra as do cliente; desmarcado, todas as unidades. A grade é paginada (50 por página) e o navegador ◀ ▶ leva à página da unidade.

### Fase 87 — Cadastro de clientes: filtro junto ao cliente e atalho da unidade ao cliente
"Só unidades deste cliente" foi para a barra do cliente (no alto). Na ficha da unidade há o cliente dono e o botão "Ir para o cliente", que abre o cadastro dele.

### Fase 88 — E-mail da NFe
Remetente: se o usuário SMTP é um e-mail (ex.: nfe@levpao.com.br) ele é o "De"; o e-mail do emitente (ex.: sac@) vai como Responder-para. Corrige o 553 "Sender address rejected: not owned by user". Botão ✉ na linha de cada NFe autorizada (envia ao cliente, abre a tela de envio).

### Fase 89 — Envio de e-mail: todos os destinatários com checkbox
A tela de envio lista todos os e-mails (Para, Cc, Cco) de cada nota, cada um com checkbox (marcados por padrão); só os marcados recebem. Nota única permite acrescentar outros e-mails. O envio de várias notas também passa por essa tela (o interruptor "Confirma e-mail" saiu). O servidor aceita `selecao` (subconjunto dos e-mails propostos por nota).

### Fase 90 — Botões Autorizar / Danfe conforme o status
Autorizar só fica habilitado se há nota PENDENTE (em foco ou entre as marcadas; o contador mostra quantas). Danfe só fica habilitado para nota AUTORIZADA (ou CANCELADA, se for uma só), e o contador das marcadas conta só as autorizadas.

### Fase 91 — Lista de destinatários completa
Além de Para/Cc/Cco propostos, a lista do envio mostra a contabilidade (desmarcada) quando "enviar DANFE à contabilidade" está desligado; basta marcar para incluir.

### Fase 92 — Aviso de limite da lista de NFe
O aviso "Mostrando as 1500 notas mais recentes…" deixou de ser mensagem em destaque: agora é um "+" discreto ao lado do total no rodapé da grade, com a explicação ao passar o mouse.

### Fase 93 — Filtro de período
O botão 📅 (hoje ↔ mês) e a troca das datas ligam automaticamente o checkbox "Período".

### Fase 94 — Grade some ao voltar da configuração
A rolagem virtual (`janela.js`) guardava a posição/altura do elemento antigo quando a aba era trocada e a grade remontava vazia até um clique/rolagem. Agora ela mede de novo e refaz o observador sempre que o elemento muda; ao voltar para a aba NFe a nota em foco é trazida à vista. Vale para todas as grades com rolagem virtual.

### Fase 95 — XML/DANFE visíveis ao sistema antigo
Após autorizar, o XML e o DANFE ficam em `NFE_XML_DIR` e o caminho gravado em `nfe_xml_file`/`nfe_pdf_file` usa `NFE_XML_DB_PREFIXO` (como as outras máquinas veem essa pasta, ex.: `\\192.168.15.8\nfe`), para o sistema antigo imprimir o DANFE de qualquer PC. A leitura converte de volta. Se a resposta da autorização vier sem XML ou PDF, o app baixa da API na hora. Requer compartilhar a pasta `NFE_XML_DIR` na rede (Samba) com leitura para as máquinas.

### Fase 96 — Saída/Entrada no topo da edição e no clone
Novo cartão "Tipo de operação" (⬆ Saída / ⬇ Entrada, campo `movimento_es`) no topo da coluna de edição da NFe. O clone mantém o tipo da nota original (antes virava Entrada). Nota nova nasce como Saída.

### Fase 97 — Programação diária: foco após pesquisar o produto
Depois de escolher o produto na pesquisa (duplo clique no código), o foco vai para "Descrição da comanda / nota fiscal".

### Fase 98 — Enter no último campo grava (Programação diária e fixa)
Em item em edição, Enter no último campo do painel grava o item (as mesmas validações do botão Gravar).

### Fase 99 — Enter e Ctrl+Enter nos campos de texto (Programação diária)
Nos campos de anotação (faturamento/produção) Enter segue o fluxo (próximo campo; no último, grava o item) e Ctrl+Enter insere nova linha.

### Fase 100 — Enter em "Informe p/ produção" grava
O campo "Informe p/ produção" é o último do fluxo da programação diária: Enter nele grava o item (antes seguia para os campos de baixo — produção, turno, embalagem — e parecia travado).

### Fase 101 — Programação fixa: grava ao escolher o produto
Ao selecionar o produto (pesquisa ou código), se hora e quantidade já estão preenchidas o item é gravado na hora; senão o cursor vai para o que falta.

### Fase 102 — Item em edição destacado (diária e fixa)
A linha do item que está sendo alterado (ou a linha "novo") fica laranja com ✎ no indicador, até gravar ou cancelar.

### Fase 103 — Destaque mais forte do item em edição
Laranja vivo (#ff8a00) com texto escuro em negrito, bordas marcadas e o indicador ✎ pulsando (sem animação se o sistema pedir menos movimento).

### Fase 104 — Item em edição em amarelo forte
Troca o laranja por amarelo forte (#ffe600) com texto escuro em negrito.

### Fase 105 — Versão do build no rodapé
O rodapé e a tela de login mostram `fase NNN · build aaaa-mm-dd hh:mm`, para conferir se o deploy pegou. Atualizar `FASE` em `client/vite.config.js` a cada entrega.

### Fase 106 — Destaque vale já ao abrir o painel de alteração
O item aparece em amarelo forte assim que o painel "Alterando item" é aberto (F3), não só depois da primeira edição. Conferido com captura de tela no preview.

### Fase 107 — Destaque do item em edição na Programação fixa
As linhas da fixa já usam amarelo/ciano (especial/produção); o item em edição fica laranja forte com moldura escura grossa e indicador pulsando. Conferido em captura de tela.

### Fase 108 — Cliente sincronizado entre Faturamento e Controle de comandas
A unidade escolhida em uma das telas é seguida pela outra (módulo `client/src/lib/unidadeSel.js`), ao abrir e a cada troca, nos dois sentidos. Não troca se houver edição não gravada na tela que seguiria.

### Fase 109 — Sincronismo também pela linha em foco do Faturamento
Com "Conectar cliente" desligado a grade do Faturamento mistura clientes: agora a unidade da linha em foco (`id_unidade`) também é publicada, e o Controle de comandas a segue. Cada tela ignora o próprio aviso (origem 'fat'/'cmd').

### Fase 110 — Sincronismo visível: rola até a unidade e já lista as comandas
O estado já acompanhava a unidade, mas a lista (148 unidades) ficava no topo, sem mostrar a selecionada, e a grade de comandas ficava em "Clique em Atualizar". Agora a lista rola até a unidade selecionada (ao trocar e ao voltar para a aba) em Faturamento e Controle de comandas, e o Controle de comandas, ao abrir já numa unidade herdada, lista as comandas.
