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

### Fase 111 — Dispositivos autorizados
Um site não lê o MAC da placa de rede; cada navegador recebe do servidor um código único e permanente (cookie `paes_disp`, HttpOnly, 5 anos) guardado na tabela `tb_dispositivos` (criada sozinha). Não habilitado → tela "Dispositivo não habilitado para uso do aplicativo." com o código (confere a cada 10 s e abre quando liberado) e todas as rotas da API respondem 403. O administrador (SANCHES) libera/bloqueia/nomeia/exclui em **Ferramentas › Dispositivos autorizados**. Partida segura: enquanto nenhum dispositivo estiver habilitado o controle fica desligado (todos entram e aparecem como pendentes); ao habilitar o primeiro, o controle liga. Emergência: `DISPOSITIVOS_LIVRE=1` no `server/.env`. Se o banco não permitir criar a tabela ou ficar fora do ar, o sistema não trava (deixa passar e registra no log). Limitações: limpar cookies/trocar de navegador gera novo código; quem copia o cookie de um PC liberado herda a liberação.

## Fase 112 — Área da fábrica (por máquina)
- Cada dispositivo (**Ferramentas › Dispositivos autorizados**) tem a coluna **Acessa**: *Faturamento* (sistema completo, com login) e/ou *Fábrica*. Coluna `areas` em `tb_dispositivos` (criada sozinha; dispositivos já liberados ficam só em *Faturamento*).
- Máquina só *Fábrica*: **sem login**, entra automaticamente como o usuário único **fabrica** (criado em `tb_usuarios` na primeira vez, com senha inutilizável; os logs de diária/fixa mostram "fabrica"). Vê só o menu Programação (Fixa/Diária com Reclamações, Mercadorias, Produção, Etinerário, Cargas) e Ferramentas › impressoras; **pode alterar** dentro dessas telas.
- A API barra no servidor tudo que não é da fábrica (NFe, faturamento, comandas, cadastros, dispositivos…) com 403 `AREA_NEGADA`: lista em `PREFIXOS_FABRICA` (`services/dispositivos.js`).
- Máquina só *Faturamento* funciona como antes. Com as duas marcadas, entra pelo login normal. O administrador não consegue tirar o Faturamento da própria máquina.
- Sem dispositivo habilitado (controle desligado) ninguém ganha acesso sem login.

## Fase 113 — Menu da fábrica conforme o sistema real da fábrica (fabrica.zip)
- O sistema da fábrica (u_main) tem: Programação, Produção, Mercadorias, Cargas, **Reclamações**, **Pedidos extras** (+ Tema e Atualização). Máquina só *Fábrica* agora vê exatamente isso (+ Ferramentas › impressoras); Etinerário saiu do menu da fábrica (a fábrica real não o abre).
- Nova tela **Reclamações** (período De/Até, todas as unidades; grava a justificativa) — `GET /api/reclamacoes?de=&ate=`.
- Nova tela **Pedidos extras** (`tb_extras`: novo/alterar; só os ainda não digitados; não altera pedido já digitado) — `/api/extras`, `/api/extras/opcoes`. Ambas aparecem também no menu Programação do faturamento.
- Não portados (dormentes no sistema real): Recados (`tb_mensagens_producao`, o timer não tem rotina), Funcionários e Calendário (botões ocultos). Tema/Atualização não se aplicam à web.

## Fase 114 — Janela da fábrica com o visual do sistema original
- Máquina só *Fábrica* (usuário `fabrica`) agora abre `client/src/fabrica/FabricaApp.jsx`: janela escura como a do sistema Delphi da fábrica (barra de título, botões grandes com os **ícones originais extraídos do `u_main.dfm`**, abas das telas abertas, barra de status Compilação/Host/Mensagem). Visual isolado em `fabrica/fabrica.css` (escopo `.fb-win`): o design do faturamento não muda.
- **Produção** refeita igual à original (`u_producao`): data grande com calendário (Hoje/Agora), botões Especiais/Salgados com a seta original, tamanho da fonte (padrão 16, guardado), cores do OnCustomDrawCell (horário 1 amarelo, 2 verde, 3 azul, selecionada vermelho/amarelo negrito), "Detalhamento de destino" à direita com soma, recarga a cada 2 min e ao trocar a data, "Carregando ...". Somente consulta.
- Programação, Mercadorias, Cargas, Reclamações e Pedidos extras ainda aparecem no desenho do sistema web dentro dessa janela (marcadas `claro` em `FabricaApp.jsx`) até serem refeitas igual ao original (dependem de prints das telas).

## Fase 115
- Pedidos extras: o servidor lê o tamanho real das colunas de `tb_extras` e corta os textos nesse tamanho (corrige "Data too long for column 'funcionario'").
- Menu da fábrica sem os botões Tema e Atualização.

## Fase 116
- Fundo do menu principal do faturamento refeito: a foto de pães passou a ser textura desfocada (a original, 800 px, ficava serrilhada em telas grandes) sob degradê quente, com cartão central da marca (logo + "Escolha uma opção no menu"). Só no faturamento; a janela da fábrica não muda.

## Fase 117
- Fundo do menu principal do faturamento: nova foto (pães franceses e cesta) enviada pelo usuário, sem desfoque, com cartão da marca no centro.

## Fase 118 — Número do dispositivo à prova de perda
- O número agora é guardado em dois lugares no navegador: cookie `paes_disp` e armazenamento do site (`localStorage`, enviado em todo pedido no cabeçalho `x-dispositivo`; o navegador também é instruído a não apagá-lo). Se um dos dois sumir, o servidor devolve o mesmo número e regrava o cookie. Só muda se os dois forem apagados (limpeza total dos dados do site, outro navegador/perfil, janela anônima).
- Dispositivos › linha pendente: seletor **"Assumir lugar de…"** (sugere automaticamente o dispositivo liberado com o mesmo IP e navegador): passa habilitado, áreas e descrição do número antigo para o novo e apaga o antigo — `POST /api/dispositivos/:id/assume`.

## Fase 119
- A foto do fundo do menu principal foi renomeada (`fundo-paes-v2.jpg`) para o navegador/Cloudflare não servir a versão antiga guardada em cache com o nome anterior.

## Fase 120
- Área da fábrica sem os botões de ajuste: **Ajustar etiqueta** e "Alterar lay-out" (Mercadorias), **Ajustar preços de todos os itens do dia**, ajustar preço/cobrança no menu do item e atalhos Alt+F2 / Alt+Shift+F2 / Ctrl+Shift+F2 (Programação diária) e a aba **Configurações** da unidade. Só aparecem no faturamento (`lib/perfil.js`).
- Também bloqueado no servidor para máquinas só-Fábrica (`rotaDaFabrica`): rotas `/ajusta…`, gravação em `/layout-etiquetas` e gravação em `/status/:id/unidade`.

## Fase 121
- Mercadorias na área da fábrica fica como no sistema da fábrica (só data + grade): sem Etiqueta adesiva, Imprimir lista, Selecionar tudo, Ajustar etiqueta, chips de resumo, histórico de etiquetas, coluna de seleção, duplo clique/Enter que convertem a mercadoria e menu de contexto.

## Fase 122
- Cargas (diária e fixa): setas ↑/↓ passam de um item para o outro (Shift+seta amplia a seleção; PageUp/PageDown e Home/End também), mantendo a linha visível na lista; o clique seleciona e o teclado continua dali. Vale para fábrica e faturamento.

## Fase 123
- Cargas na fábrica não imprime etiquetas: sem o botão **Etiquetas**, sem "Etiqueta adesiva" no menu, sem Enter que imprime e sem o log de impressão; o servidor também recusa `/api/cargas/etiquetas*` e `/api/mercadorias/etiquetas*` para máquinas só-Fábrica.

## Fase 124
- DANFE em modo silencioso: se a API, o disco e a pasta da API não entregam o PDF, o app busca o **XML autorizado** (disco → API → pasta da API) e gera o DANFE localmente (`services/danfeLocal.js`, biblioteca `@alexssmusica/node-pdf-nfe`, com o logo cadastrado e marca de CANCELADA). Vale para o DANFE individual, o lote, o anexo de e-mail e a sincronização; o PDF gerado é guardado no lugar do `nfe_pdf_file`. O layout é o da biblioteca, não o da API. **Rode `npm install` em `server/`.**

## Fase 125
- Tela principal do faturamento: agora mostra o cartaz Lev-Pão enviado (`public/principal-levpao.jpg`), inteiro e centralizado sobre fundo vermelho, sem o cartão central anterior.

## Fase 126
- Danfe silencioso: se o DANFE não puder ser obtido, o app não mostra mais o pop-up vermelho nem abre o painel "Eventos fiscais · Consultas"; a mensagem vai para o **Log** da tela de NF-e (e para o log do servidor). Antes de desistir, busca o XML por mais um caminho: procura pela chave (ou pelo nome do arquivo gravado no banco) nas pastas `NFE_XML_DIR` e da API (`NFE_ARQUIVOS_DIR`), e com o XML gera o DANFE localmente.

## Fase 127
- Danfe silencioso agora faz o que se faz à mão: sem o PDF/XML no disco, na API (por id) ou na pasta da API, o servidor executa em segundo plano a **Consulta de protocolo pela chave** (a mesma do painel Eventos fiscais → Consultas), ajusta a nota local, grava o XML vindo na resposta e, se ainda faltar o PDF, gera o DANFE a partir desse XML. Cache de 60 s por chave; falhas vão para o log do servidor e para o Log da tela. Não testado contra a API real.

## Fase 128
- Cadastro de clientes: o campo **Pessoa** (Física/Jurídica) voltava em branco depois de gravar. A coluna `tb_clientes.pessoa` no banco real não aceita o texto longo (provavelmente `char(1)` com 'F'/'J'), então o valor gravado não casava com o que a tela esperava. Agora o servidor descobre o formato da coluna (enum, char(1) ou texto), grava nele e sempre devolve FISICA/JURIDICA à tela, lendo também valores antigos ('F', 'J', 'Jurídica', etc.). Não testado contra o MySQL real.

## Fase 129
- Grade de NF-e: a coluna **ID** deu lugar a **CFOP** (`cfop_codigo` da nota). O id continua sendo usado internamente (seleção, ordenação), só não aparece mais.

## Fase 130
- **Impressão direta do DANFE**: com "Impressão direta" ligada na NF-e, o DANFE (individual ou das notas marcadas) vai direto para a impressora do agente, sem pré-visualização. Com ela desligada, abre o PDF no navegador como antes.
- Em Ferramentas › Configurar impressoras há um novo documento **DANFE (NF-e) — impressão direta** (escolha a impressora e as cópias). O PDF é convertido em imagens A4 no navegador (pdf.js, carregado só nessa hora) e enviado ao agente como "imagem pelo driver" — por isso o destino precisa ser uma impressora do Windows com linguagem "imagem-driver". Se não houver destino ou o agente falhar, o app abre a pré-visualização e registra o motivo no Log. **Rode `npm install` em `client/`** (nova dependência `pdfjs-dist`).
- Testado: conversão de um PDF A4 em PNG no navegador. Não testado: o envio real ao agente/impressora.

## Fase 131
- Configurar impressoras: botão **↻ Atualizar impressoras** (no topo e abaixo da lista) e atualização automática ao voltar da página do agente, para aparecerem as impressoras recém-criadas.
- DANFE direto: o destino só precisa ser uma impressora **do Windows** (antes exigia a linguagem "imagem-driver", o que recusava impressoras novas). Se a impressão falhar, aparece aviso na tela (além do Log) e abre a pré-visualização.
- Coluna **Imp** da grade de NF-e virou ícone: 🖨️ = DANFE já enviado à impressora, — = não. Marca na hora e grava em `tb_nfe.nfe_impresso` (`POST /api/nfe/impresso`). Só a impressão direta marca; abrir o PDF no navegador não marca, pois não há como saber se foi impresso. Não testado com impressora real.

## Fase 132
- Danfe: ao clicar, aparece na hora o aviso **"Processando a impressão do DANFE…"** (some ao terminar). Falhas não ficam mais mudas: se o DANFE não puder ser obtido, aparece um aviso curto "indisponível — o motivo está no Log" (sem abrir painel); se o agente falhar, aviso de erro e abre a pré-visualização.
- Cada linha **AUTORIZADA** da grade ganhou o botão 🖨 (imprime o DANFE daquela nota, direto ou em pré-visualização conforme "Impressão direta").
- Mensagens de erro com botão **Copiar** voltaram a sumir sozinhas: 12 s, e fechamento garantido 6 s depois mesmo com o mouse em cima.

## Fase 133
- Impressão direta do DANFE: corrigido "Failed to fetch dynamically imported module … pdf.worker.min-….mjs". O worker do pdf.js agora é empacotado como `.js` (Vite `?worker`), pois o `.mjs` solto era recusado pelo navegador/servidor (tipo MIME). Conversão PDF→PNG testada no navegador; envio à impressora real não testado.

## Fase 135
- **Compatibilidade (corrige a 134):** a estrutura atual de gravação voltou ao que era (pasta do servidor). O XML no padrão do sistema antigo é gravado **na máquina do cliente**, pelo agente de impressão: `N:/EDSMonitorPLUS/Arqs/<cnpj>/NFe/<ddmmaaaa da emissão>/NFe/<chave>-nfe.xml`, e `tb_nfe.nfe_xml_file` passa a apontar para esse caminho (e não é mais sobrescrito pelo app).
  - Novo no agente: `POST /gravar` (só `*-nfe.xml`, só dentro de pastas liberadas — padrão `N:/EDSMonitorPLUS/Arqs`, configurável em `pastas_gravacao` no config.json do agente; recusa `..` e conteúdo que não seja XML). **O agente precisa ser atualizado nas máquinas que autorizam notas** e a unidade N: precisa existir nelas.
  - Novo no servidor: `GET /api/nfe/:id/xml-legado` e `POST /api/nfe/:id/xml-legado/confirma`.
  - Na tela: após autorizar, o XML é gravado no N: em segundo plano (falhas no Log). Notas antigas: selecione e use **Mais ações › 💾 Gravar XML no N:**.
- **Ordenação:** clicar no cabeçalho da grade de NF-e ordena por aquela coluna (▲/▼); segundo clique inverte, terceiro volta à ordem original. A ordem se mantém ao refiltrar.
- **DANFE em duas vias:** a impressão direta envia 2 cópias por padrão (ajustável em Configurar impressoras; o campo "Cópias" do DANFE já aparece com 2). A pré-visualização do navegador não controla cópias.
- Testes do agente (`/gravar`) e do servidor passam; não testado com a unidade N: real.

## Fase 136
- Coluna **Imp** (e Email) da grade de NF-e: a impressão marcada pelo sistema antigo agora é reconhecida. O app só aceitava `True/1/S/SIM`; passou a valer qualquer valor preenchido que não seja negação (`False`, `0`, `N`, `não`, vazio, data zerada), incluindo texto como `IMPRESSO`, data/hora e bit. Se o sistema antigo usar um valor que signifique "não impresso" fora dessa lista, me diga qual. Não testado contra o banco real.

## Fase 137
- **Agente 1.1.0** (o recurso de gravar o XML no N: só existe nesta versão; a 1.0.0 não mostra nada de novo). Para atualizar: Ferramentas › Configurar impressoras › **Baixar instalador (atualizar)** e executar no computador que autoriza notas — mantém as impressoras cadastradas. A tela agora avisa "Agente desatualizado" quando a versão não tem o recurso.
- A página do agente (http://127.0.0.1:9101) ganhou **"Gravação do XML da NF-e"**: mostra as pastas liberadas (padrão `N:/EDSMonitorPLUS/Arqs`), se a máquina as enxerga (✔/✖) e permite editá-las. `/status` informa `recursos`.

## Fase 138
- Novo botão **🛠 Ajustar NFe** na barra da NF-e (nota em foco ou marcadas): consulta a API (pela chave; sem chave, pelo número), atualiza a nota local (status, chave, protocolo, XML, DANFE) e em seguida grava o XML no N: pelo agente desta máquina (`N:/EDSMonitorPLUS/Arqs/<cnpj>/NFe/<ddmmaaaa>/NFe/<chave>-nfe.xml`), apontando `nfe_xml_file` para lá. Mostra "Ajustando…" e o resumo; detalhes por nota no Log. Servidor: `POST /api/nfe/:id/ajustar`. Requer o agente 1.1.0 e a unidade N:. Não testado contra a API real.

## Fase 139
- Clonar NFe: a cópia nasce com **data de emissão e de saída do dia atual** (data do banco). Antes mantinha a emissão da nota original (e a saída era calculada em UTC). Não testado contra o MySQL real.

## Fase 140
- Clonar NFe: além de `nfe_pdf_file`/`nfe_xml_file`, **toda coluna cujo nome contenha `pdf` ou `xml`** (inclusive `nfe_fine_pdf`) é esvaziada na cópia. Se o campo que você citou tiver outro nome, me diga o nome exato da coluna. Não testado contra o MySQL real.

## Fase 141
- Grade de NF-e: ao abrir (e a cada refiltro) vem ordenada por **nº da NFe** crescente (notas ainda sem número, nº 0, ficam no topo; empate pelo id). Clicar no cabeçalho muda a ordem como antes; o terceiro clique volta à ordem por id.

## Fase 142
- **Ajustar NFe** agora esvazia `nfe_pdf_file` (e `nfe_file_pdf`, se a coluna existir) ao terminar. Obs.: ao pedir o DANFE de novo, o app busca/gera o PDF e volta a preencher o campo. Não testado contra o MySQL real.

## Fase 143
- Emissão: o JSON enviado à API agora leva as **duplicatas** da nota (`tb_receita`): `"duplicatas": [{ "vencimento": "2026-11-29", "valor": 280.93 }, …]`, em ordem de vencimento; linhas sem data válida ou com valor 0 são ignoradas, e sem duplicatas o campo não é enviado. Testado no JSON gerado; não testado contra a API real.

## Fase 144
- Pasta de arquivos da API (`NFE_ARQUIVOS_DIR`): se `<base>/<cnpj>` não existir, o app procura a pasta do CNPJ em até 4 níveis abaixo da base (ex.: base `/home/sanches/levpao/NFe` com os arquivos em `…/EDSMonitorPLUS/Arqs/<cnpj>/NFe/…`) e também aceita base que já seja a pasta do CNPJ ou que já contenha `NFe/`. Quando não acha, a mensagem lista o conteúdo da base e lembra de conferir a permissão de leitura do usuário do serviço. Não testado no servidor real.

## Fase 145
- **Auditoria**: tudo o que é feito no app é gravado em `tb_auditoria` (criada sozinha): data/hora, usuário, dispositivo, IP real (Cloudflare), método, rota, entidade, ação, nº do registro, status HTTP, duração, mensagem de erro e **os dados enviados** (senhas, tokens e arquivos/base64 são removidos ou resumidos; textos e listas longos são cortados).
  - Registra **toda gravação** (POST/PUT/PATCH/DELETE), **logins** (ok e falhos, sem a senha), **negações** (dispositivo/área/login) e erros, além de GETs sensíveis (DANFE/XML/eventos de NF-e, relatórios, NFs confirmadas) e qualquer 5xx. Não registra consultas comuns de tela (para não encher a tabela) nem a própria auditoria.
  - Ações que só acontecem no navegador também entram (`POST /api/auditoria/evento`): impressão direta do DANFE (sucesso/falha), gravação do XML no N:, impressões de etiquetas/comandas (agente ou navegador).
  - **Ferramentas › Auditoria** (só administrador, fora do menu da fábrica): filtros por período, usuário, tela, método, nº do registro, texto e "só erros"; detalhes por clique; exportar CSV.
  - `AUDITORIA=0` no `.env` desliga. Falha ao gravar a auditoria nunca derruba a operação. A tabela não é apagada pelo app; guarde/arquive conforme sua política. Observação: alterações feitas direto no banco ou pelo sistema antigo não passam por aqui. Testado: regras de sanitização/descrição/filtro; não testado contra o MySQL real.

## Fase 146
- **NF-e**: ao abrir a tela já vem filtrada pelo **dia atual (data de emissão) e só Pendentes**.
- **Cadastro de usuários** (Usuários › Cadastro de usuários, só administrador): criar, alterar nome/login, redefinir senha (gravada com `PASSWORD()` do MySQL como no login) e excluir. Bloqueios: login duplicado, espaços, usuário reservado `fabrica`, não exclui o administrador nem o próprio usuário, e usuário com histórico (FK) não é excluído. API `/api/cadastros/usuarios` (403 para não-administradores); a senha nunca volta para a tela. Tudo vai para a auditoria.
- **Menu "Usuários"**: agora tem **Cadastro de usuários** (admin) e **Sair** (volta ao logon). **Trocar senha** passou para o nome do usuário no canto superior (clique nele). Não testado contra o MySQL real.

## Fase 147
- Menu: **Usuários** (cadastro) agora fica em **Cadastros** (só administrador); o menu "Usuários" saiu. O botão **Sair** (volta ao logon) fica ao lado de **Fechar**, no canto superior direito. **Trocar senha** continua atrelado ao nome do usuário logado (clique no nome).

## Fase 148
- Tela principal: foto de pães enviada (`public/principal-paes.jpg`) ocupando toda a área, no lugar do cartaz anterior.
- **Trocar senha pelo nome do usuário**: o menu não aparecia porque o contêiner do nome tinha `overflow:hidden` e cortava o menu suspenso; corrigido. Conferido no navegador de teste: clicar no nome abre "🔒 Trocar senha" e abre a janela de troca.

## Fase 149
- **Ferramentas › Imagem da tela principal** (só administrador): escolhe a foto que aparece ao abrir o sistema, para todos os usuários. PNG/JPG/WEBP; imagens grandes são reduzidas no navegador (máx. 4 MB no servidor). **Voltar à padrão** restaura os pães.
- Servidor: `GET/PUT/DELETE /api/tela-principal` (+ `/imagem`); arquivo gravado em `tela-principal.bin/json` na pasta `NFE_DANFE_DIR` (ou pasta do servidor), ignorado pelo git.

## Fase 150
- Correção da tela branca da fase 149: o carregamento da imagem da tela principal usava `usuario` antes de ele ser declarado (erro do React ao abrir). Agora fica depois da declaração.

## Fase 151
- Imagem da tela principal escolhida não aparecia: a foto era pedida direto pelo CSS, que não envia o número do dispositivo (a API pode recusar). Agora o app baixa a imagem pela API (com o cabeçalho do dispositivo) e a exibe; se falhar, volta à imagem padrão em vez de ficar vazio.

## Fase 152
- **DANFE cortado no rodapé**: o agente (1.1.1) desenhava a página A4 no tamanho cheio, mas a impressora tem margem física e o Windows não imprime nela; o fim da folha saía cortado. Para páginas grandes (A4) a imagem agora é encaixada na área imprimível (centralizada, sem ampliar). Etiquetas continuam como antes. **É preciso reinstalar/atualizar o agente de impressão** (Ferramentas › Instalar agente) — a correção está nele, não no site.

## Fase 153
- Grade de notas (NFe): botão **☰ Colunas** para escolher colunas opcionais; por enquanto **Nome do cliente** (aparece antes de "Referência", ordenável pelo cabeçalho). A escolha fica gravada neste navegador. A lista do servidor passou a trazer `cliente_razao_social`.

## Fase 154
- Cabeçalho: removido o botão **Fechar** (fazia o mesmo que **Sair**).

## Fase 155
- Grade da NFe: "Nome do cliente" fica **depois** de "Referência"; o botão **☰** de colunas foi para o cantinho superior direito da grade.

## Fase 156
- NFe: botão **☰** (colunas) no canto esquerdo da grade, sobre a coluna dos ícones.
- Cargas (diária e fixa): **🖨 Imprimir lista** (imprime a lista como está na tela, em A4 paisagem, pelo navegador — vale também para a fábrica) e abertura **por ordem de hora**.

## Fase 157
- Cargas (diária): o botão **🏷 Etiqueta do item** agora aparece também na **área da fábrica** (como no sistema antigo): imprime a etiqueta adesiva dos itens marcados ou, sem marcação, do item em foco; Enter continua imprimindo; o log de impressão aparece para todos. O servidor deixou de recusar `/api/cargas/etiquetas*` à máquina só-Fábrica (as de **Mercadorias** continuam bloqueadas). Revoga a restrição da Fase 134 sobre Cargas.

## Fase 158
- **Etiqueta de Cargas no modelo do Delphi** (`ppAdesivas` de `u_prg_cargas`, 62 × 45 mm): nome da unidade em faixa cinza, dia por extenso centralizado (`quinta-feira - 05 / 11 / 2026`), hora e quantidades (`60 - 20 = 40`, cinza), descrição em negrito, quadro pontilhado da observação, caixa de informação com o contador `(1)` e, para produto especial, "Fabricação / Validade: 2 (Dois) dias". A etiqueta do Diária (`etiqueta-item`) não mudou.

## Fase 159
- Desfeito o **giro de 90°** da Fase 158: ele enviava uma página de 45 × 62 mm, e a Brother QL-800 (rolo contínuo 62 mm) recusava com "o rolo não corresponde ao selecionado". A etiqueta de Cargas volta a ser enviada em 62 × 45 mm (como antes de dar erro), já no modelo do Delphi.

## Fase 160
- **Etiqueta saindo em paisagem/deslocada** (Brother QL-800 pelo driver do Windows): o agente (1.1.2) agora fixa a orientação **retrato** (`Landscape=false`) em toda impressão por imagem; o driver vinha em paisagem e girava/deslocava a página de 62 × 45 mm. Tamanho do papel e posição do layout não mudaram. **Atualize o agente de impressão** no computador da etiqueta (Ferramentas › Instalar agente de impressão).

## Fase 161
- NFe: o botão **☰** (colunas) passou para uma célula própria do cabeçalho da grade (à direita do checkbox "marcar todas"), sem ficar por cima dele; o menu abre em posição fixa, fora da rolagem.

## Fase 162
- Grade da NFe: **ID** entra na lista de colunas opcionais do botão ☰ (aparece como primeira coluna; ordena crescente/decrescente pelo cabeçalho).

## Fase 163
- Cabeçalho: botão **⚙ Agente** aparece só quando o navegador alcança o agente **nesta mesma máquina** (127.0.0.1:9101); abre a página de administração do agente (impressoras, pastas de gravação, status) em nova aba. Em outras máquinas (agente via servidor) o botão não aparece.

## Fase 164
- **Ferramentas › Aparência (cores)**: escolha entre temas prontos (Padrão, Verde, Roxo, Vermelho, Grafite, Turquesa) ou ajuste duas cores — **botões de destaque** (laranja) e **barra, cabeçalhos e botões comuns** (azul). A mudança aparece **na hora** e fica salva **neste navegador** (cada computador pode ter o seu tema); "Voltar ao padrão" restaura. As cores agora são variáveis CSS (`--cor-btn`, `--azul-barra`, `--bt-*`) em `styles.css`; `lib/tema.js` deriva os tons de apoio.

## Fase 165
- Título da tela/aba/janela **Programação diária → AppBakery**.
- **Tema aplicado a todo o app**: cerca de 180 linhas de `styles.css` com azuis fixos (barra de título, cabeçalhos de grade, abas, bordas, fundos claros) passaram a derivar de `--azul-barra` via `color-mix`; o laranja dos botões de destaque usa `--cor-btn`. Cores de significado (ex.: fixo, listas verde/amarelo, produção vermelha) não mudam.
- Removido o aviso "Conflitos, etiquetas e relatórios: próximas fases" do menu **Ações do dia** (sobra da Fase 10).

## Fase 166
- **NFe: filtro rápido por coluna** (como no Delphi): cada título da grade tem um botão **▾** que lista os valores existentes naquela coluna (com a contagem), busca, **(Todos)** e marcação individual; o filtro vale na hora e o botão fica amarelo quando ativo. **Limpar todos os filtros** fica no mesmo menu. Funciona sobre as notas já carregadas (o filtro do topo — período, situação etc. — continua sendo o do servidor) e vale também para a coluna opcional Nome do cliente. Notas escondidas pelo filtro deixam de estar marcadas, para as ações em lote não as atingirem.

## Fase 167
- **Comanda e Demonstrativo: cada item em uma única linha.** O cupom usava linhas de 59 colunas; a térmica imprime 48 (fonte A de 80 mm) e o item quebrava em duas (e os tracejados também). Agora tudo cabe em **48 colunas** (`COLS` em `print.js`): comanda `Qtde(4) Descrição(24) Vr Un.(6) Vr total(9)` e demonstrativo `Data Qtde Descrição(19) Vr Un. Vr total`; tracejados e linha de assinatura também. Na impressão como imagem (driver do Windows) a fonte ficou maior (48 colunas em vez de 60).

### Fase 168 — Comanda/Demonstrativo: "Texto puro"
Novo destino de linguagem **Texto puro (cupom sem comandos)** no agente: envia só caracteres, quebras de linha e corte, sem ESC/GS (fonte, negrito, tamanho). Serve para impressora/driver que ignora os comandos e imprime "!" e "E" soltos. Exige atualizar o agente (reinstalar) e escolher essa linguagem no destino da comanda.

### Fase 169 — Programação diária/fixa, pesquisa de produtos e produto ativo/inativo
- **Topo da programação**: calendário, apresentação e "Clientes do dia" ficam numa faixa no topo (como no Delphi), com a lista bem mais ampla (várias colunas); a empresa selecionada, o status e as abas ficam abaixo.
- **Pesquisa de produtos** (Programação diária e fixa): filtra pelo cliente da empresa selecionada (e produtos sem cliente) e mostra preço e "cada".
- **Produto ativo/inativo**: nova coluna `tb_produtos.ativo` ('True'/'False'), criada sozinha pela API ao subir (todos os existentes ficam ativos). Checkbox "Produto ativo" no cadastro e coluna "Ativo" nas grades. Pesquisa e busca por código só aceitam ativos; o cadastro continua listando todos para poder reativar.

### Fase 170
Corrige o erro de compilação (chave `ativo` duplicada em Clientes.jsx; o padrão de produto novo agora é ativo). Programação: lista de clientes em UMA coluna e empresa selecionada/status/itinerário ao lado dela, na faixa do topo (sem espaço em branco).

### Fase 171
Pesquisa de produto na programação: só os produtos do cliente selecionado (sem os "sem cliente"), e a janela já abre listando todos os dele, como no Delphi. Aba "Programação diária" renomeada para "AppBakery".

### Fase 172
Programação diária: faixa do topo com calendário maior, lista de clientes mais larga e "empresa selecionada" mais estreita; Enter no último campo do item grava e FECHA o painel de edição.

### Fase 173
Programação diária/fixa: formulário do item em painéis (Item, Quantidade e preço, Anotações, Acabamento, Produção e entrega); **F5** grava, **Esc** cancela; gravar (F5/Salvar/Enter) fecha o painel de edição; Enter no campo **Extra** (diária) e na **Qtde** (fixa, quando o item está completo) grava automaticamente. Aba do app volta a "Programação diária"; título do navegador fixo em "AppBakery".

### Fase 174
Programação diária: campos do item nas posições do Delphi — bloco "Item" à esquerda (Data, Hora, Produto; descrição original, da comanda e de expedição; Qtde fixa, Extra, Preço, Cada, Valor total), painéis "Anotações p/ faturamento" e "Informe p/ produção" empilhados no meio, e "Produção" (acabamentos + data, turno, embalagem, preparação, itinerário) à direita; tudo compactado na altura do original. A ordem do Enter continua Hora → Data → Produto → … → Extra.

### Fase 175 — Agente simplificado: conecta ao sistema (sem IP, porta ou firewall)
- **O agente (v1.2.0) agora CONECTA ao sistema** (túnel reverso por long-poll, `/api/agente-tunel/*`, autenticado por token de pareamento) e busca os pedidos de impressão. Funciona igual com o servidor na mesma rede, em outra rede ou na internet; não há mais IP do agente, "Acesso pela rede", firewall nem `liberar-rede.ps1`. O agente só escuta em 127.0.0.1.
- **Duas instalações**: "Instalador do computador das impressoras" (embute endereço + token: atende todos os computadores) e "Instalador só para este computador" (imprime só para si, pelo 127.0.0.1, sem conectar). Use um agente conectado por sistema.
- Configurar impressoras: o cartão "Servidor → agente" virou "Agente conectado ao sistema" (estado, versão, token do administrador, "Gerar novo"). Página do agente: "Conexão com o sistema" (endereço + token + estado).
- Removidos: `AGENTE_URL` (o `AGENTE_TOKEN` do `.env` ainda vale como token), `PUT /api/impressao/config`, `POST /api/rede` do agente. Quem usava o modo antigo precisa reinstalar o agente do computador das impressoras com o novo instalador.

### Fase 176 — Agente para Linux (Ubuntu)
- **Instalador Ubuntu/Debian** (`/api/agente/instalador.sh[?conectar=1]`, `remover.sh`): instala Node.js 22 e CUPS (se faltarem), grava o agente em `/opt/paes-agente-impressao`, a configuração em `/etc/paes-agente-impressao/config.json` e cria o serviço systemd `paes-agente-impressao` (inicia sozinho). Rodar: `sudo bash instalar-agente-impressao.sh`. Mesmos dois modos do Windows (com `?conectar=1` o agente atende todos os computadores pelo sistema).
- **Novo tipo de destino "Impressora do Linux (CUPS)"** (`lp`/`lpstat`): ESC/POS, ZPL e TSPL em `lp -o raw`; imagem (etiqueta, cupom, DANFE A4) como PNG com `media=Custom.LxAmm`/`A4` + `fit-to-page`, uma página por trabalho. A lista de impressoras da página do agente vem de `lpstat -e`.
- Não testado em Ubuntu/impressora real: o instalador foi validado só por sintaxe (`bash -n`) e pela decodificação do pacote/config; o tamanho de papel de etiquetas (ex.: Brother QL) via CUPS pode exigir ajuste do `media`.

### Fase 177
Agente 1.2.1: se o endereço do sistema foi gravado com `https` mas o sistema só fala `http` (ex.: servidor de desenvolvimento em 127.0.0.1:5071, erro `ERR_SSL_WRONG_VERSION_NUMBER`), o agente passa para `http` sozinho e grava o endereço corrigido.

## Fase 178 — Impressoras compartilhadas do Windows no agente Linux
Na página do agente (Ubuntu) há o bloco "Impressoras compartilhadas por computadores Windows": informe IP, usuário e senha do Windows, clique em Procurar e Adicionar; a fila é criada no CUPS (raw) e aparece em Tipo "Impressora do Linux (CUPS)". O instalador Linux agora instala smbclient, liga o backend smb do CUPS e coloca o usuário no grupo lpadmin. Agente 1.2.2.

## Fase 179 — Programação diária: Enter pula a data; versão visível
- Ao editar o item, Tab/Enter vai do horário direto ao código do produto (a data não recebe foco; segue editável com o mouse). Na Fixa, Enter também ignora campos fora da ordem.
- Versão do app agora muda a cada entrega: "Versão: 1.NNN" (NNN = fase) no rodapé e na tela de login, ao lado do build.

## Fase 180 — Programação diária: campo de horário maior
O campo "Hora da entrega" do item ficou mais largo (150 px) para mostrar o horário completo; o campo Produto foi reduzido para compensar.

## Fase 181 — Programação diária: Enter também grava no campo Cada
Enter no campo **Extra** ou no campo **Cada** grava o item e fecha a edição (antes só o Extra).

## Fase 182 — Dashboard
Nova tela **Programação › Dashboard** (primeira do menu) com os resumos do dia, navegável por data (◀ ▶ Hoje Amanhã):
- Cartões: valor programado, quantidade total, itens (clientes/cancelados), alterações do dia (avulsos + fixos com extra) e % cobrado/pendente; valor, quantidade e itens comparados com ontem e com o mesmo dia da semana passada.
- Situação dos clientes (normal/alterado/cancelado/sem itens), entregas por hora, produção por turno, por acomodação, produtos e clientes de maior valor.
- Servidor: `GET /api/dashboard?data=AAAA-MM-DD` (somente leitura; itens cancelados fora dos totais). Valor = (fixa + extra) × preço ÷ "cada".

## Fase 183 — Dashboard abre ao entrar
Depois do login (computadores de acesso completo) o Dashboard abre automaticamente como primeira tela; pode ser fechado como qualquer aba. A fábrica continua sem ele.

## Fase 184/185 — Tela de NFe com mais espaço
Removidas a linha de abas ("NFe / Emitente e configurações / Envio/Resposta") e a barra de progresso do painel lateral. Os botões **⚙** (Emitente) e **📡** (Envio/Resposta) ficam no cabeçalho da grade de notas, ao lado do ☰ de escolha de colunas. Dentro de Emitente/Resposta aparece **◀ Voltar às notas**.

## Fase 186 — Cadastro de produtos: filtro por cliente
O filtro dependia de marcar a caixa "Só produtos de…" e o cliente vinha pré-selecionado (o primeiro da lista), o que dava a impressão de filtrar errado. Agora: nenhum cliente vem pré-selecionado; clicar num cliente na aba **Clientes** já marca o filtro e volta para os produtos; marcar a caixa sem cliente leva à aba Clientes; o rodapé diz "N produto(s) de <cliente>" ou "(todos os clientes)".

## Fase 187 — Setas em todas as grades; edição de item enxuta
- **Setas ↑ ↓ (e PageUp/PageDown/Home/End)** passeiam pelos registros de qualquer grade: vale para a última grade em que se clicou e age como um clique na linha vizinha (seleciona e carrega o registro). Telas com tratamento próprio (Produção, Cargas, itens da NFe) continuam como estavam; campos de formulário, janelas e calendário não são afetados. Código em `client/src/lib/setasGrade.js`.
- **Edição do item (diária e fixa):** ao entrar em edição, a faixa de calendário/apresentação/clientes recolhe para o formulário e a lista do dia caberem na tela; espaçamentos reduzidos e a linha de dicas virou "F5 salva · Esc cancela". Ao salvar/cancelar a faixa volta.

## Fase 188 — Cadastro de produtos remodelado
A edição do produto passou a usar a largura: seção "Produto" (ID, código, cliente, referência e as duas descrições em 2 linhas), "Preço e medidas", "Fiscal" e "Opções" lado a lado, e "Ingredientes e validade" em uma linha; a lista à esquerda ficou mais estreita. A aba Produtos do cliente mantém o formato enxuto. As setas ↑ ↓ passeiam pelos registros desta e de todas as grades (Fase 187).

## Fase 189 — Produtos: situação (ativos/inativos/todos) e inativar em lote
- A lista do cadastro abre só com **Ativos**; o seletor **Mostrar** (Ativos / Inativos / Todos) traz os inativos quando o usuário escolhe. O rodapé informa o que está listado.
- Nova coluna de caixas de seleção na lista (cabeçalho marca/desmarca todos os da lista) e botões **⛔ Inativar marcados (N)** e **✔ Ativar marcados**, com confirmação. Servidor: `POST /api/cadastros/produtos/ativo {ids, ativo}` e `GET /api/cadastros/produtos?situacao=ativos|inativos|todos`.

## Fase 190 — Shift/Ctrl + seta marca os produtos
Nas grades com coluna de marcação (lista de produtos), **Shift** ou **Ctrl** + ↑/↓ (e PageUp/PageDown) passeia pelos registros marcando a linha de onde saiu, as intermediárias e a de chegada. Em grades sem marcação, Shift/Ctrl continuam com o comportamento da própria tela.

## Fase 191/192 — Programação: setas trocam o cliente
↑ ↓ (e PageUp/PageDown/Home/End) trocam o cliente selecionado em qualquer ponto da tela de Programação — sem precisar clicar antes na lista; também com o foco na pesquisa (lá, Home/End movem o cursor). Não age com item em edição nem dentro de outros campos/menus. Clicar fora de uma grade solta a "grade ativa" das setas (Fase 187), para as setas não ficarem presas na última grade clicada.

## Fase 193 — Verificar possíveis problemas de programação
Convertido de `u_prg_conflitos` / `Verificarconflitosdeproduca1Click` (u_prg_diaria): menu **Programação › Verificar problemas de programação** e **Ações do dia ▸ Verificar possíveis problemas de programação** (também na janela da fábrica). Serviço `server/src/services/conflitos.js`, rota `GET /api/conflitos?de=&ate=` (até 31 dias, somente leitura), tela `client/src/screens/Conflitos.jsx`.
- **Regras do sistema antigo:** produto de produção *comum* tem que ser produzido no **mesmo dia** da entrega e o *especial* **1 dia antes** (diária: `data − producao_data`; fixa: `producao_dias`); item da fixa que **não consta na diária** (mesmo produto, hora e quantidade).
- **Conferências novas:** item sem hora, quantidade zero, sem preço, produto inativo/excluído, item duplicado, sem roteiro, produção sem turno/data, quantidade atípica (≥3× ou ≤⅓ da média dos últimos mesmos dias da semana), situação da empresa que não bate com os itens, empresa cancelada com itens, empresa ativa sem itens, fixa do dia não ativada, preço diferente do cadastro (informativo).
- Tela: período, filtros por gravidade/tipo/texto, **agrupar por empresa**, exportar CSV, imprimir; clicar na linha (ou **Abrir ▸**) abre a Programação diária na data e empresa do problema (como o clique da lista antiga).

## Fase 194 — Verificar problemas: sem roteiro opcional; "Abrir" posiciona exatamente
- "Item sem roteiro/motorista" deixou de ser conferido por padrão; marque **Incluir itens sem roteiro/motorista** na tela para ligar (a escolha fica salva no navegador). API: `&sem_roteiro=1`.
- **Abrir ▸** (ou clicar na linha) leva à Programação diária **na data e na empresa do problema** (pelo id do status), limpando o filtro de apresentação e a pesquisa de clientes e rolando a lista até a empresa; funciona também quando a tela já estava na mesma data.

## Fase 195 — Verificar problemas: "Abrir" posiciona no item
Além da data e da empresa, **Abrir ▸** (ou clicar na linha) agora seleciona e rola até o **item** da programação do problema. O serviço devolve `id_item` e `destino` em cada problema: `diaria` (aba Diária) ou `fixa` (aba Programação fixa, para "fixa fora do dia de produção"). Problemas só da empresa/situação, ou "fixa ausente da diária" (o item não existe na diária), abrem apenas a data e a empresa.

## Fase 196 — Dashboard sem valores em R$, com notas emitidas
- Removidos do painel todos os valores monetários (cartão "Valor programado" e rankings por valor). Os rankings agora são **"Produtos/Clientes com maior participação"**, em % da quantidade total do dia.
- Novo cartão **Notas emitidas** (`tb_nfe`, data de emissão = dia): quantidade de NF-e autorizadas, % autorizadas sobre as notas do dia, canceladas/devolvidas, pendentes/rejeitadas e variação vs ontem / semana passada. API: campo `notas` em `GET /api/dashboard`.

## Fase 197 — Dashboard: rolagem própria e produtos agrupados pelo nome
- O painel agora rola **dentro da área da tela** (`.db` com `overflow-y:auto`); antes crescia além da janela, a página inteira rolava e o rodapé (Host/Versão/Usuário) ficava no meio do conteúdo.
- "Produtos com maior participação" agrupa pela **descrição** (antes por código, e produtos diferentes com a mesma descrição apareciam repetidos, ex.: vários "PAO FRANCES 50GR").

## Fase 198 — Cadastro de produtos: marcar os sem uso há N meses
Botão **🕒 Marcar sem uso** com campo **Sem uso há [N] meses** (padrão 6, de 1 a 120). O botão **apenas marca** na lista os produtos ativos sem item na programação diária desde N meses atrás (a programação fixa não conta como uso); só marca os que aparecem na lista atual. Para inativar, o usuário confere e usa **Inativar marcados**. API: `POST /api/cadastros/produtos/sem-uso {meses, ids}` (confere só os ids listados na tela, com uma consulta no período; timeout de 60 s na tela). Produto recém-criado e ainda não programado também entra no critério.

Fase 200: o botão mostra "⏳ Marcando…" (desabilitado) e avisa enquanto busca.

Fase 199 (correção): o critério ignora a programação fixa — com ela, quase todo produto tinha alguma linha e nada era marcado.

Fase 201: a conferência de 'sem uso' ficou rápida — envia só os produtos da lista e consulta a diária uma vez (antes uma subconsulta por produto em toda a base travava), com limite de 60 s e mensagem de erro.

Fase 202: botão **↩ Reativar todos os inativos (N)** (aparece em Inativos/Todos): reativa de uma vez os inativos da lista atual, com confirmação — desfaz uma inativação em massa. Também dá para marcar e usar "Ativar marcados".

## Fase 203 — Aparência por usuário: modo escuro, tamanho da letra, mais temas e atalho na barra
- **Por usuário:** o tema fica em `tb_usuario_tema` (criada sozinha na primeira vez; `GET/PUT/DELETE /api/tema`) e é aplicado ao entrar, em qualquer computador. O navegador mantém uma cópia local para abrir já com as cores certas.
- **Modo claro/escuro** (inverte a página inteira; imagens, fundo e seletor de cor mantêm a cor original; na impressão sempre claro), **tamanho da letra** 90–130 % e **12 temas prontos** + cores livres (Ferramentas › Aparência).
- **Atalho 🎨** no menu do usuário (nome › Aparência, abaixo de "Trocar senha"): modo, letra e temas sem abrir a tela; "Mais opções…" abre a tela completa.
- A janela da fábrica (sem login de usuário) continua com o tema local do navegador.

Fase 204: o botão Aparência saiu da barra e foi para o menu do nome do usuário, abaixo de "Trocar senha".

## Fase 205 — Diária: quantidade fixa não é alterável
Na edição do item da diária o campo **Qtde fixa** fica sempre bloqueado e o servidor ignora `qtde_original` no `PUT /diaria/:id` (antes era editável em item vindo da programação fixa). Para mudar a quantidade do dia use **Extra** (`qtde_alterada`); a quantidade fixa só se altera na aba/tela da **Programação fixa**.

## Fase 206/207 — Programação diária: ordem escolhida pelo usuário (crescente/decrescente)
- **Clientes do dia:** botões **🕒 Entrega** (primeiro horário de entrega do dia, sem contar itens cancelados) e **Nome**; clicar de novo no botão ativo inverte (▲ crescente / ▼ decrescente). Horário mostrado antes do nome na ordem por entrega.
- **Itens do cliente:** clicar no cabeçalho **Entrega** (horário) ou **Descrição para expedição** ordena; clicar de novo inverte. Linha em edição não pula de lugar até gravar.
- Valores vazios (sem horário) ficam sempre no fim. A escolha fica salva no navegador (`lib/ordena.js`); padrão: entrega crescente. A ordenação é feita na tela, a API só entrega os dados.

## Fase 208 — NF-e à vista não envia duplicatas/fatura
Ao emitir, se **todas as duplicatas da nota vencem no dia da emissão** (cliente com 0 dia de vencimento — venda à vista), o JSON enviado à API **não leva `duplicatas`** (nem fatura); segue só a forma de pagamento. Isso evita rejeição da SEFAZ por cobrança em venda à vista. Qualquer parcela com vencimento posterior mantém a nota como a prazo (envia todas as duplicatas, como antes). As duplicatas continuam gravadas em `tb_receita` (financeiro interno). Regra em `ehAVista()` (`services/nfeJson.js`).

## Fase 209 — Demonstrativo/comanda impressos como no sistema antigo
Comanda e demonstrativo seguem o desenho da comanda do Delphi: título grande, `Responsavel:`, data por extenso grande (sem a linha "Data de Emissao:"), `Cliente:` com o nome grande, cabeçalho `Qtde / Descricao do produto / Vr Un. / Vr total` **com traço embaixo**, itens com quantidade inteira (`40`, não `40,0`) e descrição em 24 colunas (sem cortar). A coluna **Data** do demonstrativo só aparece quando as linhas são de dias diferentes. Vale para a impressão comum e para a térmica (mesmas linhas de texto).

## Fase 210 — Telas atualizam ao voltar para a aba (Auditoria e Dashboard)
As telas abertas ficam montadas (só escondidas); por isso a Auditoria mostrava o que carregou na 1ª abertura e só atualizava saindo e entrando. Agora `lib/useVisivel.js` avisa quando a aba volta a ser exibida: **Auditoria** refaz a busca (mesmos filtros e página; se virou o dia e o período era o dia aberto, passa para o dia atual) e **Dashboard** recarrega os números. Também corrigido: o "hoje" da Auditoria usava UTC e virava o dia às 21h; agora é a data local.

## Fase 211/212 — Diária: alterar item vai direto no Extra e as setas passeiam gravando
- Ao **alterar** um item já incluído (F3 / duplo clique / botão Alterar) o foco vai direto para **Extra** (item novo continua no horário).
- Com a edição aberta, **↑ ↓** passam para o item vizinho **mantendo o painel aberto**, com o foco no Extra do novo item. Se houve alteração, ela é **gravada automaticamente** antes de passar (sem perguntar); se a gravação falhar (validação), fica no item atual. Com alteração pendente as setas só passeiam a partir dos campos Extra/Cada (nos demais campos ficam com o campo). Clicar em outro item com alteração pendente continua perguntando.

## Fase 213/214 — Diária: itens mais ágeis (e correção das setas que não gravavam)
- **Gravar sem esperar:** ao gravar um item existente a tela já mostra o resultado e libera para continuar; a confirmação do servidor e a atualização da lista de clientes (pesada) acontecem em **segundo plano**, e várias gravações seguidas (passeando com as setas) são juntadas em **uma única** recarga da lista (500 ms). Item novo continua esperando o servidor (precisa do id e dos cálculos). Ações do menu (cancelar, ajustar preço…) agora recarregam itens e lista **em paralelo** em vez de uma depois da outra.
- **Correção (Fase 212):** passando de item com ↑ ↓ logo depois de digitar no Extra, o valor digitado **não era gravado** (o campo numérico só entrega o valor ao perder o foco). Agora o campo perde o foco, grava e então passa ao vizinho.
- Visual da grade/painel mantido, sem mudanças.

## Fase 215 — Campos numéricos recalculam a cada tecla
O campo numérico da Diária/Programação fixa (Extra, Preço, Cada, Qtde…) passa o valor ao formulário **enquanto se digita** (antes só ao sair do campo). Total do item, valor total e a linha da grade mudam imediatamente; o texto digitado não é mexido até sair do campo.

## Fase 216 — Diária (edição) com as cores do sistema antigo + zoom sem faixa vazia
- Painel de edição da Diária no padrão do Delphi: **vermelho** em Data, Hora, Produto, Descrição para expedição e Extra; **amarelo** em Descrição original, Descrição da comanda, Qtde fixa, Preço, Cada, Valor total, Produção data e Itinerário; texto preto em **negrito** (descrições 15 px, números 14 px). Classes `leg`, `leg-v`, `leg-a`.
- **Tamanho da letra** (Aparência): a altura da janela compensa o zoom (`--zoom`); antes, com 90 %, sobrava uma faixa vazia embaixo e o rodapé subia.

## Fase 217 — Diária: total ao abrir, fonte do Delphi e sem linha amarela de "novo item"
- **Valor total** do item aparece ao abrir (é sempre calculado de Qtde fixa + Extra × Preço ÷ Cada; antes ficava 0,00 até mexer em algum campo).
- Fonte dos campos do item no tamanho do sistema antigo (**14 pt negrito ≈ 18,7 px**); o painel cresce junto (campos de 34 px).
- A linha amarela de "novo item" (`*`) na grade só aparece enquanto se inclui um item (F2); fora disso some.

## Fase 218 — Diária: cabeçalho do dia em painel lateral; calendário e clientes sempre visíveis
- Data, relógio, situação do dia (normal/alterado/nada/cancelado), **Ações do dia** e **Fechar** saíram da faixa do topo e foram para um **painel ao lado** (entre a lista de clientes e "Empresa selecionada"): ganha-se uma linha inteira para a grade e o painel de edição. A lista de clientes ficou mais estreita para isso.
- Calendário, Apresentação e Clientes **não somem mais** durante a edição do item (antes ficavam escondidos assim que se mexia em um campo).

## Fase 219 — Diária: a edição do item continua aberta ao trocar de cliente
- O painel de edição do item **permanece aberto** ao passar de um cliente para o outro (clique ou setas), com o foco no Extra do item do novo cliente; o usuário esconde quando quiser em **Mostrar/Esconder item** (a escolha vale para os próximos clientes).
- Com alteração pendente, clicar em outro cliente **grava** o item antes de trocar (se a gravação falhar por validação, fica no cliente atual). A atualização pendente da lista é feita ao sair do cliente.

## Fase 220 — Diária: abas na lateral esquerda, na vertical
As abas **Programação diária / Programação fixa / Reclamações** saíram da linha acima da grade e ficam na **lateral esquerda, na vertical** (texto de baixo para cima, como no sistema antigo), ganhando uma linha inteira para a edição e a grade.

## Fase 256 — Fábrica/Cargas: total de pães

- Rótulo "Total de pães" no total da Carga diária (soma do =Total das linhas filtradas) e total também na Carga fixa (soma da Qtde). Acompanha o filtro por coluna.

## Fase 255 — Fábrica: Cargas no layout do sistema antigo (filtro e ordem por coluna)

- Só na janela da Fábrica (o Faturamento continua como estava): Cargas ganhou o layout compacto do Delphi — grupos de rádios no topo (Tipo/Embalagem, Programação/Expedição, Carga/Ítens, Extra, Região), data grande + **Atualizar**, abas Carga diária/fixa em formato de aba, grade ocupando o resto da tela.
- Cada título de coluna tem **▼** com a lista de valores e caixas (como o cxGrid): marque os valores que devem aparecer; vários campos se combinam. Clicar no título ordena. Embaixo: total (=Total), expressão do filtro `((Descrição = …) or (…))`, **✕** limpa e a caixa liga/desliga o filtro. Também na Carga fixa.
- Etiqueta do item, "Separar" por número e edição de acomodação/etinerário continuam disponíveis (botões compactos ao lado da data; o log de impressão lateral não aparece na Fábrica).
- Conferido só no preview com dados de exemplo.

## Fase 254 — Correção: restrições da Fábrica vazavam para o Faturamento

- O perfil "Fábrica" (só consulta, sem botões de ajuste/edição) era ligado ao carregar o módulo da Fábrica, que o App importa sempre — por isso valia também no Faturamento. Agora o App liga o perfil só enquanto mostra a janela da Fábrica; no Faturamento tudo fica liberado como antes.
- Não testado em tela real (só build).

## Fase 253 — Fábrica/Produção: descrição dos Especiais

- A aba Especiais mostrava a coluna "Descrição do produto" vazia: a tela lia `referencia_descricao`, campo que o resumo da produção não devolve (ele devolve `descricao`). Agora lê `descricao` nas duas abas.
- Não testado com dados reais (só build).

## Fase 252 — Fábrica: Programação só consulta; setas no detalhamento da Produção

- **Fábrica, Programação diária e fixa**: só consulta/pesquisa. Sem barra de botões (Incluir, Alterar, Excluir, Salvar…), sem tela de edição de itens, sem menu do botão direito, sem lixeira nas linhas, sem "Ações do dia" e sem trocar status. No servidor, a máquina só-Fábrica também é barrada (403) em qualquer gravação em `/diaria` e `/fixa` (a etiqueta do item continua liberada).
- **Fábrica, Produção**: no Detalhamento de destino, ↑ ↓ (Home/End) navegam entre os clientes, com a linha atual em vermelho/amarelo; → na lista vai ao detalhamento e ← volta; clique também seleciona.
- Testes do servidor atualizados (165 passam). Não testado em tela real.

## Fase 251 — Código do dispositivo no rodapé

- O rodapé do sistema (e a barra de status da janela da Fábrica) mostra **Dispositivo: código**, o mesmo da tela Dispositivos autorizados, para o usuário informar ao administrador sem precisar ser bloqueado.
- Não testado em tela real (só build).

## Fase 250 — NFe: bloqueio de itens com valor zerado

- Autorizar (individual e em lote) agora recusa item com quantidade, preço ou valor total do item zerado ou negativo (antes só quantidade/preço igual a zero). A mensagem aponta o item. Teste novo em `nfe.test.js`.
- Não testado contra SEFAZ/MySQL reais.

## Fase 249 — Fábrica/Produção: detalhamento de destino maior e redimensionável

- O painel "Detalhamento de destino" (cliente, hora, qtde, entrega…) abre mais largo (520 px) para mostrar todas as colunas sem rolar, e há uma barra entre a lista e o painel: arrastar aumenta ou diminui. A largura fica lembrada no navegador.
- Não testado em tela real (só build).

## Fase 248 — E-mail de NF cancelada, pesquisa em Dispositivos, janela da Fábrica

- **NFe cancelada por e-mail**: o envio agora aceita notas CANCELADAS. Assunto e texto próprios (chave, protocolo e data do cancelamento, justificativa) e anexos: XML da nota, XML do evento de cancelamento e PDF do cancelamento (o PDF é opcional; sem o XML do cancelamento o envio é recusado).
- **Dispositivos autorizados**: campo de pesquisa (código, descrição, usuário, IP, navegador).
- **Fábrica + Faturamento**: dispositivo liberado para as duas áreas entra no sistema completo e não mostrava a janela da Fábrica. Agora há o botão **🏭 Fábrica** na barra (e **↩ Faturamento** para voltar); a escolha fica lembrada no navegador.
- Não testado: SMTP/API de NF-e reais, MySQL real.

## Fase 247 — Correção: itens da NFe sumiam atrás do cabeçalho

- Na 246 dei à tabela de itens a classe `nfe-itens`, que já era a do bloco inteiro (altura mínima 261 px): o cabeçalho ficou gigante e cobriu as linhas. Agora a classe é `tb-itens-nfe` (o alinhamento à direita continua).

## Fase 246 — NFe: itens alinhados à direita

- Grade de itens da NFe: títulos e valores de **Preço unitário, Qtde. e Valor do item** (e o total do rodapé) alinhados à direita.

## Fase 245 — NFe: valor alinhado à direita

- Coluna "Valor da NF" da grade: título e valores alinhados à direita (dígitos de largura fixa).

## Fase 244 — NFe: ícone dos dados da nota

- O ícone da linha que abre os dados da NFe passou de 📋 para **📝** (folha com lápis).

## Fase 243 — NFe: ícone de comandas na linha; barra mais enxuta

- Cada linha da grade ganhou o ícone **🧾** (comandas ligadas à nota). O botão **Comandas** passou para **⋯ Mais opções**. O botão **＋ Criar** também foi para **Mais opções**. O botão **Marcar todas/Desmarcar** saiu da barra: fica só a caixa do cabeçalho da grade.

## Fase 242 — NFe: Ajustar e Pastas XML no menu "Mais opções"

- Os botões **🛠 Ajustar NFe** e **📁 Pastas XML** saíram da barra e foram para o menu **⋯ Mais opções** (antes "Mais ações"). Mesmas funções.

## Fase 241 — NFe: anexar o XML autorizado manualmente

- Em Dados da NFe, ao lado de "Arquivo XML (sistema novo)": **📎 Anexar XML** (rota `POST /api/nfe/:id/xml-upload`). Para nota que a API não conhece (404) e cujo XML só existe no sistema antigo. Valida: XML de NF-e com `<protNFe>` (autorizado), emitente = CNPJ da empresa, chave/número iguais aos da nota. Guarda no campo do app, preenche a chave se faltava e esvazia o PDF do app (DANFE sai do XML). Registrado na Auditoria.

## Fase 240 — XML: pasta do mês (aaaamm), não do dia

- O XML no padrão do sistema antigo passa a ir para `…/<cnpj>/NFe/<aaaamm>/NFe/<chave>-nfe.xml` (ex.: 202611), e não mais `<ddmmaaaa>` (11112026). Notas já gravadas com dia continuam sendo lidas pelo caminho que está no banco.
- Botão **📁 Pastas XML** (NFe): simula, pergunta e então move os arquivos que ESTE servidor enxerga para a pasta do mês e corrige `nfe_xml_file`/`nfe_xml_app` (rota `POST /api/nfe/migrar-pastas-xml`, `?simular=1` só conta). Arquivos que só existem no N: da máquina do cliente (gravados pelo agente) não são vistos pelo servidor: ficam como estão (aparecem como "fora deste servidor"); para esses, use Ajustar NFe, que regrava pelo agente na pasta nova. O agente antigo não precisa mudar (grava no caminho que recebe).

## Fase 239 — Correção: DANFE de nota do sistema antigo (XML em N:/)

- Regressão da fase 238: ao ler o arquivo, o app ignorava o caminho N:/ do sistema antigo (que `paraLocal` converte para a pasta local) e, com a API devolvendo 404, não achava o XML. Agora a leitura tenta o campo do app e, se o arquivo não existir em disco, o campo do sistema antigo; a gravação continua só nos campos do app.

## Fase 238 — NFe: campos próprios do sistema novo para XML/DANFE

- Novas colunas `tb_nfe.nfe_xml_app` e `nfe_pdf_app` (criadas sozinhas, `varchar(500)`). O app novo lê/grava **só nelas**; `nfe_xml_file`/`nfe_pdf_file` ficam para o sistema antigo (N:/…) — "Ajustar", o agente do N: e quem editar o caminho antigo não afetam mais o DANFE do app. Notas antigas: sem valor em `_app`, o app usa o campo antigo se **não** for N:/, senão baixa da API e preenche o campo novo.
- Emissão nova grava nos dois pares. "Ajustar" esvazia só o PDF do app. Nova rota `POST /api/nfe/:id/refazer-arquivos` (botão **♻ Refazer pela API** em Dados da NFe): baixa XML/DANFE de novo para os campos do app; se falhar, devolve o que havia.
- Os quatro caminhos são editáveis em Dados da NFe (rota `PUT /:id/arquivos`), com o valor anterior na Auditoria. Não testado em MySQL real (o `alter table` roda no primeiro acesso a /api/nfe; o usuário do banco precisa ter permissão de ALTER).

## Fase 237 — NFe: editar o caminho do XML/PDF

- Em "Dados do corpo da NFe", **Arquivo XML** e **Arquivo PDF** ficam editáveis em qualquer situação da nota (botão Gravar / ↩), para corrigir o apontamento quando o DANFE não imprime depois de "Ajustar". Rota `PUT /api/nfe/:id/arquivos` (máx. 500 caracteres); o valor anterior vai para a Auditoria. Vazio no XML faz o sistema buscar o XML de novo na API quando o DANFE for pedido.

## Fase 236 — Ícone "impresso" atualiza entre terminais

- O app grava `nfe_impresso` no servidor, mas outro terminal só via o ícone ao recarregar a lista. Agora a tela de NFe consulta `GET /api/nfe/impressos?ids=…` a cada 12 s (janela visível) e atualiza o 🖨️ das notas da lista (também desmarca se alguém desmarcar). Pode levar até ~12 s.

## Fase 235 — DANFE de várias notas: vias juntas, nota por nota

- Na impressão direta (agente) de notas marcadas, cada nota sai com as suas vias seguidas (70238, 70238, depois a próxima), em vez de um PDF único com todas as notas. Cada nota é baixada e enviada ao agente uma a uma; notas que não têm DANFE (não autorizadas) são puladas e anotadas no Log. Sem impressão direta (pré-visualização), continua o PDF único. Não testado com impressora real: depende de o agente repetir o job `copias` vezes de forma agrupada (uma nota de 1 página sai A, A).

## Fase 234 — Diária: campos da edição com as cores do tema

- Os campos que eram vermelho (hora, produto, descrição p/ expedição, extra) e amarelo (data, descrições, qtde fixa, preço, cada, total) agora usam o tema: vermelho → tom claro da cor dos botões; amarelo → tom claro da cor da barra (`--leg-v`/`--leg-a` em lib/tema.js). Texto continua preto e negrito, mesmo tamanho. Com o tema Padrão (laranja/azul) o visual deixa de ser vermelho/amarelo; para parecer com o antigo, escolha botões vermelhos e barra amarela em Aparência.

## Fase 233 — Cadastro de clientes: lista de clientes ao lado de Unidades e Produtos

- Nas abas Unidades e Produtos, a lista de clientes fica à esquerda (300 px, com busca e ordenação); clicar em outro cliente troca as unidades/produtos sem voltar à aba Clientes. Botão **⬌ Clientes ao lado** liga/desliga (lembrado no navegador). A aba "Lista de clientes" continua como estava.

## Fase 232 — Cadastros: ordenar clicando no título da coluna

- Clientes, Unidades e Produtos (e a lista de clientes/produtos dentro de Produtos): clique no título para ordenar crescente (▲), de novo decrescente (▼), de novo volta à ordem original. A escolha fica lembrada por navegador (`useBusca(lista, campos, nome)` + `GradeCad ordem/onOrdenar`). Em Unidades a ordem vale para todas as páginas, não só a visível.

## Fase 231 — Busca de produto: mais resultados e aviso

- A janela "Localizar produto" cortava em 50 sem avisar. Agora mostra até 300 e, se houver mais, avisa para digitar mais letras.

## Fase 230 — Unidade: cliente com código

- Em Unidades, o "Cliente dono da unidade" e a lista de "Mudar de cliente" mostram `código · razão social`.

## Fase 229 — Unidade: mudar de cliente

- Cadastro de unidades › **🔁 Mudar de cliente** (rota `POST /cadastros/clientes/unidades/:id/mudar-cliente`, numa transação). Passam para o novo cliente: a unidade, a programação fixa (`tb_fixa`) e `tb_status`/`tb_diaria` de hoje em diante. Dias passados, comandas e notas ficam com o cliente antigo. Produtos não mudam (continuam do cliente a que pertencem). SQL só testado com stub (sem MySQL real).

## Fase 228 — Diária: cliente no painel do item; busca de produto com "todos os produtos"

- O painel lateral do item mostra o **nome do cliente** (razão social) acima da unidade (o texto que já aparecia é o da unidade).
- A janela "Localizar produto do cliente" ganhou a opção **Pesquisar em todos os produtos** e, quando o cliente não tem produto ativo, explica o motivo em vez de só "Nenhum produto encontrado". A causa de o cliente BENASSI vir vazio (produtos com `id_cliente` diferente, ou inativos) não foi confirmada: depende dos dados reais.

## Fase 227 — Diária: F2 Incluir não fica mais "morto"

- O botão/atalho **F2 Incluir** ficava desabilitado (sem aviso) enquanto houvesse alteração pendente em outro item. Agora grava a alteração pendente e abre o item novo; se não der para gravar, mostra o motivo. Sem cliente selecionado, avisa. Testado no preview (mock); a causa relatada pelo usuário em produção não foi reproduzida — se persistir, anotar a mensagem exibida.

## Fase 226 — Aviso de nova versão

- O build publica `/version.json`; o app confere a cada 2 min e ao voltar para a aba. Se mudou, mostra a faixa "Nova versão disponível" com **Atualizar agora** (recarrega) e **Depois**. Não recarrega sozinho, para não perder digitação (ex.: Programação diária). Vale a partir desta versão: quem estiver numa versão anterior precisa de um Ctrl+F5 uma vez. O servidor web precisa servir `version.json` sem cache longo (o app pede com `no-store`).

## Fase 225 — Listagem de unidades com quadros para anotações

- A impressão "Listagem das unidades" ganhou 4 quadros em branco por unidade (cabeçalho cinza, linhas mais altas para escrever). Não conferido em impressora.

## Fase 224 — Cadastro de unidades: filtro por situação

- Substitui "Esconder inativas" por **Ativas / Inativas / Todas** (padrão: ativas), igual ao de clientes. A rota `GET /cadastros/clientes/unidades` aceita `situacao=ATIVO|INATIVO|TODOS` ("ativa" = unidade ativa **e** cliente ativo, como o filtro antigo; `esconder=1` continua valendo). SQL não testado em MySQL real.

## Fase 223 — Cadastro de clientes: filtro por situação

- A lista abre só com clientes **ativos**; botões **Ativos / Inativos / Todos** na barra. Trocar o filtro leva o foco ao primeiro cliente da lista filtrada. Filtro no cliente (a rota não mudou). Não testado em tela real.

## Fase 222 — Devolução: acesso e conferência da NF-e referenciada

- Na seção "NFe referenciada" da devolução: para cada chave, resumo da nota original (nº/série, emissão, cliente, situação), botão **🔍 Ver nota original** (janela somente leitura com itens e total) e sugestão das notas do mesmo cliente.
- Conferências: chave de 44 dígitos com DV, mesmo destinatário, original não cancelada/autorizada (bloqueiam a autorização); avisos para produto fora da original, quantidade maior e devolução duplicada.
- Na nota **original** (ex.: DEVOLVIDO) aparece o cartão **↩ Devolução gerada** com o botão **🔍 Ver devolução** (notas cuja referência é a chave desta nota).
- Rota `GET /api/nfe/:id/referencia-analise` (devolve também `devolucoes`). Não testado contra MySQL/SEFAZ reais.

## Fase 221 — Diária: painel do item mais enxuto
- A linha do topo do painel ("Alterando item · cliente · data · F5 salva · Esc cancela") virou um **painel na lateral direita** do próprio formulário (badge, cliente, data, "não salvo" e as teclas F5/Esc): ganha-se uma linha.
- **Memos** (Anotações p/ faturamento e Informe p/ produção) bem mais estreitos e baixos; campos de 32 px, espaçamentos e margens reduzidos — o painel ficou menor sem mexer na fonte do sistema antigo.
